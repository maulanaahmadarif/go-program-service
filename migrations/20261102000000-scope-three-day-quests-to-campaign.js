'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`
        ALTER TABLE three_day_quests ADD COLUMN campaign_id INTEGER;

        UPDATE three_day_quests q
        SET campaign_id = c.campaign_id
        FROM campaigns c
        WHERE q.started_at >= c.starts_at
          AND (c.ends_at IS NULL OR q.started_at < c.ends_at);

        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM three_day_quests WHERE campaign_id IS NULL) THEN
            RAISE EXCEPTION 'Some 3 Day Quests do not fall inside a campaign window';
          END IF;
        END $$;

        ALTER TABLE three_day_quests
          ALTER COLUMN campaign_id SET NOT NULL,
          ADD CONSTRAINT three_day_quests_campaign_id_fkey
            FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id)
            ON UPDATE CASCADE ON DELETE RESTRICT;

        ALTER TABLE three_day_quests DROP CONSTRAINT three_day_quests_user_id_key;
        ALTER TABLE three_day_quests
          ADD CONSTRAINT three_day_quests_user_campaign_key UNIQUE (user_id, campaign_id);
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM three_day_quests GROUP BY user_id HAVING COUNT(*) > 1
          ) THEN
            RAISE EXCEPTION 'Cannot restore one quest per user while multiple campaign quests exist';
          END IF;
        END $$;

        ALTER TABLE three_day_quests DROP CONSTRAINT three_day_quests_user_campaign_key;
        ALTER TABLE three_day_quests ADD CONSTRAINT three_day_quests_user_id_key UNIQUE (user_id);
        ALTER TABLE three_day_quests DROP COLUMN campaign_id;
      `, { transaction });
    });
  },
};
