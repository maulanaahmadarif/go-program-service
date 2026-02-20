import { Queue } from 'bullmq';

import { redisConnection } from './redis';
import { queueConfig } from '../config/queue';

export const FORM_BULK_APPROVE_QUEUE = 'form-bulk-approve';
export const FORM_BULK_REJECT_QUEUE = 'form-bulk-reject';

export interface BulkApproveJobData {
  form_ids: number[];
  actor_user_id: number;
}

export interface BulkRejectJobData {
  form_ids: number[];
  actor_user_id: number;
  reason?: string;
}

export const formBulkApproveQueue = new Queue<BulkApproveJobData, any, 'bulk-approve'>(FORM_BULK_APPROVE_QUEUE, {
  connection: redisConnection,
  prefix: queueConfig.redisKeyPrefix,
  defaultJobOptions: {
    attempts: queueConfig.bulk.attempts,
    backoff: {
      type: 'exponential',
      delay: queueConfig.bulk.backoffMs,
    },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

export const formBulkRejectQueue = new Queue<BulkRejectJobData, any, 'bulk-reject'>(FORM_BULK_REJECT_QUEUE, {
  connection: redisConnection,
  prefix: queueConfig.redisKeyPrefix,
  defaultJobOptions: {
    attempts: queueConfig.bulk.attempts,
    backoff: {
      type: 'exponential',
      delay: queueConfig.bulk.backoffMs,
    },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

