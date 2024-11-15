import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';

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
      notes
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

    let htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'redeemEmail.html'), 'utf-8');

    htmlTemplate = htmlTemplate
      .replace('{{redemptionDate}}', dayjs(redemption.createdAt).format('DD MMM YYYY'))
      .replace('{{redemptionItem}}', product!.name)
      .replace('{{partnerName}}', fullname)
      .replace('{{email}}', email)
      .replace('{{phoneNumber}}', phone_number)
      .replace('{{address}}', shipping_address)
      .replace('{{postalCode}}', postal_code)
      .replace('{{accomplishmentScore}}', String(user?.accomplishment_total_points ?? 'N/A'))
      .replace('{{currentScore}}', String(user?.total_points ?? 'N/A'));

    await sendEmail({ to: email, subject: 'Lenovo Go Pro Redemption Notification', html: htmlTemplate });

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
      ]
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
