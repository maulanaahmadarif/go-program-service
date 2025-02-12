import { Model, DataTypes } from 'sequelize';
import { Table, Column, Model as SequelizeModel, PrimaryKey, AutoIncrement, AllowNull, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';
import { sequelize } from '../src/db';
import { User } from './User';

@Table({ tableName: 'verification_tokens', underscored: true, timestamps: true })
export class VerificationToken extends SequelizeModel {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public verification_token_id!: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  public user_id!: number;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  public token!: string;

  @AllowNull(false)
  @Column(DataType.ENUM('EMAIL_CONFIRMATION', 'PASSWORD_RESET'))
  public purpose!: 'EMAIL_CONFIRMATION' | 'PASSWORD_RESET';

  @AllowNull(false)
  @Column(DataType.DATE)
  public expires_at!: Date;

  @BelongsTo(() => User)
  user?: User;
} 