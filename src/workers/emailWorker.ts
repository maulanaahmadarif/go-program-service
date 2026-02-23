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

const processEmailJob = async (job: Job<EmailJobData>) => {
  if (job.data.type === 'approval') {
    let htmlTemplate = readTemplate('approveEmail.html');
    htmlTemplate = htmlTemplate
      .replace('{{username}}', job.data.username)
      .replace('{{project}}', job.data.projectName)
      .replace('{{milestone}}', job.data.milestoneName);
    await sendEmail({
      to: job.data.to,
      subject: 'Your Milestone Submission is Approved!',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'signup-confirmation') {
    let htmlTemplate = readTemplate('emailConfirmation.html');
    htmlTemplate = htmlTemplate
      .replace('{{userName}}', job.data.username)
      .replace('{{confirmationLink}}', job.data.confirmationLink);
    await sendEmail({
      to: job.data.to,
      subject: 'Email Confirmation - Lenovo Go Pro Program',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'welcome') {
    let htmlTemplate = readTemplate('welcomeEmail.html');
    htmlTemplate = htmlTemplate
      .replace('{{homePageLink}}', job.data.homePageLink)
      .replace('{{faqLink}}', job.data.faqLink);
    await sendEmail({
      to: job.data.to,
      subject: 'Welcome to The Lenovo Go Pro Program',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'password-reset') {
    const htmlTemplate = `<p>You requested a password reset. Click <a href="${job.data.resetUrl}">here</a> to reset your password.</p>`;
    await sendEmail({
      to: job.data.to,
      subject: 'Password Reset',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  if (job.data.type === 'redeem-approval') {
    let htmlTemplate = '';
    let emailSubject = '';
    if (job.data.productId === 7) {
      htmlTemplate = readTemplate('redeemConfirmation.html')
        .replace('{{username}}', job.data.username);
      emailSubject = 'Welcome to Lenovo Go Pro Phase 2 - Starbucks E-Voucher Processing';
    } else {
      htmlTemplate = readTemplate('redeemEmail.html')
        .replace('{{redemptionDate}}', job.data.redemptionDate)
        .replace('{{redemptionItem}}', job.data.redemptionItem)
        .replace('{{partnerName}}', job.data.partnerName)
        .replace('{{email}}', job.data.email)
        .replace('{{phoneNumber}}', job.data.phoneNumber)
        .replace('{{address}}', job.data.address)
        .replace('{{postalCode}}', job.data.postalCode)
        .replace('{{accomplishmentScore}}', job.data.accomplishmentScore)
        .replace('{{currentScore}}', job.data.currentScore);
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
    let htmlTemplate = readTemplate('redeemRejection.html');
    htmlTemplate = htmlTemplate.replace('{{username}}', job.data.username);
    await sendEmail({
      to: job.data.to,
      subject: 'Update on Your Redemption Process',
      html: htmlTemplate,
    });
    return { ok: true };
  }

  let htmlTemplate = readTemplate('rejectEmail.html');
  htmlTemplate = htmlTemplate
    .replace('{{username}}', job.data.username)
    .replace('{{project}}', job.data.projectName)
    .replace('{{milestone}}', job.data.milestoneName)
    .replace('{{reason}}', job.data.reason || '-');
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

