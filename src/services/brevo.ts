/**
 * Brevo (Sendinblue) email sender service (Transactional Email API).
 *
 * Env vars:
 * - BREVO_API_KEY           (required)
 * - BREVO_SENDER_EMAIL      (required) e.g. no-reply@example.com
 * - BREVO_SENDER_NAME       (optional) default: Go Pro Lenovo Team
 * - BREVO_BASE_URL          (optional) default: https://api.brevo.com
 */

import logger from '../utils/logger';

interface EmailOptions {
  to: string;
  subject: string;
  cc?: string | string[] | undefined;
  text?: string;
  html?: string;
  bcc?: string;
}

function extractEmail(raw: string): string {
  const trimmed = raw.trim();
  const lt = trimmed.indexOf("<");
  const gt = trimmed.indexOf(">");
  if (lt !== -1 && gt !== -1 && gt > lt + 1) {
    return trimmed.slice(lt + 1, gt).trim();
  }
  return trimmed;
}

function parseEmails(value?: string | string[]): Array<{ email: string }> {
  if (!value) return [];
  const parts = Array.isArray(value)
    ? value.flatMap((v) => v.split(","))
    : value.split(",");

  return parts
    .map((p) => extractEmail(p))
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

export const sendEmailBrevo = async (options: EmailOptions): Promise<void> => {
  const apiKey = process.env.BREVO_API_KEY;
  const baseUrl = process.env.BREVO_BASE_URL || "https://api.brevo.com";
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Go Pro Lenovo Team";

  if (!apiKey) throw new Error("BREVO_API_KEY is not set");
  if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL is not set");

  const endpoint = `${baseUrl.replace(/\/+$/, "")}/v3/smtp/email`;

  const payload: any = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: parseEmails(options.to),
    subject: options.subject,
  };

  // Follow Brevo docs: include htmlContent and/or textContent only when provided.
  // For HTML-template emails, we do not need to send textContent.
  if (options.html) payload.htmlContent = options.html;
  if (options.text) payload.textContent = options.text;

  if (!payload.htmlContent && !payload.textContent) {
    throw new Error("Either `html` or `text` must be provided to send an email");
  }

  const cc = parseEmails(options.cc);
  const bcc = parseEmails(options.bcc);
  if (cc.length) payload.cc = cc;
  if (bcc.length) payload.bcc = bcc;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Brevo send failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      );
    }
  } catch (error: any) {
    logger.error({ error, stack: error.stack, to: options.to, subject: options.subject }, "Email failed (Brevo)");
    throw error;
  }
};

// Backward-compatible exports so existing controllers can keep using `sendEmail(...)`
export const sendEmail = sendEmailBrevo;
// Legacy name kept so any potential imports won't break.
export const sendEmailMailgun = sendEmailBrevo;


