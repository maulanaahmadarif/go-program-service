import { ConnectionOptions } from 'bullmq';
import { queueConfig } from '../config/queue';

const redisUrl = queueConfig.redisUrl;

/**
 * BullMQ requires maxRetriesPerRequest = null in worker contexts.
 * Reusing one connection config keeps queue/client behavior consistent.
 */
export const redisConnection: ConnectionOptions = {
  url: redisUrl,
  maxRetriesPerRequest: null,
};

