import { Table, Column, Model, DataType, HasMany, PrimaryKey, AutoIncrement, AllowNull, Default, CreatedAt, UpdatedAt } from 'sequelize-typescript';
import { Optional } from "sequelize";

import { User } from './User';

export interface CompanyAttributes {
  company_id?: number;
  name: string;
  address?: string;
  industry: string;
  total_points?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CompanyCreationAttributes
  extends Optional<CompanyAttributes, "company_id"> {}

@Table({ tableName: 'companies', underscored: true, timestamps: true })
export class Company extends Model<CompanyAttributes, CompanyCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER) // Specify data type
  public company_id!: number;

  @AllowNull(false)
  @Column(DataType.STRING(255)) // Specify data type
  public name!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255)) // Specify data type
  public address?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255)) // Specify data type
  public industry?: string;

  @Default(0)
  @Column(DataType.INTEGER) // Specify data type
  public total_points?: number;

  // Timestamps
  @CreatedAt
  @Column // Add this line to specify the column for createdAt
  public readonly createdAt!: Date;

  @UpdatedAt
  @Column // Add this line to specify the column for updatedAt
  public readonly updatedAt!: Date;

  // Define the one-to-many relationship
  @HasMany(() => User)
  users!: User[];
}