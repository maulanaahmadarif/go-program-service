import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { NextFunction, Request, Response } from 'express';

import { emailNotificationQueue } from './emailQueue';
import { formBulkApproveQueue, formBulkRejectQueue } from './formQueues';

const decodeBasicAuth = (authorizationHeader?: string) => {
  if (!authorizationHeader || !authorizationHeader.startsWith('Basic ')) {
    return null;
  }
  const encoded = authorizationHeader.slice(6);
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex < 0) return null;
  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
};

const unauthorized = (res: Response) => {
  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
  return res.status(401).json({ message: 'Unauthorized' });
};

const bullBoardAuth = (req: Request, res: Response, next: NextFunction) => {
  const username = process.env.BULL_BOARD_USERNAME;
  const password = process.env.BULL_BOARD_PASSWORD;
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, credentials are required.
  if (isProduction && (!username || !password)) {
    return unauthorized(res);
  }

  // In non-production, allow local access when creds are not provided.
  if (!username || !password) {
    return next();
  }

  const credentials = decodeBasicAuth(req.headers.authorization);
  if (!credentials) {
    return unauthorized(res);
  }

  if (credentials.username !== username || credentials.password !== password) {
    return unauthorized(res);
  }

  return next();
};

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(formBulkApproveQueue),
    new BullMQAdapter(formBulkRejectQueue),
    new BullMQAdapter(emailNotificationQueue),
  ],
  serverAdapter,
});

export const bullBoardPath = '/admin/queues';
export const bullBoardRouter = [bullBoardAuth, serverAdapter.getRouter()];

