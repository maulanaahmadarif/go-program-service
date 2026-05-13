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
import { Optional } from 'sequelize';

export interface DailyCheckinRewardTierAttributes {
  tier_id?: number;
  day_index: number;
  check_in_coins: number;
  milestone_bonus_coins: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CreationAttrs extends Optional<DailyCheckinRewardTierAttributes, 'tier_id'> {}

@Table({ tableName: 'daily_checkin_reward_tiers', underscored: true })
export class DailyCheckinRewardTier extends Model<
  DailyCheckinRewardTierAttributes,
  CreationAttrs
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public tier_id!: number;

  /** 1–5 within the current 5-day streak cycle */
  @Unique
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public day_index!: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  public check_in_coins!: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  public milestone_bonus_coins!: number;

  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;
}
