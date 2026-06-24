import { Request, Response } from 'express';
import { Product } from '../../models/Product';
import { CustomRequest } from '../types/api';
import { Op } from 'sequelize';
import { getEffectiveStockForFlow } from '../services/productStockAllocation';
import { getCoinRedemptionProductIds } from '../config/coinRedemption';

export const getProductList = async (req: CustomRequest, res: Response) => {
  try {
    const { is_active = true, product_id } = req.query;

    const coinRedemption =
      req.query.coin_redemption === 'true' || req.query.coin_redemption === '1';
    /** Referral e-voucher claim on profile (product #1): use `referral` allocation pool */
    const referralRedemption =
      req.query.referral_redemption === 'true' || req.query.referral_redemption === '1';
    /** Points redeem page: omit coin-only SKUs (currency_type === 'coin'). Use with redeem.tsx */
    const pointsRedemption =
      req.query.points_redemption === 'true' || req.query.points_redemption === '1';

    const whereClause: any = {
      is_active: is_active
    };

    if (coinRedemption) {
      const whitelist = getCoinRedemptionProductIds();
      if (whitelist.length > 0) {
        whereClause.product_id = { [Op.in]: whitelist };
      } else {
        whereClause[Op.or] = [
          { coins_required: { [Op.gt]: 0 } },
          { currency_type: { [Op.in]: ['coin', 'both'] } },
        ];
      }
    } else if (pointsRedemption) {
      whereClause[Op.and] = [
        {
          [Op.or]: [
            { currency_type: { [Op.in]: ['point', 'both'] } },
            { currency_type: { [Op.is]: null } },
          ],
        },
        { points_required: { [Op.gt]: 0 } },
      ];
    } else if (product_id) {
      whereClause.product_id = product_id;
    }

    const order: [string, string][] = coinRedemption
      ? [['coins_required', 'ASC']]
      : [['points_required', 'ASC']];

    const products = await Product.findAll({
      where: whereClause,
      order,
    });

    const flowForStock = coinRedemption
      ? 'coin'
      : referralRedemption
        ? 'referral'
        : 'redeem';

    const productsWithFlowStock = await Promise.all(products.map(async (product) => {
      const plainProduct = product.get({ plain: true });
      const stock_quantity = await getEffectiveStockForFlow(
        product.product_id,
        flowForStock,
        plainProduct.stock_quantity
      );

      return {
        ...plainProduct,
        stock_quantity,
      };
    }));

    res.status(200).json({ message: 'Product list', status: res.status, data: productsWithFlowStock });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching products');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      req.log.error({ validationErrors: messages }, 'Validation error occurred');
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};