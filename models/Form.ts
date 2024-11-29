// src/models/Form.ts
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
  BelongsTo,
  HasMany
} from 'sequelize-typescript';
import { Optional } from "sequelize";

import { User } from './User';  // Adjust paths as per your project structure
import { FormType } from './FormType';
import { UserAction } from './UserAction';
import { PointTransaction } from './PointTransaction';
import { Project } from './Project';

export interface FormAttributes {
  form_id?: number;
  user_id: number;
  form_type_id: number;
  project_id: number;
  status?: string;
  form_data: object,
  note?: string,
  createdAt?: Date;
  updatedAt?: Date;  
}

interface FormCreationAttributes
  extends Optional<FormAttributes, "form_id"> {}

// Define the Form model
@Table({ tableName: 'forms', underscored: true })
export class Form extends Model<FormAttributes, FormCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public form_id!: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public user_id!: number;

  @ForeignKey(() => FormType)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public form_type_id!: number;

  @ForeignKey(() => Project)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  project_id!: number;

  @AllowNull(false)
  @Default('pending')
  @IsIn([['pending', 'approved', 'rejected', 'submitted']])
  @Column(DataType.STRING(50))
  public status!: 'pending' | 'approved' | 'rejected' | 'submitted';

  @AllowNull(true)
  @Column(DataType.JSONB)
  public form_data?: object;

  @AllowNull(true)
  @Column(DataType.STRING)
  public note?: string;

  // Timestamps
  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  // Define associations
  @BelongsTo(() => FormType, "form_type_id")
  form_type!: FormType;

  @BelongsTo(() => User, "user_id")
  user!: User;

  @HasMany(() => UserAction)
  user_action!: UserAction[];

  @HasMany(() => PointTransaction)
  point_transaction!: PointTransaction[];

  @BelongsTo(() => Project)
  project!: Project;
}
