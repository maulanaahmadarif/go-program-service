import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  DataType,
  Default,
} from 'sequelize-typescript';
import { Optional } from "sequelize";
import { User } from './User';
import { Product } from './Product';

export interface FortuneWheelSpinAttributes {
  spin_id?: number;
  user_id: number;
  product_id?: number | null;
  prize_name: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  is_redeemed: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface FortuneWheelSpinCreationAttributes
  extends Optional<FortuneWheelSpinAttributes, "spin_id"> {}

@Table({ tableName: 'fortune_wheel_spins', underscored: true, timestamps: true })
export class FortuneWheelSpin extends Model<FortuneWheelSpinAttributes, FortuneWheelSpinCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public spin_id!: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public user_id!: number;

  @ForeignKey(() => Product)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  public product_id!: number | null;

  @AllowNull(false)
  @Column(DataType.STRING)
  public prize_name!: string;

  @AllowNull(false)
  @Column(DataType.ENUM('PENDING', 'COMPLETED', 'FAILED'))
  public status!: 'PENDING' | 'COMPLETED' | 'FAILED';

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  public is_redeemed!: boolean;

  @CreatedAt
  @Column
  public readonly createdAt!: Date;

  @UpdatedAt
  @Column
  public readonly updatedAt!: Date;

  // Define associations
  @BelongsTo(() => User)
  public user?: User;

  @BelongsTo(() => Product)
  public product?: Product;
} 