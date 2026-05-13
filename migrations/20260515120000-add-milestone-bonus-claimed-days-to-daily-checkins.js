'use strict';

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('daily_checkins', 'milestone_bonus_claimed_days', {
      type: Sequelize.JSON,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('daily_checkins', 'milestone_bonus_claimed_days');
  },
};
