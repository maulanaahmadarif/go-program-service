// src/models/User.ts
import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Validate,
  Default,
  CreatedAt,
  UpdatedAt,
  DataType,
  HasMany,
  ForeignKey,
  BelongsTo
} from 'sequelize-typescript';
import { Optional } from "sequelize";
import { Form } from './Form';                   // Adjust paths based on your project structure
import { Company } from './Company';
import { UserAction } from './UserAction';       // Adjust paths based on your project structure
import { PointTransaction } from './PointTransaction';  // Adjust paths based on your project structure


export interface UserAttributes {
  user_id?: number;
  username: string;
  email: string;
  company_id: number;
  password_hash: string;
  program_saled_id: string;
  phone_number?: string;
  job_title?: string;
  total_points?: number;
  is_active?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes
  extends Optional<UserAttributes, "user_id"> {}

// Define the User model
@Table({ tableName: 'users', underscored: true, timestamps: true })
export class User extends Model<UserAttributes, UserCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER) // Specify data type
  public user_id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public company_id!: number;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(255)) // Specify data type
  public username!: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(255)) // Specify data type
  public email!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255)) // Specify data type
  public password_hash!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255)) // Specify data type
  public program_saled_id!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255)) // Specify data type
  public phone_number?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255)) // Specify data type
  public job_title?: string;

  @Default(0)
  @Column(DataType.INTEGER) // Specify data type
  public total_points?: number;

  @Default(true)
  @Column(DataType.BOOLEAN) // Specify data type
  public is_active?: boolean;

  // Timestamps
  @CreatedAt
  @Column // Add this line to specify the column for createdAt
  public readonly createdAt!: Date;

  @UpdatedAt
  @Column // Add this line to specify the column for updatedAt
  public readonly updatedAt!: Date;

  // Define associations
  @HasMany(() => UserAction)
  user_action!: UserAction[];

  @HasMany(() => Form)
  form!: Form[];

  @HasMany(() => PointTransaction)
  point_transaction!: PointTransaction[];

  @BelongsTo(() => Company)
  company?: Company;

  // static associate(models: any) {
  //   User.hasMany(models.Form, { foreignKey: 'user_id' });
  //   User.hasMany(models.UserAction, { foreignKey: 'user_id' });
  //   User.hasMany(models.PointTransaction, { foreignKey: 'user_id' });

  // }
}