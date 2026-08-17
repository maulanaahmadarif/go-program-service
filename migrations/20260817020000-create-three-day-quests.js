'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Must commit before the next migration can INSERT this enum value.
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_product_stock_allocations_flow_type"
      ADD VALUE IF NOT EXISTS 'three_day_quest'
    `);
  },

  async down() {
    // Postgres cannot remove a single enum value safely.
  },
};
