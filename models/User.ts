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
import { Project } from './Project'
import { VerificationToken } from './VerificationToken';
import { FortuneWheelSpin } from './FortuneWheelSpin';


export interface UserAttributes {
  user_id?: number;
  username: string;
  email: string;
  fullname?: string;
  user_type: string;
  company_id: number;
  password_hash: string;
  program_saled_id: string;
  phone_number?: string;
  job_title?: string;
  level?: 'CUSTOMER' | 'INTERNAL';
  total_points?: number;
  accomplishment_total_points?: number;
  lifetime_total_points?: number;
  is_active?: boolean;
  referral_code?: string;
  referred_by?: number;
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

  @AllowNull(true)
  @Column(DataType.STRING(255)) // Specify data type
  public fullname?: string;

  @AllowNull(false)
  @Column(DataType.STRING(255)) // Specify data type
  public user_type!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255)) // Specify data type
  public password_hash!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255)) // Specify data type
  public program_saled_id?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255)) // Specify data type
  public phone_number?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255)) // Specify data type
  public job_title?: string;

  @Default(0)
  @Column(DataType.INTEGER) // Specify data type
  public accomplishment_total_points?: number;

  @Default(0)
  @Column(DataType.INTEGER) // Specify data type
  public total_points?: number;

  @Default(0)
  @Column(DataType.INTEGER) // Specify data type
  public lifetime_total_points?: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  public is_active?: boolean;

  @Default('CUSTOMER')
  @Column(DataType.ENUM('CUSTOMER', 'INTERNAL'))
  public level!: 'CUSTOMER' | 'INTERNAL';

  @AllowNull(true)
  @Unique
  @Column(DataType.STRING(10))
  public referral_code?: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  public referred_by?: number;

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

  @HasMany(() => Project)
  project!: Project[];

  @HasMany(() => Form)
  form!: Form[];

  @HasMany(() => PointTransaction)
  point_transaction!: PointTransaction[];

  @HasMany(() => FortuneWheelSpin)
  fortune_wheel_spins!: FortuneWheelSpin[];

  @BelongsTo(() => Company)
  company?: Company;

  @BelongsTo(() => User, 'referred_by')
  referrer?: User;

  @HasMany(() => VerificationToken)
  verification_tokens?: VerificationToken[];

  // static associate(models: any) {
  //   User.hasMany(models.Form, { foreignKey: 'user_id' });
  //   User.hasMany(models.UserAction, { foreignKey: 'user_id' });
  //   User.hasMany(models.PointTransaction, { foreignKey: 'user_id' });

  // }
}