import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  Unique
} from 'sequelize-typescript';
import { User } from './User';

@Table({
  tableName: 'refresh_tokens',
  timestamps: true,
  underscored: true
})
export class RefreshToken extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public refresh_token_id!: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  public user_id!: number;

  @Unique
  @Column(DataType.STRING(500))
  public token!: string;

  @Column(DataType.DATE)
  public expires_at!: Date;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false
  })
  public is_revoked!: boolean;

  @CreatedAt
  public created_at!: Date;

  @UpdatedAt
  public updated_at!: Date;

  @BelongsTo(() => User)
  public user!: User;
}