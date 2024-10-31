import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport'

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
} as SMTPTransport.Options);

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    const mailOptions = {
      from: `"Go Pro Lenovo Team" <${process.env.EMAIL_USER}>`, // Sender address
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      bcc: process.env.EMAIL_BCC
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
  }
};