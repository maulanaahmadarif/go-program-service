'use strict';

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('user_actions', 'coin_transaction_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'coin_transactions',
        key: 'transaction_id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('user_actions', ['coin_transaction_id'], {
      name: 'user_actions_coin_transaction_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('user_actions', 'user_actions_coin_transaction_id_idx');
    await queryInterface.removeColumn('user_actions', 'coin_transaction_id');
  },
};
