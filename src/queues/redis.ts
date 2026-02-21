import { ConnectionOptions } from 'bullmq';
import { queueConfig } from '../config/queue';

/**
 * BullMQ requires maxRetriesPerRequest = null in worker contexts.
 * Reusing one connection config keeps queue/client behavior consistent.
 */
export const redisConnection: ConnectionOptions = {
  host: queueConfig.redis.host,
  port: queueConfig.redis.port,
  password: queueConfig.redis.password || undefined,
  db: queueConfig.redis.db,
  maxRetriesPerRequest: null,
};

