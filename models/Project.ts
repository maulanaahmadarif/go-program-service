import {
  Table,
  Column,
  Model,
  ForeignKey,
  BelongsTo,
  HasMany,
  DataType,
  AllowNull,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import { Optional } from "sequelize";

import { User } from './User'; // Adjust import path to your User model
import { Form } from './Form'; // Adjust import path to your Form model

export interface ProjectAttributes {
  project_id?: number;
  name: string;
  description?: string;
  user_id: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ProjectCreationAttributes
  extends Optional<ProjectAttributes, "project_id"> {}

@Table({ tableName: 'projects', underscored: true, timestamps: true })
export class Project extends Model<ProjectAttributes, ProjectCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public project_id!: number;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  public name!: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  description?: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  user_id!: number;

  // Timestamps
  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  @BelongsTo(() => User)
  user!: User;

  @HasMany(() => Form)
  form!: Form[];
}