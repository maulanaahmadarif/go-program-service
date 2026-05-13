import { Request, Response } from 'express';
import { User } from '../../models/User';
import { CoinTransaction } from '../../models/CoinTransaction';
import { Product } from '../../models/Product';
import { Redemption } from '../../models/Redemption';
import { UserAction } from '../../models/UserAction';
import { sequelize } from '../db';
import { getCoinRedemptionProductIds } from '../config/coinRedemption';
import { getStockAllocationAvailability } from '../services/productStockAllocation';
import { isDailyCheckinProgramOpen } from '../services/dailyCheckinWindow';

function resolveUserId(req: Request): number | null {
  const u = (req as any).user;
  const id = u?.userId ?? u?.user_id;
  if (id == null || Number.isNaN(Number(id))) return null;
  return Number(id);
}

export const redeemCoin = async (req: Request, res: Response): Promise<void> => {
  const transaction = await sequelize.transaction();
  try {
    const user_id = resolveUserId(req);
    if (!user_id) {
      await transaction.rollback();
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const { product_id, shipping_address, fullname, email, phone_number, postal_code, notes } = req.body;
    const pid = Number(product_id);
    if (!Number.isInteger(pid) || pid <= 0) {
      await transaction.rollback();
      res.status(400).json({ message: 'Invalid product_id' });
      return;
    }

    const user = await User.findByPk(user_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) {
      await transaction.rollback();
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (!isDailyCheckinProgramOpen()) {
      await transaction.rollback();
      res.status(400).json({ message: 'Coin redemption has ended for this campaign' });
      return;
    }

    const product = await Product.findByPk(pid, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!product) {
      await transaction.rollback();
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    const coinCatalogIds = getCoinRedemptionProductIds();
    if (coinCatalogIds.length > 0 && !coinCatalogIds.includes(pid)) {
      await transaction.rollback();
      res.status(400).json({ message: 'This product is not available for coin redemption' });
      return;
    }

    if (!product.is_active) {
      await transaction.rollback();
      res.status(400).json({ message: 'Product is inactive' });
      return;
    }

    const coinStock = await getStockAllocationAvailability(pid, 'coin', transaction);
    if (coinStock.allocation && (coinStock.availableStock ?? 0) <= 0) {
      await transaction.rollback();
      res.status(400).json({ message: 'Product is out of stock for coin redemption' });
      return;
    }
    if (!coinStock.allocation && coinStock.hasAnyAllocation) {
      await transaction.rollback();
      res.status(400).json({ message: 'Product is not allocated for coin redemption' });
      return;
    }
    if (!coinStock.allocation && (product.stock_quantity || 0) <= 0) {
      await transaction.rollback();
      res.status(400).json({ message: 'Product is out of stock or inactive' });
      return;
    }

    const coinsRequired = product.coins_required || 0;
    if (coinsRequired <= 0) {
      await transaction.rollback();
      res.status(400).json({ message: 'This product cannot be redeemed with coins' });
      return;
    }

    if ((user.total_coins || 0) < coinsRequired) {
      await transaction.rollback();
      res.status(400).json({ message: 'Insufficient coins' });
      return;
    }

    const redemption = await Redemption.create({
      user_id,
      product_id: pid,
      points_spent: 0,
      coins_spent: coinsRequired,
      fullname,
      email,
      phone_number,
      shipping_address,
      postal_code,
      notes,
      status: 'active'
    }, { transaction });

    const coinTx = await CoinTransaction.create({
      user_id,
      redemption_id: redemption.redemption_id,
      coins: -coinsRequired,
      transaction_type: 'spend',
      description: `Redeemed ${product.name}`
    }, { transaction });

    user.total_coins = (user.total_coins || 0) - coinsRequired;
    await user.save({ transaction });

    if (coinStock.allocation) {
      coinStock.allocation.used_stock = (coinStock.allocation.used_stock || 0) + 1;
      await coinStock.allocation.save({ transaction });
    } else {
      product.stock_quantity = (product.stock_quantity || 0) - 1;
      await product.save({ transaction });
    }

    await UserAction.create({
      user_id,
      entity_type: 'REDEEM',
      action_type: 'COIN_REDEEM',
      redemption_id: redemption.redemption_id,
      coin_transaction_id: coinTx.transaction_id,
      note: `Spent ${coinsRequired} coins — ${product.name}`,
    }, { transaction });

    await transaction.commit();

    res.status(200).json({
      status: 'success',
      data: redemption
    });

  } catch (error: any) {
    await transaction.rollback();
    res.status(500).json({ message: error.message });
  }
};

export const getCoinTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const user_id = resolveUserId(req);
    if (!user_id) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;

    if (page < 1) {
      res.status(400).json({ message: 'Page must be a positive integer' });
      return;
    }

    if (limit < 1 || limit > 100) {
      res.status(400).json({ message: 'Limit must be between 1 and 100' });
      return;
    }

    const offset = (page - 1) * limit;

    const { count, rows: transactions } = await CoinTransaction.findAndCountAll({
      where: { user_id },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit) || 1;

    res.status(200).json({
      status: 'success',
      data: transactions,
      pagination: {
        total_items: count,
        total_pages: totalPages,
        current_page: page,
        items_per_page: limit,
        has_next: page < totalPages,
        has_previous: page > 1,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
