'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('daily_checkin_reward_tiers', {
      tier_id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      day_index: {
        allowNull: false,
        unique: true,
        type: Sequelize.INTEGER,
      },
      check_in_coins: {
        allowNull: false,
        type: Sequelize.INTEGER,
      },
      milestone_bonus_coins: {
        allowNull: false,
        type: Sequelize.INTEGER,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    const tiers = [
      { day_index: 1, check_in_coins: 5, milestone_bonus_coins: 50 },
      { day_index: 2, check_in_coins: 10, milestone_bonus_coins: 50 },
      { day_index: 3, check_in_coins: 10, milestone_bonus_coins: 50 },
      { day_index: 4, check_in_coins: 15, milestone_bonus_coins: 50 },
      { day_index: 5, check_in_coins: 20, milestone_bonus_coins: 100 },
    ];

    await queryInterface.bulkInsert(
      'daily_checkin_reward_tiers',
      tiers.map((t) => ({
        ...t,
        created_at: new Date(),
        updated_at: new Date(),
      }))
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('daily_checkin_reward_tiers');
  },
};
