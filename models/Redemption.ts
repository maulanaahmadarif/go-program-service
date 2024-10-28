// src/models/Redemption.ts
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
  BelongsTo,
  HasOne,
  Validate,
  BeforeCreate,
  AfterCreate,
  ForeignKey
} from 'sequelize-typescript';
import { Optional } from "sequelize";

import { User } from './User';           // Adjust paths based on your project structure
import { Product } from './Product';     // Adjust paths based on your project structure
import { PointTransaction } from './PointTransaction'; // Adjust paths based on your project structure

export interface RedemptionAttributes {
  redemption_id?: number;
  user_id: number;
  product_id: number;
  points_spent: number;
  status: string;
  shipping_address: string;
  tracking_number: string;
  notes?: string;
  redeemed_at?: Date;
  processed_at?: Date;
  delivered_at?: Date;
  createdAt?: Date;
  updatedAt?: Date;  
}

interface RedemptionCreationAttributes
  extends Optional<RedemptionAttributes, "redemption_id"> {}

// Define the Redemption model
@Table({ tableName: 'redemptions', underscored: true })
export class Redemption extends Model<RedemptionAttributes, RedemptionCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public redemption_id!: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public user_id!: number;

  @ForeignKey(() => Product)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public product_id!: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  public points_spent!: number;

  @AllowNull(false)
  @Default('pending')
  @Column(DataType.STRING(50))
  public status!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  public shipping_address!: string; // Adjust as per the structure of the shipping address

  @AllowNull(true)
  @Column(DataType.STRING(100))
  public tracking_number?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  public notes?: string;

  @AllowNull(true)
  @Column(DataType.DATE)
  public redeemed_at?: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  public processed_at?: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  public delivered_at?: Date;

  // Timestamps
  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  // Define associations
  @BelongsTo(() => User, "user_id")
  user!: User;

  @BelongsTo(() => Product, "product_id")
  product!: Product;

  @HasOne(() => PointTransaction, { as: "point_deduction" })
  point_transaction!: PointTransaction;

  // static associate(models: any) {
  //   Redemption.belongsTo(models.User, { foreignKey: 'user_id' });
  //   Redemption.belongsTo(models.Product, { foreignKey: 'product_id' });
  //   Redemption.hasOne(models.PointTransaction, {
  //     foreignKey: 'redemption_id',
  //     as: 'PointDeduction',
  //   });
  // }

  // Hooks
  // @BeforeCreate
  // static async checkProductAvailability(redemption: Redemption) {
  //   const product = await redemption.$modelOptions.sequelize!.models.Product.findByPk(redemption.product_id);
  //   if (!product) {
  //     throw new Error('Product not found');
  //   }
  //   if (product.stock_quantity < 1) {
  //     throw new Error('Product out of stock');
  //   }
  //   redemption.points_spent = product.points_required;
  // }

  // @AfterCreate
  // static async handlePostRedemption(redemption: Redemption) {
  //   const transaction = await redemption.$modelOptions.sequelize!.transaction();
  //   try {
  //     // Deduct points from user
  //     await redemption.$modelOptions.sequelize!.models.PointTransaction.create({
  //       user_id: redemption.user_id,
  //       points: -redemption.points_spent,
  //       transaction_type: 'spend',
  //       redemption_id: redemption.redemption_id,
  //       description: 'Points redemption for product',
  //     }, { transaction });

  //     // Update product stock
  //     await redemption.$modelOptions.sequelize!.models.Product.decrement('stock_quantity', {
  //       by: 1,
  //       where: { product_id: redemption.product_id },
  //       transaction,
  //     });

  //     await transaction.commit();
  //   } catch (error) {
  //     await transaction.rollback();
  //     throw error;
  //   }
  // }
}