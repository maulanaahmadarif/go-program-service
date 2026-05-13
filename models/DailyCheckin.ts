// src/models/DailyCheckin.ts
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
  DataType,
  BelongsTo
} from 'sequelize-typescript';
import { Optional } from "sequelize";

import { User } from './User';

export interface DailyCheckinAttributes {
  checkin_id?: number;
  user_id: number;
  last_checkin_date: Date;
  current_streak: number;
  /** Streak day indices (1–5) that earned the daily milestone form bonus in the current streak cycle; cleared when the streak resets. */
  milestone_bonus_claimed_days?: number[];
  /** Wall time of the last successful check-in; milestone bonus coin rows must be after this to count for the current session (same calendar day, new cycle). */
  checkin_session_at?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface DailyCheckinCreationAttributes
  extends Optional<DailyCheckinAttributes, "checkin_id" | "milestone_bonus_claimed_days" | "checkin_session_at"> {}

// Define the DailyCheckin model
@Table({ tableName: 'daily_checkins', underscored: true })
export class DailyCheckin extends Model<DailyCheckinAttributes, DailyCheckinCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public checkin_id!: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public user_id!: number;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  public last_checkin_date!: Date;

  @AllowNull(false)
  @Default(1)
  @Column(DataType.INTEGER)
  public current_streak!: number;

  @AllowNull(true)
  @Column(DataType.JSON)
  public milestone_bonus_claimed_days?: number[] | null;

  @AllowNull(true)
  @Column(DataType.DATE)
  public checkin_session_at?: Date | null;

  // Timestamps
  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  // Define associations
  @BelongsTo(() => User, "user_id")
  user!: User;
}
