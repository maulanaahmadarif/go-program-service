import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  AllowNull,
  Unique,
  CreatedAt,
  UpdatedAt,
  DataType,
  BelongsTo,
  IsIn,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';

import { User } from './User';
import { Redemption } from './Redemption';

export type ThreeDayQuestRewardType = 'voucher' | 'points';

export interface ThreeDayQuestAttributes {
  quest_id?: number;
  user_id: number;
  started_at: Date;
  ends_at: Date;
  claimed_at?: Date | null;
  reward_type?: ThreeDayQuestRewardType | null;
  redemption_id?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ThreeDayQuestCreationAttributes
  extends Optional<
    ThreeDayQuestAttributes,
    'quest_id' | 'claimed_at' | 'reward_type' | 'redemption_id'
  > {}

@Table({ tableName: 'three_day_quests', underscored: true, timestamps: true })
export class ThreeDayQuest extends Model<ThreeDayQuestAttributes, ThreeDayQuestCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public quest_id!: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Unique
  @Column(DataType.INTEGER)
  public user_id!: number;

  @AllowNull(false)
  @Column(DataType.DATE)
  public started_at!: Date;

  @AllowNull(false)
  @Column(DataType.DATE)
  public ends_at!: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  public claimed_at?: Date | null;

  @AllowNull(true)
  @IsIn([['voucher', 'points']])
  @Column(DataType.STRING(20))
  public reward_type?: ThreeDayQuestRewardType | null;

  @ForeignKey(() => Redemption)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  public redemption_id?: number | null;

  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  @BelongsTo(() => User, 'user_id')
  user!: User;

  @BelongsTo(() => Redemption, 'redemption_id')
  redemption?: Redemption;
}
