import { Job, Worker } from 'bullmq';

import {
  BulkApproveJobData,
  BulkRejectJobData,
  FORM_BULK_APPROVE_QUEUE,
  FORM_BULK_REJECT_QUEUE,
} from '../queues/formQueues';
import { redisConnection } from '../queues/redis';
import { approveFormById, ModerationError, rejectFormById } from '../services/formModeration';
import logger from '../utils/logger';
import { queueConfig } from '../config/queue';

type BulkItemResult = {
  form_id: number;
  success: boolean;
  message: string;
  status: number;
};

const runWithChunkedConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<R>
) => {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map((item) => processor(item)));
    results.push(...chunkResults);
  }
  return results;
};

const itemConcurrency = queueConfig.bulk.itemConcurrency;

const processApproveBulkJob = async (job: Job<BulkApproveJobData>) => {
  const formIds = [...new Set(job.data.form_ids)];
  let processed = 0;
  const results = await runWithChunkedConcurrency(formIds, itemConcurrency, async (formId) => {
    try {
      const result = await approveFormById(formId);
      processed += 1;
      await job.updateProgress({ processed, total: formIds.length });
      return {
        form_id: formId,
        success: true,
        message: result.message,
        status: result.status,
      } as BulkItemResult;
    } catch (error: any) {
      processed += 1;
      await job.updateProgress({ processed, total: formIds.length });
      if (error instanceof ModerationError) {
        return {
          form_id: formId,
          success: false,
          message: error.message,
          status: error.status,
        } as BulkItemResult;
      }
      logger.error({ error, stack: error?.stack, formId }, 'Bulk approve item failed');
      return {
        form_id: formId,
        success: false,
        message: 'Internal error',
        status: 500,
      } as BulkItemResult;
    }
  });

  const successCount = results.filter((item) => item.success).length;
  const failedCount = results.length - successCount;

  return {
    queue: FORM_BULK_APPROVE_QUEUE,
    total: results.length,
    success_count: successCount,
    failed_count: failedCount,
    results,
  };
};

const processRejectBulkJob = async (job: Job<BulkRejectJobData>) => {
  const formIds = [...new Set(job.data.form_ids)];
  let processed = 0;
  const results = await runWithChunkedConcurrency(formIds, itemConcurrency, async (formId) => {
    try {
      const result = await rejectFormById(formId, job.data.reason || '-');
      processed += 1;
      await job.updateProgress({ processed, total: formIds.length });
      return {
        form_id: formId,
        success: true,
        message: result.message,
        status: result.status,
      } as BulkItemResult;
    } catch (error: any) {
      processed += 1;
      await job.updateProgress({ processed, total: formIds.length });
      if (error instanceof ModerationError) {
        return {
          form_id: formId,
          success: false,
          message: error.message,
          status: error.status,
        } as BulkItemResult;
      }
      logger.error({ error, stack: error?.stack, formId }, 'Bulk reject item failed');
      return {
        form_id: formId,
        success: false,
        message: 'Internal error',
        status: 500,
      } as BulkItemResult;
    }
  });

  const successCount = results.filter((item) => item.success).length;
  const failedCount = results.length - successCount;

  return {
    queue: FORM_BULK_REJECT_QUEUE,
    total: results.length,
    success_count: successCount,
    failed_count: failedCount,
    results,
  };
};

export const formBulkApproveWorker = new Worker<BulkApproveJobData>(
  FORM_BULK_APPROVE_QUEUE,
  processApproveBulkJob,
  {
    connection: redisConnection,
    prefix: queueConfig.redisKeyPrefix,
    concurrency: 1,
  }
);

export const formBulkRejectWorker = new Worker<BulkRejectJobData>(
  FORM_BULK_REJECT_QUEUE,
  processRejectBulkJob,
  {
    connection: redisConnection,
    prefix: queueConfig.redisKeyPrefix,
    concurrency: 1,
  }
);

for (const worker of [formBulkApproveWorker, formBulkRejectWorker]) {
  worker.on('completed', (job) => {
    logger.info({ queue: worker.name, jobId: job.id }, 'Bulk moderation job completed');
  });
  worker.on('failed', (job, error) => {
    logger.error({ queue: worker.name, jobId: job?.id, error, stack: (error as any)?.stack }, 'Bulk moderation job failed');
  });
}

