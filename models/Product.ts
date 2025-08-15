// src/models/Product.ts
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
  Validate,
  HasMany
} from 'sequelize-typescript';
import { Optional } from "sequelize";

import { Redemption } from './Redemption';  // Adjust paths based on your project structure
import { FortuneWheelSpin } from './FortuneWheelSpin';
import { UserMysteryBox } from './UserMysteryBox';

export interface ProductTypeAttributes {
  product_id?: number;
  name: string;
  description: string;
  points_required: number;
  stock_quantity: number;
  image_url?: string;
  size?: string[];
  category: string;
  is_active: boolean;
  createdAt?: Date;
  updatedAt?: Date;  
}

interface ProductCreationAttributes
  extends Optional<ProductTypeAttributes, "product_id"> {}

// Define the Product model
@Table({ tableName: 'products', underscored: true })
export class Product extends Model<ProductTypeAttributes, ProductCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public product_id!: number;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  public name!: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  public description?: string;

  @AllowNull(false)
  @Validate({ min: 0 })
  @Column(DataType.INTEGER)
  public points_required!: number;

  @AllowNull(false)
  @Validate({ min: 0 })
  @Column(DataType.INTEGER)
  public stock_quantity!: number;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  public image_url?: string;

  // Optional size column for apparel category
  @AllowNull(true)
  @Column(DataType.ARRAY(DataType.STRING))
  public size?: string[];

  @AllowNull(true)
  @Column(DataType.STRING(100))
  public category?: string;

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  public is_active!: boolean;

  // Timestamps
  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  // Define associations
  @HasMany(() => Redemption)
  redemption!: Redemption[];

  @HasMany(() => FortuneWheelSpin)
  fortune_wheel_spins!: FortuneWheelSpin[];

  @HasMany(() => UserMysteryBox)
  user_mystery_boxes!: UserMysteryBox[];

  // static associate(models: any) {
  //   Product.hasMany(models.Redemption, { foreignKey: 'product_id' });
  // }

  // Custom validation method for expiry_date
  // @Validate
  // public static validateExpiryDate(value: Date) {
  //   if (value && value < new Date()) {
  //     throw new Error('Expiry date must be in the future');
  //   }
  // }
}