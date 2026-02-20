const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const queueConfig = {
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  redisKeyPrefix: process.env.REDIS_KEY_PREFIX || 'loyalty-program',
  bulk: {
    attempts: toNumber(process.env.BULLMQ_BULK_ATTEMPTS, 2),
    backoffMs: toNumber(process.env.BULLMQ_BULK_BACKOFF_MS, 1000),
    itemConcurrency: toNumber(process.env.BULLMQ_BULK_ITEM_CONCURRENCY, 3),
    maxIds: toNumber(process.env.FORM_BULK_MAX_IDS, 100),
  },
  email: {
    attempts: toNumber(process.env.BULLMQ_EMAIL_ATTEMPTS, 3),
    backoffMs: toNumber(process.env.BULLMQ_EMAIL_BACKOFF_MS, 2000),
    concurrency: toNumber(process.env.BULLMQ_EMAIL_CONCURRENCY, 5),
  },
};

