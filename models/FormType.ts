// src/models/FormType.ts
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
  Validate,
  HasMany
} from 'sequelize-typescript';
import { Optional } from "sequelize";

import { Form } from './Form';  // Adjust the path based on your structure

export interface FormTypeAttributes {
  form_type_id?: number;
  form_name: string;
  point_reward: number;
  description?: string;
  is_active?: boolean;
  createdAt?: Date;
  updatedAt?: Date;  
}

interface FormTypeCreationAttributes
  extends Optional<FormTypeAttributes, "form_type_id"> {}

// Define the FormType model
@Table({ tableName: 'form_types', underscored: true })
export class FormType extends Model<FormTypeAttributes, FormTypeCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public form_type_id!: number;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  public form_name!: string;

  @AllowNull(false)
  @Validate({ min: 0 })
  @Column(DataType.INTEGER)
  public point_reward!: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  public description?: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  public is_active!: boolean;

  // Timestamps
  @CreatedAt
  public readonly createdAt!: Date;

  @UpdatedAt
  public readonly updatedAt!: Date;

  // Define associations
  @HasMany(() => Form)
  form!: Form[];

  // Custom validation method for field definitions
  // @Validate
  // public static validateFieldDefinitions(value: any) {
  //   if (!value.fields || !Array.isArray(value.fields)) {
  //     throw new Error('Field definitions must contain a fields array');
  //   }
  //   // Additional validation logic can be added here
  // }
}
