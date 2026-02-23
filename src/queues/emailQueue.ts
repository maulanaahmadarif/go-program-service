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

export interface SignupConfirmationEmailJobData {
  type: 'signup-confirmation';
  to: string;
  username: string;
  confirmationLink: string;
  userId: number;
}

export interface WelcomeEmailJobData {
  type: 'welcome';
  to: string;
  homePageLink: string;
  faqLink: string;
  userId: number;
}

export interface PasswordResetEmailJobData {
  type: 'password-reset';
  to: string;
  resetUrl: string;
  userId: number;
}

export interface RedeemApprovalEmailJobData {
  type: 'redeem-approval';
  to: string;
  productId: number;
  username: string;
  redemptionDate: string;
  redemptionItem: string;
  partnerName: string;
  email: string;
  phoneNumber: string;
  address: string;
  postalCode: string;
  accomplishmentScore: string;
  currentScore: string;
  redemptionId: number;
}

export interface RedeemRejectionEmailJobData {
  type: 'redeem-rejection';
  to: string;
  username: string;
  redemptionId: number;
}

export type EmailJobData =
  | ApprovalEmailJobData
  | RejectionEmailJobData
  | SignupConfirmationEmailJobData
  | WelcomeEmailJobData
  | PasswordResetEmailJobData
  | RedeemApprovalEmailJobData
  | RedeemRejectionEmailJobData;

export const emailNotificationQueue = new Queue<
  EmailJobData,
  any,
  | 'approval-email'
  | 'rejection-email'
  | 'signup-confirmation-email'
  | 'welcome-email'
  | 'password-reset-email'
  | 'redeem-approval-email'
  | 'redeem-rejection-email'
>(EMAIL_NOTIFICATION_QUEUE, {
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

export const enqueueSignupConfirmationEmail = async (data: Omit<SignupConfirmationEmailJobData, 'type'>) => {
  await emailNotificationQueue.add(
    'signup-confirmation-email',
    { ...data, type: 'signup-confirmation' },
    { jobId: `signup-confirmation:${data.userId}` }
  );
};

export const enqueueWelcomeEmail = async (data: Omit<WelcomeEmailJobData, 'type'>) => {
  await emailNotificationQueue.add(
    'welcome-email',
    { ...data, type: 'welcome' },
    { jobId: `welcome:${data.userId}` }
  );
};

export const enqueuePasswordResetEmail = async (data: Omit<PasswordResetEmailJobData, 'type'>) => {
  await emailNotificationQueue.add(
    'password-reset-email',
    { ...data, type: 'password-reset' },
    { jobId: `password-reset:${data.userId}` }
  );
};

export const enqueueRedeemApprovalEmail = async (data: Omit<RedeemApprovalEmailJobData, 'type'>) => {
  await emailNotificationQueue.add(
    'redeem-approval-email',
    { ...data, type: 'redeem-approval' },
    { jobId: `redeem-approval:${data.redemptionId}` }
  );
};

export const enqueueRedeemRejectionEmail = async (data: Omit<RedeemRejectionEmailJobData, 'type'>) => {
  await emailNotificationQueue.add(
    'redeem-rejection-email',
    { ...data, type: 'redeem-rejection' },
    { jobId: `redeem-rejection:${data.redemptionId}` }
  );
};

