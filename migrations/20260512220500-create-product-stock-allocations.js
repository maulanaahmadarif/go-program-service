'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_stock_allocations', {
      allocation_id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      product_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 'products',
          key: 'product_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      flow_type: {
        allowNull: false,
        type: Sequelize.ENUM('redeem', 'spin_wheel', 'referral', 'signup'),
      },
      allocated_stock: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      used_stock: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      reserved_stock: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      is_active: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex(
      'product_stock_allocations',
      ['product_id', 'flow_type'],
      {
        unique: true,
        name: 'product_stock_allocations_product_flow_unique',
      }
    );

    await queryInterface.sequelize.query(`
      INSERT INTO product_stock_allocations
        (product_id, flow_type, allocated_stock, used_stock, reserved_stock, is_active, created_at, updated_at)
      SELECT product_id, 'redeem', 80, 0, 0, true, NOW(), NOW()
      FROM products
      WHERE product_id = 23
      ON CONFLICT (product_id, flow_type) DO NOTHING;
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO product_stock_allocations
        (product_id, flow_type, allocated_stock, used_stock, reserved_stock, is_active, created_at, updated_at)
      SELECT product_id, 'spin_wheel', 20, 0, 0, true, NOW(), NOW()
      FROM products
      WHERE product_id = 23
      ON CONFLICT (product_id, flow_type) DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_stock_allocations');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_product_stock_allocations_flow_type";');
  },
};
