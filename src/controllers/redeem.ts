import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import { Op } from 'sequelize';

import { Redemption } from '../../models/Redemption';
import { User } from '../../models/User';
import { UserAction } from '../../models/UserAction';
import { sequelize } from '../db';
import { sendEmail } from '../services/mail';
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

export const redeemList = async (req: Request, res: Response) => {
  try {
    const list = await Redemption.findAll({
      include: [
        {
          model: User,
          attributes: ['username']
        },
        {
          model: Product,
        }
      ],
      order: [['createdAt', 'ASC']],
    });
    res.status(200).json({ message: 'Redemption list', status: res.status, data: list });
  } catch (error: any) {
    console.error('Error delete user:', error);

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
    const redeemDetail = await Redemption.findByPk(redemption_id)

    if (!redeemDetail) {
      return res.status(404).json({ message: 'Redeem data not found' });
    }

    const user = await User.findByPk(redeemDetail.user_id);

    if (!user) {
      return res.status(404).json({ message: 'User data not found' });
    }

    const productDetail = await Product.findByPk(redeemDetail.product_id)

    if (!productDetail) {
      return res.status(404).json({ message: 'Product data not found' });
    }

    // Create point transaction record for returned points
    await PointTransaction.create({
      user_id: user.user_id,
      points: redeemDetail.points_spent,
      transaction_type: 'adjust',
      redemption_id: redemption_id,
      description: `Returned ${redeemDetail.points_spent} points from rejected redemption of ${productDetail.name}`
    }, { transaction });

    user.total_points = (user.total_points || 0) + redeemDetail.points_spent;
    redeemDetail.status = 'rejected'
    productDetail.stock_quantity = (productDetail.stock_quantity || 0) + 1;

    await redeemDetail.save({ transaction });
    await user.save({ transaction });
    await productDetail.save({ transaction });

    await transaction.commit();

    let htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'redeemRejection.html'), 'utf-8');

    htmlTemplate = htmlTemplate
      .replace('{{username}}', user!.username)

    await sendEmail({ to: redeemDetail.email, subject: 'Update on Your Redemption Process', html: htmlTemplate });

    res.status(200).json({ message: 'Redeem process rejected', status: res.status });
  } catch (error: any) {
    await transaction.rollback();
    console.error('Error reject redemption:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}

export const approveRedeem = async (req: Request, res: Response) => {
  const { redemption_id } = req.body;
  const transaction = await sequelize.transaction();
  try {
    const redeemDetail = await Redemption.findByPk(redemption_id)

    if (!redeemDetail) {
      return res.status(404).json({ message: 'Redeem data not found' });
    }

    const user = await User.findByPk(redeemDetail.user_id);

    if (!user) {
      return res.status(404).json({ message: 'User data not found' });
    }

    const productDetail = await Product.findByPk(redeemDetail.product_id)

    if (!productDetail) {
      return res.status(404).json({ message: 'Product data not found' });
    }

    redeemDetail.status = 'approved'

    await redeemDetail.save({ transaction });

    let htmlTemplate;
    let emailSubject;

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
        .replace('{{redemptionItem}}', productDetail!.name)
        .replace('{{partnerName}}', redeemDetail.fullname)
        .replace('{{email}}', redeemDetail.email)
        .replace('{{phoneNumber}}', redeemDetail.phone_number)
        .replace('{{address}}', redeemDetail.shipping_address)
        .replace('{{postalCode}}', redeemDetail.postal_code)
        .replace('{{accomplishmentScore}}', String(user?.accomplishment_total_points ?? 'N/A'))
        .replace('{{currentScore}}', String(user?.total_points ?? 'N/A'));
      emailSubject = 'Lenovo Go Pro Redemption Notification';
    }

    await sendEmail({ to: redeemDetail.email, subject: emailSubject, html: htmlTemplate });

    await transaction.commit();

    res.status(200).json({ message: 'Redeem process approved', status: res.status });
  } catch (error: any) {
    await transaction.rollback();
    console.error('Error approve redemption:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
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
