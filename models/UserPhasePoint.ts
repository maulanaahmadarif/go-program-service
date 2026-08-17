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
} from 'sequelize-typescript';
import { Optional } from 'sequelize';

import { User } from './User';
import { Campaign } from './Campaign';

export interface UserPhasePointAttributes {
  user_phase_point_id?: number;
  user_id: number;
  campaign_id: number;
  earned_points?: number;
  remaining_points?: number;
  spent_points?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserPhasePointCreationAttributes
  extends Optional<
    UserPhasePointAttributes,
    'user_phase_point_id' | 'earned_points' | 'remaining_points' | 'spent_points'
  > {}

@Table({
  tableName: 'user_phase_points',
  underscored: true,
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'campaign_id'],
      name: 'user_phase_points_user_campaign_unique',
    },
  ],
})
export class UserPhasePoint extends Model<UserPhasePointAttributes, UserPhasePointCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public user_phase_point_id!: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public user_id!: number;

  @ForeignKey(() => Campaign)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public campaign_id!: number;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  public earned_points!: number;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  public remaining_points!: number;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  public spent_points!: number;

  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  @BelongsTo(() => User, { foreignKey: 'user_id', onDelete: 'CASCADE' })
  user!: User;

  @BelongsTo(() => Campaign, { foreignKey: 'campaign_id' })
  campaign!: Campaign;
}
