'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('campaigns', {
      campaign_id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      phase: {
        allowNull: false,
        type: Sequelize.INTEGER,
        unique: true,
      },
      name: {
        allowNull: false,
        type: Sequelize.STRING(50),
      },
      starts_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      ends_at: {
        allowNull: true,
        type: Sequelize.DATE,
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

    await queryInterface.bulkInsert('campaigns', [
      { phase: 1, name: 'Phase 1', starts_at: new Date('2000-01-01T00:00:00+07:00'), ends_at: new Date('2025-01-01T00:00:00+07:00'), created_at: new Date(), updated_at: new Date() },
      { phase: 2, name: 'Phase 2', starts_at: new Date('2025-01-01T00:00:00+07:00'), ends_at: new Date('2025-05-28T00:00:00+07:00'), created_at: new Date(), updated_at: new Date() },
      { phase: 3, name: 'Phase 3', starts_at: new Date('2025-05-28T00:00:00+07:00'), ends_at: new Date('2025-08-20T00:00:00+07:00'), created_at: new Date(), updated_at: new Date() },
      { phase: 4, name: 'Phase 4', starts_at: new Date('2025-08-20T00:00:00+07:00'), ends_at: new Date('2025-10-27T00:00:00+07:00'), created_at: new Date(), updated_at: new Date() },
      { phase: 5, name: 'Phase 5', starts_at: new Date('2025-10-27T00:00:00+07:00'), ends_at: new Date('2026-02-12T00:00:00+07:00'), created_at: new Date(), updated_at: new Date() },
      { phase: 6, name: 'Phase 6', starts_at: new Date('2026-02-12T00:00:00+07:00'), ends_at: new Date('2026-05-15T00:00:00+07:00'), created_at: new Date(), updated_at: new Date() },
      { phase: 7, name: 'Phase 7', starts_at: new Date('2026-05-15T00:00:00+07:00'), ends_at: null, created_at: new Date(), updated_at: new Date() },
    ]);

    await queryInterface.createTable('user_phase_points', {
      user_phase_point_id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      user_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      campaign_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'campaigns', key: 'campaign_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      earned_points: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      remaining_points: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      spent_points: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 0,
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

    await queryInterface.addIndex('user_phase_points', ['user_id', 'campaign_id'], {
      unique: true,
      name: 'user_phase_points_user_campaign_unique',
    });

    await queryInterface.addColumn('point_transactions', 'campaign_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'campaigns', key: 'campaign_id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.sequelize.query(`
      UPDATE point_transactions pt
      SET campaign_id = c.campaign_id
      FROM campaigns c
      WHERE pt.campaign_id IS NULL
        AND pt.created_at >= c.starts_at
        AND (c.ends_at IS NULL OR pt.created_at < c.ends_at)
    `);

    await queryInterface.sequelize.query(`
      INSERT INTO user_phase_points
        (user_id, campaign_id, earned_points, remaining_points, spent_points, created_at, updated_at)
      SELECT
        u.user_id,
        c.campaign_id,
        CASE
          WHEN c.ends_at IS NULL THEN COALESCE(u.accomplishment_total_points, 0)
          ELSE COALESCE(e.earned, 0)
        END,
        CASE
          WHEN c.ends_at IS NULL THEN COALESCE(u.total_points, 0)
          ELSE 0
        END,
        COALESCE(s.spent, 0),
        NOW(),
        NOW()
      FROM users u
      CROSS JOIN campaigns c
      LEFT JOIN (
        SELECT user_id, campaign_id, SUM(points)::int AS earned
        FROM point_transactions
        WHERE transaction_type = 'earn'
        GROUP BY user_id, campaign_id
      ) e ON e.user_id = u.user_id AND e.campaign_id = c.campaign_id
      LEFT JOIN (
        SELECT user_id, campaign_id, SUM(ABS(points))::int AS spent
        FROM point_transactions
        WHERE transaction_type = 'spend'
        GROUP BY user_id, campaign_id
      ) s ON s.user_id = u.user_id AND s.campaign_id = c.campaign_id
      WHERE
        c.ends_at IS NULL
        OR COALESCE(e.earned, 0) <> 0
        OR COALESCE(s.spent, 0) <> 0
      ON CONFLICT (user_id, campaign_id) DO NOTHING
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('point_transactions', 'campaign_id');
    await queryInterface.dropTable('user_phase_points');
    await queryInterface.dropTable('campaigns');
  },
};
