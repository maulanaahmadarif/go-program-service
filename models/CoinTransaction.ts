// src/models/CoinTransaction.ts
import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  AllowNull,
  CreatedAt,
  UpdatedAt,
  DataType,
  IsIn,
  BelongsTo
} from 'sequelize-typescript';
import { Optional } from "sequelize";

import { User } from './User';
import { Form } from './Form';
import { Redemption } from './Redemption';

export interface CoinTransactionAttributes {
  transaction_id?: number;
  user_id: number;
  redemption_id?: number | null;
  coins: number;
  transaction_type: string;
  form_id?: number | null;
  description: string;
  createdAt?: Date;
  updatedAt?: Date;  
}

interface CoinTransactionCreationAttributes
  extends Optional<CoinTransactionAttributes, "transaction_id"> {}

// Define the CoinTransaction model
@Table({ tableName: 'coin_transactions', underscored: true })
export class CoinTransaction extends Model<CoinTransactionAttributes, CoinTransactionCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public transaction_id!: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public user_id!: number;

  @ForeignKey(() => Redemption)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  public redemption_id?: number | null;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  public coins!: number;

  @AllowNull(false)
  @IsIn([['earn', 'spend', 'adjust']])
  @Column(DataType.STRING(50))
  public transaction_type!: 'earn' | 'spend' | 'adjust';

  @ForeignKey(() => Form)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  public form_id?: number | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  public description?: string;

  // Timestamps
  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  // Define associations
  @BelongsTo(() => Form, "form_id")
  form!: Form;

  @BelongsTo(() => User, "user_id")
  user!: User;

  @BelongsTo(() => Redemption, "redemption_id")
  redemption!: Redemption;
}
