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

interface CustomRequest extends Request {
  user?: {
    userId: number;
  };
}

export const redeemPoint = async (req: CustomRequest, res: Response) => {
  const { product_id, points_spent, shipping_address, fullname, email, phone_number, postal_code, notes } = req.body;
  const user_id = req.user?.userId as number

  const transaction = await sequelize.transaction();

  try {
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
    }, { transaction })

    const user = await User.findByPk(user_id, { transaction });
    const product = await Product.findByPk(product_id, { transaction });

    if (user && product) {
      user.total_points = (user.total_points || 0) - points_spent;
      await user.save({ transaction });
    }

    if (product) {
      product.stock_quantity = (product.stock_quantity || 0) - 1;
      await product.save({ transaction });
    }

    await UserAction.create({
      user_id: user_id,
      entity_type: 'REDEEM',
      action_type: req.method,
      redemption_id: redemption.redemption_id,
      // ip_address: req.ip,
      // user_agent: req.get('User-Agent'),
    }, { transaction });

    await transaction.commit();

    res.status(200).json({ message: 'Success redeem', status: res.status });
  } catch (error: any) {
    await transaction.rollback();
    console.error('Error redeem points', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
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
          [Op.in]: ['active', 'approved'] // Only check active or approved redemptions
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
