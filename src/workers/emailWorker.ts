import fs from 'fs';
import path from 'path';
import { Job, Worker } from 'bullmq';

import { sendEmail } from '../services/brevo';
import logger from '../utils/logger';
import { EMAIL_NOTIFICATION_QUEUE, EmailJobData } from '../queues/emailQueue';
import { redisConnection } from '../queues/redis';
import { queueConfig } from '../config/queue';

const readTemplate = (templateName: string) =>
  fs.readFileSync(path.join(process.cwd(), 'src', 'templates', templateName), 'utf-8');

const escapeHtml = (value: string | number) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const renderTemplate = (
  templateName: string,
  values: Record<string, string | number>
) => Object.entries(values).reduce(
  (template, [key, value]) => template.split(`{{${key}}}`).join(escapeHtml(value)),
  readTemplate(templateName)
);

const processEmailJob = async (job: Job<EmailJobData>) => {
  if (job.data.type === 'approval') {
    const htmlTemplate = renderTemplate('approveEmail.html', {
      username: job.data.username,
      project: job.data.projectName,
      milestone: job.data.milestoneName,
    });
    await sendEmail({
      to: job.data.to,
      subject: 'Your Milestone Submission is Approved!',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'signup-confirmation') {
    const htmlTemplate = renderTemplate('emailConfirmation.html', {
      userName: job.data.username,
      confirmationLink: job.data.confirmationLink,
    });
    await sendEmail({
      to: job.data.to,
      subject: 'Email Confirmation - Lenovo Go Pro Program',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'welcome') {
    const htmlTemplate = renderTemplate('welcomeEmail.html', {
      homePageLink: job.data.homePageLink,
      faqLink: job.data.faqLink,
    });
    await sendEmail({
      to: job.data.to,
      subject: 'Welcome to The Lenovo Go Pro Program',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'password-reset') {
    const htmlTemplate = renderTemplate('passwordReset.html', {
      username: job.data.username,
      resetUrl: job.data.resetUrl,
    });
    await sendEmail({
      to: job.data.to,
      subject: 'Reset Your Lenovo Go Pro Password',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'spin-wheel-confirmation') {
    const isPointsReward = job.data.rewardType === 'points';
    const points = (job.data.pointsAwarded || 0).toLocaleString('en-US');
    const htmlTemplate = renderTemplate('spinWheelConfirmation.html', {
      username: job.data.username,
      prizeName: job.data.prizeName,
      rewardBadge: isPointsReward ? 'POINTS AWARDED' : 'CLAIM RECEIVED',
      rewardDescription: isPointsReward
        ? `${points} points have been added to your Lenovo Go Pro balance.`
        : 'Your reward claim has been submitted and will be processed by the Lenovo Go Pro team.',
      detailLabel: isPointsReward ? 'Points added' : 'Redemption reference',
      detailValue: isPointsReward ? points : `#${job.data.redemptionId || '-'}`,
      actionUrl: job.data.actionUrl,
    });
    await sendEmail({
      to: job.data.to,
      subject: isPointsReward
        ? 'Your Spin Wheel Points Are In!'
        : 'Your Spin Wheel Prize Claim Is Confirmed',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'three-day-quest-confirmation') {
    const isPointsReward = job.data.rewardType === 'points';
    const points = (job.data.pointsAwarded || 0).toLocaleString('en-US');
    const htmlTemplate = renderTemplate('threeDayQuestConfirmation.html', {
      username: job.data.username,
      rewardName: job.data.rewardName,
      rewardBadge: isPointsReward ? 'QUEST POINTS AWARDED' : 'VOUCHER CLAIM RECEIVED',
      rewardDescription: isPointsReward
        ? `${points} points have been added to your Lenovo Go Pro balance.`
        : 'Your voucher claim has been submitted and will be processed by the Lenovo Go Pro team.',
      detailLabel: isPointsReward ? 'Points added' : 'Redemption reference',
      detailValue: isPointsReward ? points : `#${job.data.redemptionId || '-'}`,
      actionUrl: job.data.actionUrl,
    });
    await sendEmail({
      to: job.data.to,
      subject: isPointsReward
        ? '3 Day Quest Complete — Your Points Are In!'
        : '3 Day Quest Complete — Reward Claim Confirmed',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'redeem-approval') {
    let htmlTemplate = '';
    let emailSubject = '';
    if (job.data.productId === 7) {
      htmlTemplate = renderTemplate('redeemConfirmation.html', {
        username: job.data.username,
      });
      emailSubject = 'Welcome to Lenovo Go Pro Phase 2 - Starbucks E-Voucher Processing';
    } else {
      htmlTemplate = renderTemplate('redeemEmail.html', {
        redemptionDate: job.data.redemptionDate,
        redemptionItem: job.data.redemptionItem,
        partnerName: job.data.partnerName,
        email: job.data.email,
        phoneNumber: job.data.phoneNumber,
        address: job.data.address,
        postalCode: job.data.postalCode,
        accomplishmentScore: job.data.accomplishmentScore,
        currentScore: job.data.currentScore,
      });
      emailSubject = 'Lenovo Go Pro Redemption Notification';
    }

    await sendEmail({
      to: job.data.to,
      subject: emailSubject,
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'redeem-rejection') {
    const htmlTemplate = renderTemplate('redeemRejection.html', {
      username: job.data.username,
    });
    await sendEmail({
      to: job.data.to,
      subject: 'Update on Your Redemption Process',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  const htmlTemplate = renderTemplate('rejectEmail.html', {
    username: job.data.username,
    project: job.data.projectName,
    milestone: job.data.milestoneName,
    reason: job.data.reason || '-',
  });
  await sendEmail({
    to: job.data.to,
    subject: 'Your Submission is Rejected!',
    html: htmlTemplate,
  });
  return { ok: true };
};

export const emailWorker = new Worker<EmailJobData>(EMAIL_NOTIFICATION_QUEUE, processEmailJob, {
  connection: redisConnection,
  prefix: queueConfig.redisKeyPrefix,
  concurrency: queueConfig.email.concurrency,
});

emailWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, queue: EMAIL_NOTIFICATION_QUEUE }, 'Email job completed');
});

emailWorker.on('failed', (job, error) => {
  logger.error(
    { jobId: job?.id, queue: EMAIL_NOTIFICATION_QUEUE, error, stack: (error as any)?.stack },
    'Email job failed'
  );
});
