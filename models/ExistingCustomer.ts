import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import { Optional } from 'sequelize';

export interface ExistingCustomerAttributes {
  id?: number;
  customer_name: string;
  alias_name: string;
  segment?: string;
  ftf?: string;
  isr?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ExistingCustomerCreationAttributes
  extends Optional<ExistingCustomerAttributes, 'id' | 'segment' | 'ftf' | 'isr' | 'createdAt' | 'updatedAt'> {}

/**
 * Reference table for existing customers of the company.
 * Used for comparison/validation (e.g. form submission when customer_type is NEW).
 */
@Table({
  tableName: 'existing_customers',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['customer_name'] },
    { fields: ['alias_name'] }
  ]
})
export class ExistingCustomer extends Model<ExistingCustomerAttributes, ExistingCustomerCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  public id!: number;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  public customer_name!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  public alias_name?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  public segment?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  public ftf?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  public isr?: string;

  @CreatedAt
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  public readonly createdAt!: Date;

  @UpdatedAt
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  public readonly updatedAt!: Date;
}
