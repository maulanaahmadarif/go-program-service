import { Transaction } from 'sequelize';

import { ProductStockAllocation, ProductStockFlowType } from '../../models/ProductStockAllocation';

export { ProductStockFlowType };

export const getAllocationAvailableStock = (allocation: ProductStockAllocation) =>
  Math.max(0, (allocation.allocated_stock || 0) - (allocation.used_stock || 0) - (allocation.reserved_stock || 0));

export const findLockedStockAllocation = (
  productId: number,
  flowType: ProductStockFlowType,
  transaction: Transaction
) =>
  ProductStockAllocation.findOne({
    where: {
      product_id: productId,
      flow_type: flowType,
      is_active: true,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

export const hasActiveStockAllocations = async (
  productId: number,
  transaction?: Transaction
) => {
  const count = await ProductStockAllocation.count({
    where: {
      product_id: productId,
      is_active: true,
    },
    transaction,
  });

  return count > 0;
};

export const getStockAllocationAvailability = async (
  productId: number,
  flowType: ProductStockFlowType,
  transaction: Transaction
) => {
  const allocation = await findLockedStockAllocation(productId, flowType, transaction);
  if (allocation) {
    return {
      allocation,
      hasAnyAllocation: true,
      availableStock: getAllocationAvailableStock(allocation),
    };
  }

  return {
    allocation: null,
    hasAnyAllocation: await hasActiveStockAllocations(productId, transaction),
    availableStock: null,
  };
};

export const getProductFlowAvailableStock = async (
  productId: number,
  flowType: ProductStockFlowType
) => {
  const allocation = await ProductStockAllocation.findOne({
    where: {
      product_id: productId,
      flow_type: flowType,
      is_active: true,
    },
  });

  if (!allocation) return null;

  return getAllocationAvailableStock(allocation);
};

/**
 * Stock shown for a channel (redeem vs coin). If the product uses allocation rows for any flow,
 * each channel must have its own row for split pools (`currency_type: 'both'`); missing row ⇒ 0.
 * If there are no allocation rows at all, falls back to `products.stock_quantity` (shared pool).
 */
export const getEffectiveStockForFlow = async (
  productId: number,
  flowType: ProductStockFlowType,
  fallbackStockQuantity: number
): Promise<number> => {
  const flowStock = await getProductFlowAvailableStock(productId, flowType);
  if (flowStock !== null) return flowStock;
  const hasAllocs = await hasActiveStockAllocations(productId);
  if (hasAllocs) return 0;
  return Math.max(0, fallbackStockQuantity || 0);
};
