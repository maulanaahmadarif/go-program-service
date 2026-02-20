import { NextFunction, Request, Response } from 'express';
import IORedis from 'ioredis';

import { queueConfig } from '../config/queue';

let cacheClient: IORedis | null = null;

const getCacheClient = () => {
  if (cacheClient) return cacheClient;
  cacheClient = new IORedis(queueConfig.redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  return cacheClient;
};

const normalizeQuery = (query: Request['query']) => {
  const keys = Object.keys(query).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    const value = query[key];
    if (Array.isArray(value)) {
      normalized[key] = [...value].map(String).sort();
    } else if (value !== undefined) {
      normalized[key] = String(value);
    }
  }
  return normalized;
};

interface CacheGetOptions {
  keyPrefix: string;
  ttlSeconds: number;
  includeUser?: boolean;
}

export const cacheGet = ({ keyPrefix, ttlSeconds, includeUser = false }: CacheGetOptions) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();

    const userId = includeUser ? (req as any).user?.userId : undefined;
    const keyPayload = {
      route: req.baseUrl + req.path,
      query: normalizeQuery(req.query),
      userId: userId || null,
    };
    const namespacedPrefix = `${queueConfig.redisKeyPrefix}:${keyPrefix}`;
    const cacheKey = `${namespacedPrefix}:${JSON.stringify(keyPayload)}`;

    try {
      const client = getCacheClient();
      const cached = await client.get(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(JSON.parse(cached));
      }

      const originalJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          client
            .set(cacheKey, JSON.stringify(body), 'EX', ttlSeconds)
            .catch(() => undefined);
        }
        res.setHeader('X-Cache', 'MISS');
        return originalJson(body);
      }) as Response['json'];
    } catch {
      // Fail open if Redis is unavailable.
    }

    return next();
  };

