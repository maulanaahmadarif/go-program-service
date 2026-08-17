import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  CreatedAt,
  UpdatedAt,
  DataType,
} from 'sequelize-typescript';
import { Optional, Transaction } from 'sequelize';

import { CAMPAIGN_SEED } from '../src/constants/campaigns';

export interface CampaignAttributes {
  campaign_id?: number;
  phase: number;
  name: string;
  starts_at: Date;
  ends_at?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CampaignCreationAttributes
  extends Optional<CampaignAttributes, 'campaign_id' | 'ends_at'> {}

@Table({
  tableName: 'campaigns',
  underscored: true,
  timestamps: true,
})
export class Campaign extends Model<CampaignAttributes, CampaignCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public campaign_id!: number;

  @AllowNull(false)
  @Unique
  @Column(DataType.INTEGER)
  public phase!: number;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  public name!: string;

  @AllowNull(false)
  @Column(DataType.DATE)
  public starts_at!: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  public ends_at?: Date | null;

  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  static async seedIfEmpty(transaction?: Transaction): Promise<void> {
    const count = await Campaign.count({ transaction });
    if (count > 0) return;
    await Campaign.bulkCreate(CAMPAIGN_SEED, { ignoreDuplicates: true, transaction });
  }

  static async resolveAt(at: Date = new Date(), transaction?: Transaction): Promise<Campaign> {
    await Campaign.seedIfEmpty(transaction);
    const campaigns = await Campaign.findAll({
      order: [['starts_at', 'ASC']],
      transaction,
    });

    const atMs = at.getTime();
    const match = [...campaigns].reverse().find((campaign) => {
      const start = new Date(campaign.starts_at).getTime();
      const end = campaign.ends_at ? new Date(campaign.ends_at).getTime() : Number.POSITIVE_INFINITY;
      return atMs >= start && atMs < end;
    });

    if (!match) {
      throw new Error(`No campaign covers ${at.toISOString()}`);
    }

    return match;
  }
}
