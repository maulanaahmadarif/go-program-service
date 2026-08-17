// src/models/PointTransaction.ts
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
  BelongsTo,
  BeforeCreate,
} from 'sequelize-typescript';
import { Optional, Transaction } from 'sequelize';

import { User } from './User';
import { Form } from './Form';
import { Redemption } from './Redemption';
import { Campaign } from './Campaign';

export interface PointTransactionAttributes {
  transaction_id?: number;
  user_id: number;
  redemption_id?: number | null;
  points: number;
  transaction_type: string;
  form_id?: number | null;
  campaign_id?: number | null;
  description: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PointTransactionCreationAttributes
  extends Optional<PointTransactionAttributes, 'transaction_id' | 'campaign_id'> {}

@Table({ tableName: 'point_transactions', underscored: true })
export class PointTransaction extends Model<PointTransactionAttributes, PointTransactionCreationAttributes> {
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
  public points!: number;

  @AllowNull(false)
  @IsIn([['earn', 'spend', 'adjust']])
  @Column(DataType.STRING(50))
  public transaction_type!: 'earn' | 'spend' | 'adjust';

  @ForeignKey(() => Form)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  public form_id?: number | null;

  @ForeignKey(() => Campaign)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  public campaign_id?: number | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  public description?: string;

  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  @BelongsTo(() => Form, 'form_id')
  form!: Form;

  @BelongsTo(() => User, 'user_id')
  user!: User;

  @BelongsTo(() => Redemption, 'redemption_id')
  redemption!: Redemption;

  @BelongsTo(() => Campaign, 'campaign_id')
  campaign?: Campaign;

  @BeforeCreate
  static async assignCampaign(
    instance: PointTransaction,
    options: { transaction?: Transaction }
  ) {
    if (instance.campaign_id) return;
    const campaign = await Campaign.resolveAt(instance.createdAt || new Date(), options.transaction);
    instance.campaign_id = campaign.campaign_id;
  }
}
