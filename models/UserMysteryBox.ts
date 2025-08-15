import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  AllowNull,
  Default,
  CreatedAt,
  UpdatedAt,
  IsIn,
  DataType,
  BelongsTo
} from 'sequelize-typescript';
import { Optional } from "sequelize";

import { User } from './User';
import { Product } from './Product';

export interface UserMysteryBoxAttributes {
  user_mystery_box_id?: number;
  user_id: number;
  product_id: number;
  milestone_reached: number;
  status?: 'available' | 'claimed';
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserMysteryBoxCreationAttributes
  extends Optional<UserMysteryBoxAttributes, "user_mystery_box_id"> {}

// Define the UserMysteryBox model
@Table({ tableName: 'user_mystery_boxes', underscored: true })
export class UserMysteryBox extends Model<UserMysteryBoxAttributes, UserMysteryBoxCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public user_mystery_box_id!: number;

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
  public milestone_reached!: number;

  @AllowNull(false)
  @Default('available')
  @IsIn([['available', 'claimed']])
  @Column(DataType.STRING(50))
  public status!: 'available' | 'claimed';

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
}
