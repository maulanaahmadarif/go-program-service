// src/models/UserAction.ts
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
  ForeignKey,
  BelongsTo
} from 'sequelize-typescript';
import { Optional } from "sequelize";

import { DataTypes } from 'sequelize';
import { User } from './User';                   // Adjust paths based on your project structure
import { Form } from './Form';                   // Adjust paths based on your project structure
import { Redemption } from './Redemption';

export interface UserAttributes {
  action_id?: number;
  user_id: number;
  action_type: string;
  entity_type: 'FORM' | 'REDEEM';
  form_id?: number;
  redemption_id?: number;
  ip_address?: string;
  user_agent?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes
  extends Optional<UserAttributes, "action_id"> {}

// Define the UserAction model
@Table({ tableName: 'user_actions', underscored: true })
export class UserAction extends Model<UserAttributes, UserCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column
  public action_id!: number;

  @AllowNull(false)
  @ForeignKey(() => User)
  @Column
  public user_id!: number;

  @AllowNull(false)
  @Column
  public action_type!: string;

  @AllowNull(false)
  @Column
  public entity_type!: string;

  @AllowNull(true)
  @ForeignKey(() => Form)
  @Column
  public form_id?: number;

  @AllowNull(true)
  @ForeignKey(() => Redemption)
  @Column
  public redemption_id?: number;

  @AllowNull(true)
  @Column(DataTypes.INET)
  public ip_address?: string;

  @AllowNull(true)
  @Column(DataTypes.TEXT)
  public user_agent?: string;

  // Timestamps
  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  // Define associations
  @BelongsTo(() => User, "user_id")
  user!: User;

  @BelongsTo(() => Form, "form_id")
  form!: Form;

  @BelongsTo(() => Redemption, "redemption_id")
  redemption!: Redemption;
}