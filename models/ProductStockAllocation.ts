import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  CreatedAt,
  UpdatedAt,
  DataType,
  ForeignKey,
  BelongsTo,
  Validate,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';

import { Product } from './Product';

export type ProductStockFlowType = 'redeem' | 'spin_wheel' | 'referral' | 'signup' | 'coin';

export interface ProductStockAllocationAttributes {
  allocation_id?: number;
  product_id: number;
  flow_type: ProductStockFlowType;
  allocated_stock: number;
  used_stock: number;
  reserved_stock: number;
  is_active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ProductStockAllocationCreationAttributes
  extends Optional<ProductStockAllocationAttributes, 'allocation_id' | 'used_stock' | 'reserved_stock' | 'is_active'> {}

@Table({ tableName: 'product_stock_allocations', underscored: true, timestamps: true })
export class ProductStockAllocation extends Model<ProductStockAllocationAttributes, ProductStockAllocationCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public allocation_id!: number;

  @ForeignKey(() => Product)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public product_id!: number;

  @AllowNull(false)
  @Column(DataType.ENUM('redeem', 'spin_wheel', 'referral', 'signup', 'coin'))
  public flow_type!: ProductStockFlowType;

  @AllowNull(false)
  @Validate({ min: 0 })
  @Column(DataType.INTEGER)
  public allocated_stock!: number;

  @AllowNull(false)
  @Default(0)
  @Validate({ min: 0 })
  @Column(DataType.INTEGER)
  public used_stock!: number;

  @AllowNull(false)
  @Default(0)
  @Validate({ min: 0 })
  @Column(DataType.INTEGER)
  public reserved_stock!: number;

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  public is_active!: boolean;

  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  @BelongsTo(() => Product, 'product_id')
  product!: Product;
}
