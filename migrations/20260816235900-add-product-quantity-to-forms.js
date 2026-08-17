'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('forms', 'product_quantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.sequelize.query(`
      UPDATE forms
      SET product_quantity = COALESCE(sub.qty, 0)
      FROM (
        SELECT
          f.form_id,
          COALESCE(SUM(
            CASE
              WHEN (product->>'numberOfQuantity') ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN (product->>'numberOfQuantity')::numeric
              ELSE 0
            END
          ), 0)::int AS qty
        FROM forms f
        LEFT JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(f.form_data) = 'array' THEN f.form_data ELSE '[]'::jsonb END
        ) AS form_entry ON true
        LEFT JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN form_entry->>'label' = 'products'
              AND jsonb_typeof(form_entry->'value') = 'array'
            THEN form_entry->'value'
            ELSE '[]'::jsonb
          END
        ) AS product ON true
        GROUP BY f.form_id
      ) sub
      WHERE forms.form_id = sub.form_id;
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('forms', 'product_quantity');
  },
};
