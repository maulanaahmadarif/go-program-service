'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('three_day_quests', {
      quest_id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      user_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        unique: true,
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      started_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      ends_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      claimed_at: {
        allowNull: true,
        type: Sequelize.DATE,
      },
      reward_type: {
        allowNull: true,
        type: Sequelize.STRING(20),
      },
      redemption_id: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: { model: 'redemptions', key: 'redemption_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
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

    await queryInterface.sequelize.query(`
      INSERT INTO product_stock_allocations
        (product_id, flow_type, allocated_stock, used_stock, reserved_stock, is_active, created_at, updated_at)
      SELECT 3, 'three_day_quest', 25, 0, 0, true, NOW(), NOW()
      WHERE EXISTS (SELECT 1 FROM products WHERE product_id = 3)
        AND NOT EXISTS (
          SELECT 1 FROM product_stock_allocations
          WHERE product_id = 3 AND flow_type = 'three_day_quest'
        )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM product_stock_allocations
      WHERE product_id = 3 AND flow_type = 'three_day_quest'
    `);
    await queryInterface.dropTable('three_day_quests');
  },
};
