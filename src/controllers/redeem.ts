import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import { Op } from 'sequelize';
import ExcelJS from 'exceljs';

import { Redemption } from '../../models/Redemption';
import { User } from '../../models/User';
import { UserAction } from '../../models/UserAction';
import { sequelize } from '../db';
import { sendEmail } from '../services/brevo';
import { Product } from '../../models/Product';
import { PointTransaction } from '../../models/PointTransaction';
import { CustomRequest, RedeemPointRequest, RedeemPointResponse } from '../types/api';

export const redeemPoint = async (req: CustomRequest, res: Response) => {
  const { product_id, points_spent, shipping_address, fullname, email, phone_number, postal_code, notes }: RedeemPointRequest = req.body;
  const user_id = req.user?.userId as number;

  const transaction = await sequelize.transaction();

  try {
    // Input validation
    if (!product_id || !shipping_address || !fullname || !email || !phone_number || !postal_code) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Missing required fields',
        errors: {
          product_id: !product_id ? 'Product ID is required' : null,
          points_spent: !points_spent ? 'Points spent is required' : null,
          shipping_address: !shipping_address ? 'Shipping address is required' : null,
          fullname: !fullname ? 'Full name is required' : null,
          email: !email ? 'Email is required' : null,
          phone_number: !phone_number ? 'Phone number is required' : null,
          postal_code: !postal_code ? 'Postal code is required' : null
        }
      });
    }

    // Check if user has enough points
    const user = await User.findByPk(user_id, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    if ((user.total_points || 0) < points_spent) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Insufficient points',
        current_points: user.total_points,
        required_points: points_spent
      });
    }

    // Check if product exists and has stock
    const product = await Product.findByPk(product_id, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    if ((product.stock_quantity || 0) <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Product is out of stock' });
    }

    // Create redemption record
    const redemption = await Redemption.create({
      user_id,
      product_id,
      points_spent,
      shipping_address,
      fullname,
      email,
      phone_number,
      postal_code,
      notes,
      status: 'active'
    }, { transaction });

    // Create point transaction record
    await PointTransaction.create({
      user_id: user.user_id,
      points: -points_spent,
      transaction_type: 'spend',
      redemption_id: redemption.redemption_id,
      description: `Spent ${points_spent} points to redeem ${product.name}`
    }, { transaction });

    // Update user points
    user.total_points = (user.total_points || 0) - points_spent;
    await user.save({ transaction });

    // Update product stock
    product.stock_quantity = (product.stock_quantity || 0) - 1;
    await product.save({ transaction });

    // Create user action record
    await UserAction.create({
      user_id: user_id,
      entity_type: 'REDEEM',
      action_type: req.method,
      redemption_id: redemption.redemption_id,
    }, { transaction });

    await transaction.commit();

    const response: RedeemPointResponse = {
      message: 'Redemption successful',
      redemption_id: redemption.redemption_id,
      remaining_points: user.total_points,
      status: res.statusCode
    };

    res.status(200).json(response);
  } catch (error: any) {
    await transaction.rollback();
    console.error('Error in redemption process:', error);

    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: messages 
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        message: 'Duplicate entry error',
        errors: error.errors.map((err: any) => err.message)
      });
    }

    res.status(500).json({ 
      message: 'An error occurred during redemption',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const redeemReferralPoint = async (req: CustomRequest, res: Response) => {
  const user_id = req.user?.userId as number;
  
  // Hardcoded values for referral redemption
  const product_id = 1;
  const notes = 'REFERRAL';
  const shipping_address = 'voucher';
  const postal_code = 'voucher';

  const transaction = await sequelize.transaction();

  try {
    // Get user data from database
    const user = await User.findByPk(user_id, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    // Get fullname, email, and phone_number from user data
    const fullname = user.fullname || '';
    const email = user.email || '';
    const phone_number = user.phone_number || '';

    // Get the product
    const product = await Product.findByPk(product_id, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Referral product not found' });
    }

    // Check product stock
    if ((product.stock_quantity || 0) <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Referral product is out of stock' });
    }

    // Create redemption record with 0 points_spent since we're not deducting points
    const redemption = await Redemption.create({
      user_id,
      product_id,
      points_spent: 0,
      shipping_address,
      fullname,
      email,
      phone_number,
      postal_code,
      notes,
      status: 'active'
    }, { transaction });

    // Update product stock
    product.stock_quantity = (product.stock_quantity || 0) - 1;
    await product.save({ transaction });

    // Create user action record
    await UserAction.create({
      user_id: user_id,
      entity_type: 'REDEEM',
      action_type: req.method,
      redemption_id: redemption.redemption_id,
    }, { transaction });

    await transaction.commit();

    const response = {
      message: 'Referral redemption successful',
      status: res.statusCode
    };

    res.status(200).json(response);
  } catch (error: any) {
    await transaction.rollback();
    console.error('Error in referral redemption process:', error);

    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: messages 
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        message: 'Duplicate entry error',
        errors: error.errors.map((err: any) => err.message)
      });
    }

    res.status(500).json({ 
      message: 'An error occurred during referral redemption',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const redeemList = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, status, start_date, end_date, product_id, notes } = req.query;

    // Validate page and limit
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        message: "Page must be a positive integer",
        status: 400
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        message: "Limit must be a positive integer between 1 and 100",
        status: 400
      });
    }

    // Validate status if provided
    if (status && !['active', 'approved', 'rejected'].includes(status as string)) {
      return res.status(400).json({
        message: "Status must be either 'active', 'approved', or 'rejected'",
        status: 400
      });
    }

    // Validate product_id if provided
    let productId: number | undefined;
    if (product_id) {
      productId = parseInt(product_id as string, 10);
      if (isNaN(productId) || productId < 1) {
        return res.status(400).json({
          message: "Product ID must be a positive integer",
          status: 400
        });
      }
    }

    // Validate date parameters if provided
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (start_date) {
      startDate = new Date(start_date as string);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          message: "Invalid start_date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)",
          status: 400
        });
      }
    }

    if (end_date) {
      endDate = new Date(end_date as string);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({
          message: "Invalid end_date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)",
          status: 400
        });
      }
    }

    // Validate that start_date is before end_date if both are provided
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({
        message: "start_date must be before or equal to end_date",
        status: 400
      });
    }

    // Build where clause
    const whereClause: any = {};

    if (status) {
      whereClause.status = status;
    }

    if (productId) {
      whereClause.product_id = productId;
    }

    if (notes) {
      whereClause.notes = {
        [Op.like]: notes
      };
    }

    // Add date range filtering
    if (startDate || endDate) {
      whereClause.createdAt = {};
      
      if (startDate) {
        whereClause.createdAt[Op.gte] = startDate;
      }
      
      if (endDate) {
        // Set end date to end of day if only date is provided (no time)
        const endOfDay = new Date(endDate);
        if (endDate.getHours() === 0 && endDate.getMinutes() === 0 && endDate.getSeconds() === 0) {
          endOfDay.setHours(23, 59, 59, 999);
        }
        whereClause.createdAt[Op.lte] = endOfDay;
      }
    }

    // Calculate offset
    const offset = (pageNum - 1) * limitNum;

    // Get redemptions with pagination
    const { count, rows: redemptions } = await Redemption.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          attributes: ['username', 'email']
        },
        {
          model: Product,
        }
      ],
      limit: limitNum,
      offset: offset,
      order: [['createdAt', 'DESC']]
    });

    // Calculate pagination info
    const totalPages = Math.ceil(count / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      message: 'Redemption list retrieved successfully',
      data: redemptions,
      pagination: {
        current_page: pageNum,
        total_pages: totalPages,
        total_items: count,
        items_per_page: limitNum,
        has_next_page: hasNextPage,
        has_prev_page: hasPrevPage
      },
      status: 200
    });
  } catch (error: any) {
    console.error('Error getting redemption list:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}

export const getUserRedemptionList = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { status, start_date, end_date, product_id, notes } = req.query;

    // Validate status if provided
    if (status && !['active', 'approved', 'rejected'].includes(status as string)) {
      return res.status(400).json({
        message: "Status must be either 'active', 'approved', or 'rejected'",
        status: 400
      });
    }

    // Validate product_id if provided
    let productId: number | undefined;
    if (product_id) {
      productId = parseInt(product_id as string, 10);
      if (isNaN(productId) || productId < 1) {
        return res.status(400).json({
          message: "Product ID must be a positive integer",
          status: 400
        });
      }
    }

    // Validate date parameters if provided
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (start_date) {
      startDate = new Date(start_date as string);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          message: "Invalid start_date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)",
          status: 400
        });
      }
    }

    if (end_date) {
      endDate = new Date(end_date as string);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({
          message: "Invalid end_date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)",
          status: 400
        });
      }
    }

    // Validate that start_date is before end_date if both are provided
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({
        message: "start_date must be before or equal to end_date",
        status: 400
      });
    }

    // Build where clause - filter by authenticated user
    const whereClause: any = {
      user_id: userId
    };

    if (status) {
      whereClause.status = status;
    }

    if (productId) {
      whereClause.product_id = productId;
    }

    if (notes) {
      whereClause.notes = {
        [Op.like]: notes
      };
    }

    // Add date range filtering
    if (startDate || endDate) {
      whereClause.createdAt = {};
      
      if (startDate) {
        whereClause.createdAt[Op.gte] = startDate;
      }
      
      if (endDate) {
        // Set end date to end of day if only date is provided (no time)
        const endOfDay = new Date(endDate);
        if (endDate.getHours() === 0 && endDate.getMinutes() === 0 && endDate.getSeconds() === 0) {
          endOfDay.setHours(23, 59, 59, 999);
        }
        whereClause.createdAt[Op.lte] = endOfDay;
      }
    }

    // Get all redemptions for the authenticated user
    const redemptions = await Redemption.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          attributes: ['user_id', 'username', 'fullname', 'email', 'user_type', 'company_id'],
          required: true
        },
        {
          model: Product,
          attributes: ['product_id', 'name', 'points_required', 'stock_quantity', 'image_url'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Transform the response
    const transformedRedemptions = redemptions.map(redemption => {
      const plainRedemption = redemption.get({ plain: true }) as any;
      return {
        redemption_id: plainRedemption.redemption_id,
        user: {
          user_id: plainRedemption.user.user_id,
          username: plainRedemption.user.username,
          fullname: plainRedemption.user.fullname,
          email: plainRedemption.user.email,
          user_type: plainRedemption.user.user_type,
          company_id: plainRedemption.user.company_id
        },
        product: plainRedemption.product ? {
          product_id: plainRedemption.product.product_id,
          name: plainRedemption.product.name,
          points_required: plainRedemption.product.points_required,
          stock_quantity: plainRedemption.product.stock_quantity,
          image_url: plainRedemption.product.image_url
        } : null,
        points_spent: plainRedemption.points_spent,
        shipping_address: plainRedemption.shipping_address,
        fullname: plainRedemption.fullname,
        email: plainRedemption.email,
        phone_number: plainRedemption.phone_number,
        postal_code: plainRedemption.postal_code,
        notes: plainRedemption.notes,
        status: plainRedemption.status,
        note: plainRedemption.note,
        created_at: dayjs(plainRedemption.createdAt).format('DD MMM YYYY HH:mm'),
        updated_at: dayjs(plainRedemption.updatedAt).format('DD MMM YYYY HH:mm')
      };
    });

    res.status(200).json({
      message: 'User redemption list retrieved successfully',
      data: transformedRedemptions,
      status: 200
    });
  } catch (error: any) {
    console.error('Error getting user redemption list:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}

export const rejectRedeem = async (req: Request, res: Response) => {
  const { redemption_id } = req.body;
  const transaction = await sequelize.transaction();
  
  try {
    if (!redemption_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Redemption ID is required' });
    }

    // Step 1: Get redemption data first, then get related data in parallel
    const redeemDetail = await Redemption.findByPk(redemption_id, { 
      transaction,
      attributes: ['redemption_id', 'user_id', 'product_id', 'points_spent', 'email', 'status']
    });

    if (!redeemDetail) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Redeem data not found' });
    }

    // Step 2: Get related data in parallel
    const [user, productDetail] = await Promise.all([
      User.findByPk(redeemDetail.user_id, { 
        transaction,
        attributes: ['user_id', 'username', 'email', 'total_points', 'accomplishment_total_points', 'lifetime_total_points']
      }),
      Product.findByPk(redeemDetail.product_id, { 
        transaction,
        attributes: ['product_id', 'name', 'stock_quantity']
      })
    ]);

    // Validate all required data exists
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ message: 'User data not found' });
    }

    if (!productDetail) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product data not found' });
    }

    // Step 2: Create point transaction record for returned points
    await PointTransaction.create({
      user_id: user.user_id,
      points: redeemDetail.points_spent,
      transaction_type: 'adjust',
      redemption_id: redemption_id,
      description: `Returned ${redeemDetail.points_spent} points from rejected redemption of ${productDetail.name}`
    }, { transaction });

    // Step 3: Update all entities in parallel using atomic operations
    await Promise.all([
      // Update redemption status
      Redemption.update(
        { status: 'rejected' },
        { where: { redemption_id }, transaction }
      ),
      // Update user points atomically
      User.update({
        total_points: sequelize.literal(`total_points + ${redeemDetail.points_spent}`),
        accomplishment_total_points: sequelize.literal(`accomplishment_total_points + ${redeemDetail.points_spent}`),
        lifetime_total_points: sequelize.literal(`lifetime_total_points + ${redeemDetail.points_spent}`)
      }, {
        where: { user_id: user.user_id },
        transaction
      }),
      // Update product stock atomically
      Product.update({
        stock_quantity: sequelize.literal(`stock_quantity + 1`)
      }, {
        where: { product_id: productDetail.product_id },
        transaction
      })
    ]);

    // Step 4: Commit transaction first
    await transaction.commit();

    // Step 5: Send email asynchronously (outside transaction)
    setImmediate(async () => {
      try {
        let htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'redeemRejection.html'), 'utf-8');

        htmlTemplate = htmlTemplate.replace('{{username}}', user.username);

        sendEmail({ to: redeemDetail.email, cc: 'gopro-lenovo.team@fokustarget.com', subject: 'Update on Your Redemption Process', html: htmlTemplate }).catch(err => {
          console.error('Email failed:', err);
        });
      } catch (emailError) {
        console.error('Error sending rejection email:', emailError);
        // Don't fail the main operation if email fails
      }
    });

    res.status(200).json({ 
      message: 'Redeem process rejected', 
      status: 200,
      points_returned: redeemDetail.points_spent
    });

  } catch (error: any) {
    await transaction.rollback();
    console.error('Error reject redemption:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ 
      message: 'Something went wrong', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export const approveRedeem = async (req: Request, res: Response) => {
  const { redemption_id } = req.body;
  const transaction = await sequelize.transaction();
  
  try {
    if (!redemption_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Redemption ID is required' });
    }

    // Step 1: Get redemption data first, then get related data in parallel
    const redeemDetail = await Redemption.findByPk(redemption_id, { 
      transaction,
      attributes: ['redemption_id', 'user_id', 'product_id', 'email', 'fullname', 'phone_number', 'shipping_address', 'postal_code', 'createdAt']
    });

    if (!redeemDetail) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Redeem data not found' });
    }

    // Step 2: Get related data in parallel
    const [user, productDetail] = await Promise.all([
      User.findByPk(redeemDetail.user_id, { 
        transaction,
        attributes: ['user_id', 'username', 'email', 'total_points', 'accomplishment_total_points']
      }),
      Product.findByPk(redeemDetail.product_id, { 
        transaction,
        attributes: ['product_id', 'name']
      })
    ]);

    // Validate all required data exists
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ message: 'User data not found' });
    }

    if (!productDetail) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product data not found' });
    }

    // Step 3: Update redemption status atomically
    await Redemption.update(
      { status: 'approved' },
      { where: { redemption_id }, transaction }
    );

    // Step 4: Commit transaction first
    await transaction.commit();

    // Step 5: Send email asynchronously (outside transaction)
    setImmediate(async () => {
      try {
        let htmlTemplate: string;
        let emailSubject: string;

        if (redeemDetail.product_id === 7) {
          // Use redeemConfirmation.html for Starbucks E-Voucher
          htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'redeemConfirmation.html'), 'utf-8');
          htmlTemplate = htmlTemplate.replace('{{username}}', user.username);
          emailSubject = 'Welcome to Lenovo Go Pro Phase 2 - Starbucks E-Voucher Processing';
        } else {
          // Use regular redeemEmail.html for other products
          htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'redeemEmail.html'), 'utf-8');
          htmlTemplate = htmlTemplate
            .replace('{{redemptionDate}}', dayjs(redeemDetail.createdAt).format('DD MMM YYYY HH:mm'))
            .replace('{{redemptionItem}}', productDetail.name)
            .replace('{{partnerName}}', redeemDetail.fullname)
            .replace('{{email}}', redeemDetail.email)
            .replace('{{phoneNumber}}', redeemDetail.phone_number)
            .replace('{{address}}', redeemDetail.shipping_address)
            .replace('{{postalCode}}', redeemDetail.postal_code)
            .replace('{{accomplishmentScore}}', String(user.accomplishment_total_points ?? 'N/A'))
            .replace('{{currentScore}}', String(user.total_points ?? 'N/A'));
          emailSubject = 'Lenovo Go Pro Redemption Notification';
        }

        sendEmail({ to: redeemDetail.email, cc: 'gopro-lenovo.team@fokustarget.com', subject: emailSubject, html: htmlTemplate }).catch(err => {
          console.error('Email failed:', err);
        });
      } catch (emailError) {
        console.error('Error sending approval email:', emailError);
        // Don't fail the main operation if email fails
      }
    });

    res.status(200).json({ 
      message: 'Redeem process approved', 
      status: 200,
      product_name: productDetail.name
    });

  } catch (error: any) {
    await transaction.rollback();
    console.error('Error approve redemption:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ 
      message: 'Something went wrong', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export const checkUserRedeemStatus = async (req: CustomRequest, res: Response) => {
  const user_id = req.user?.userId as number;
  
  try {
    const redemption = await Redemption.findOne({
      where: {
        user_id,
        product_id: 7,
        status: {
          [Op.in]: ['active', 'approved', 'rejected'] // Only check active or approved redemptions
        }
      }
    });

    res.status(200).json({
      message: 'Redemption check successful',
      has_redeemed: !!redemption,
    });
  } catch (error: any) {
    console.error('Error checking redemption status:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const downloadRedeem = async (req: Request, res: Response) => {
  try {
    const { status, start_date, end_date, product_id } = req.query;

    // Validate status if provided
    if (status && !['active', 'approved', 'rejected'].includes(status as string)) {
      return res.status(400).json({
        message: "Status must be either 'active', 'approved', or 'rejected'",
        status: 400
      });
    }

    // Validate product_id if provided
    let productId: number | undefined;
    if (product_id) {
      productId = parseInt(product_id as string, 10);
      if (isNaN(productId) || productId < 1) {
        return res.status(400).json({
          message: "Product ID must be a positive integer",
          status: 400
        });
      }
    }

    // Validate date parameters if provided
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (start_date) {
      startDate = new Date(start_date as string);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          message: "Invalid start_date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)",
          status: 400
        });
      }
    }

    if (end_date) {
      endDate = new Date(end_date as string);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({
          message: "Invalid end_date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)",
          status: 400
        });
      }
    }

    // Validate that start_date is before end_date if both are provided
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({
        message: "start_date must be before or equal to end_date",
        status: 400
      });
    }

    // Build where clause (same logic as redeemList)
    const whereClause: any = {};

    if (status) {
      whereClause.status = status;
    }

    if (productId) {
      whereClause.product_id = productId;
    }

    // Add date range filtering
    if (startDate || endDate) {
      whereClause.createdAt = {};
      
      if (startDate) {
        whereClause.createdAt[Op.gte] = startDate;
      }
      
      if (endDate) {
        // Set end date to end of day if only date is provided (no time)
        const endOfDay = new Date(endDate);
        if (endDate.getHours() === 0 && endDate.getMinutes() === 0 && endDate.getSeconds() === 0) {
          endOfDay.setHours(23, 59, 59, 999);
        }
        whereClause.createdAt[Op.lte] = endOfDay;
      }
    }

    // Get all redemptions (no pagination for export)
    const redemptions = await Redemption.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          attributes: ['username', 'email', 'fullname']
        },
        {
          model: Product,
          attributes: ['name', 'points_required', 'stock_quantity']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Redemption Data');

    // Define columns
    worksheet.columns = [
      { header: 'Redemption ID', key: 'redemption_id', width: 15 },
      { header: 'Product ID', key: 'product_id', width: 12 },
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Full Name', key: 'fullname', width: 25 },
      { header: 'Product Name', key: 'product_name', width: 30 },
      { header: 'Points Spent', key: 'points_spent', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Phone Number', key: 'phone_number', width: 18 },
      { header: 'Postal Code', key: 'postal_code', width: 15 },
      { header: 'Shipping Address', key: 'shipping_address', width: 40 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20 },
      { header: 'Updated At', key: 'updated_at', width: 20 }
    ];

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    redemptions.forEach(redemption => {
      const plainRedemption = redemption.get({ plain: true }) as any;
      
      worksheet.addRow({
        redemption_id: plainRedemption.redemption_id,
        product_id: plainRedemption.product_id,
        username: plainRedemption.user?.username || 'N/A',
        email: plainRedemption.email,
        fullname: plainRedemption.fullname,
        product_name: plainRedemption.product?.name || 'N/A',
        points_spent: plainRedemption.points_spent,
        status: plainRedemption.status,
        phone_number: plainRedemption.phone_number,
        postal_code: plainRedemption.postal_code,
        shipping_address: plainRedemption.shipping_address,
        notes: plainRedemption.notes || '',
        created_at: dayjs(plainRedemption.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        updated_at: dayjs(plainRedemption.updatedAt).format('YYYY-MM-DD HH:mm:ss')
      });
    });

    // Auto-fit columns
    worksheet.columns.forEach((column: any) => {
      if (column.width) {
        column.width = Math.min(column.width, 50); // Cap at 50 characters
      }
    });

    // Generate filename with timestamp
    const timestamp = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const filename = `redemption_data_${timestamp}.xlsx`;

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write the workbook to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error: any) {
    console.error('Error downloading redemption data:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ 
      message: 'Something went wrong while downloading redemption data', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
