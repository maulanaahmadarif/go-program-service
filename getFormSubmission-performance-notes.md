# getFormSubmission Performance Notes

This document captures the database/index recommendations and rollout checks for the `GET /api/form/submission` optimization.

## Recommended indexes

Run these in PostgreSQL (adjust names if they already exist):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_forms_status_created_at
  ON forms (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_forms_user_project_status
  ON forms (user_id, project_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_forms_form_type_id
  ON forms (form_type_id);
```

For `product_category` JSONB filtering:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_forms_form_data_gin
  ON forms
  USING GIN (form_data jsonb_path_ops);
```

Notes:
- `jsonb_path_ops` is compact and efficient for containment-style lookups.
- Build indexes during lower traffic windows if table is large.

## Before/after validation checklist

1. Pick 3-5 representative query combinations used by production users:
   - no filters,
   - `status` + date range,
   - `product_category` + date range,
   - company/user scoped query.
2. Measure p50/p95 latency before rollout.
3. Deploy API optimization.
4. Apply missing indexes (if not already present).
5. Re-measure the same query set and compare p50/p95.
6. Confirm response contract:
   - pagination keys unchanged,
   - point fields unchanged (`base_points`, `bonus_points`, `completion_bonus`, `customer_type_bonus`, `total_points`).

## Quick SQL plan check

Use `EXPLAIN (ANALYZE, BUFFERS)` on the generated query for a heavy filter case to confirm index usage and avoid full sequential scans.
