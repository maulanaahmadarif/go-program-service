import { Queue } from 'bullmq';

import { redisConnection } from './redis';
import { queueConfig } from '../config/queue';

export const EMAIL_NOTIFICATION_QUEUE = 'notification-email';

export interface ApprovalEmailJobData {
  type: 'approval';
  to: string;
  username: string;
  projectName: string;
  milestoneName: string;
  formId: number;
}

export interface RejectionEmailJobData {
  type: 'rejection';
  to: string;
  username: string;
  projectName: string;
  milestoneName: string;
  reason: string;
  formId: number;
}

export type EmailJobData = ApprovalEmailJobData | RejectionEmailJobData;

export const emailNotificationQueue = new Queue<EmailJobData, any, 'approval-email' | 'rejection-email'>(EMAIL_NOTIFICATION_QUEUE, {
  connection: redisConnection,
  prefix: queueConfig.redisKeyPrefix,
  defaultJobOptions: {
    attempts: queueConfig.email.attempts,
    backoff: {
      type: 'exponential',
      delay: queueConfig.email.backoffMs,
    },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});

export const enqueueApprovalEmail = async (data: Omit<ApprovalEmailJobData, 'type'>) => {
  await emailNotificationQueue.add(
    'approval-email',
    { ...data, type: 'approval' },
    { jobId: `approval:${data.formId}` }
  );
};

export const enqueueRejectionEmail = async (data: Omit<RejectionEmailJobData, 'type'>) => {
  await emailNotificationQueue.add(
    'rejection-email',
    { ...data, type: 'rejection' },
    { jobId: `rejection:${data.formId}` }
  );
};

