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

