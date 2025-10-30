// import nodemailer from 'nodemailer';
// import SMTPTransport from 'nodemailer/lib/smtp-transport'
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// const transporter = nodemailer.createTransport({
//   host: process.env.EMAIL_HOST,
//   port: process.env.EMAIL_PORT,
//   secure: true,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASSWORD,
//   },
// } as SMTPTransport.Options);

interface EmailOptions {
  to: string;
  subject: string;
  cc?: string | string[] | undefined;
  text?: string;
  html?: string;
  bcc?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  const mailOptions = {
    from: `"Go Pro Lenovo Team" <${process.env.EMAIL_USER}>`,
    to: options.to,
    cc: options.cc,
    subject: options.subject,
    text: options.text ?? '',
    html: options.html,
  };

  // await transporter.sendMail(mailOptions);
  const { data, error } = await resend.emails.send(mailOptions);
  if (error) {
    console.log('Email failed:', error);
  }
  console.log('Email sent successfully:', data);
};
