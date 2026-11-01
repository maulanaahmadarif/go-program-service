'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`
        INSERT INTO campaigns (phase, name, starts_at, ends_at, created_at, updated_at)
        VALUES
          (7, 'Phase 7', '2026-05-15T00:00:00+07:00', '2026-08-17T00:00:00+07:00', NOW(), NOW()),
          (8, 'Phase 8', '2026-08-17T00:00:00+07:00', '2026-10-02T00:00:00+07:00', NOW(), NOW()),
          (9, 'Phase 9', '2026-11-01T00:00:00+07:00', '2027-01-01T00:00:00+07:00', NOW(), NOW())
        ON CONFLICT (phase) DO UPDATE SET
          name = EXCLUDED.name,
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          updated_at = NOW()
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM campaigns c
            WHERE c.phase = 9 AND (
              EXISTS (SELECT 1 FROM user_phase_points WHERE campaign_id = c.campaign_id)
              OR EXISTS (SELECT 1 FROM point_transactions WHERE campaign_id = c.campaign_id)
            )
          ) THEN
            RAISE EXCEPTION 'Cannot remove Phase 9 while point records reference it';
          END IF;
        END $$
      `, { transaction });
      await queryInterface.sequelize.query(`
        DELETE FROM campaigns WHERE phase = 9
      `, { transaction });
      await queryInterface.sequelize.query(`
        UPDATE campaigns SET ends_at = NULL, updated_at = NOW() WHERE phase = 8
      `, { transaction });
    });
  },
};
