import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Op } from 'sequelize';
import dayjs from 'dayjs';
import ExcelJS from 'exceljs'

import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { sendEmail } from '../services/mail';
import { getUserType } from '../utils';

export const userLogin = async (req: Request, res: Response) => {
  const { email, password, level = 'CUSTOMER' } = req.body;

  try {
    const user = await User.findOne({ where: { email, level } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(400).json({ message: 'Email has not been confirmed' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.user_id, email: user.email, companyId: user.company_id }, process.env.JWT_SECRET as string, {
      expiresIn: '1d',  // Adjust expiration as needed
    });

    const refreshToken = jwt.sign({ userId: user.user_id, email: user.email, companyId: user.company_id }, process.env.REFRESH_JWT_SECRET as string, {
      expiresIn: '7d',  // Adjust expiration as needed
    });

    const userDetail = {
      user_id: user.user_id,
      email: user.email,
      company_id: user.company_id,
      program_saled_id: user.program_saled_id,
      job: user.job_title,
      username: user.username,
      user_point: user.total_points,
      phone_number: user.phone_number,
      user_type: user.user_type
    }

    res.status(200).json({ message: 'Login successful', token, refreshToken, user: userDetail });
  } catch (error) {
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const addInternalUser = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      username,
      phone_number,
      job_title,
      user_type,
      fullname,
    } = req.body

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in the database
    const user = await User.create({
      username,
      company_id: 1,
      email,
      user_type,
      password_hash: hashedPassword,
      program_saled_id: 'admin',
      phone_number,
      job_title,
      fullname,
      level: 'INTERNAL',
      is_active: true
    });
    // Return the created user
    res.status(200).json({ user });
  } catch (error: any) {
    console.error('Error creating user:', error);

    // Handle validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }

    // Handle database connection or other errors
    return res.status(500).json({ message: 'An error occurred while creating the user' });
  }
}

export const userSignup = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      username,
      program_saled_id,
      phone_number,
      job_title,
      company_id,
      user_type,
      fullname,
      custom_company,
      referral_code
    } = req.body

    // Check if email already exists
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    // Check if username already exists
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      return res.status(400).json({ message: 'Username is already taken' });
    }

    // Check if referral code exists if provided
    if (referral_code) {
      const referrer = await User.findOne({ where: { referral_code } });
      if (!referrer) {
        return res.status(400).json({ message: 'Invalid referral code' });
      }
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const token = crypto.randomBytes(32).toString('hex');

    let normalize_company_id = company_id
    let normalize_program_saled_id = program_saled_id;

    if (!company_id) {
      const customCompany = await Company.create({ name: custom_company, industry: 'Custom Company', total_points: 0 })
      normalize_company_id = customCompany.company_id;
      normalize_program_saled_id = `${program_saled_id}-0${customCompany.company_id}`
    }

    // Check if referral code exists
    let referrerId: number | undefined = undefined;
    if (referral_code) {
      const referrer = await User.findOne({ where: { referral_code } });
      if (referrer) {
        referrerId = referrer.user_id;
      }
    }

    // Generate unique referral code for new user
    const newReferralCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Create user in the database
    const user = await User.create({
      username,
      company_id: normalize_company_id,
      email,
      user_type,
      password_hash: hashedPassword,
      program_saled_id: normalize_program_saled_id,
      phone_number,
      job_title,
      total_points: 0,
      accomplishment_total_points: 0,
      fullname,
      token,
      token_purpose: 'EMAIL_CONFIRMATION',
      token_expiration: new Date(Date.now() + 3600000),
      referral_code: newReferralCode,
      referred_by: referrerId
    });

    const userProfile = {
      id: user.user_id,
      username: user.username,
      email: user.email,
      company: user.company?.name ?? null,
      phone_number: user.phone_number ?? null,
      job_title: user.job_title ?? null,
      user_point: user.total_points,
      company_point: user.company?.total_points,
      referral_code: user.referral_code
    };

    const company = await Company.findByPk(company_id);

    if (company) {
      company.total_points = company.total_points as number + 0;
      await company.save();
    }

    // If user was referred, add points to both users after email confirmation
    if (referrerId) {
      // We'll add the points when the user confirms their email
      // This is handled in the userSignupConfirmation endpoint
    }

    let htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'emailConfirmation.html'), 'utf-8');

    htmlTemplate = htmlTemplate
      .replace('{{userName}}', user.username)
      .replace('{{confirmationLink}}', `${process.env.APP_URL}/email-confirmation?token=${token}`)

    await sendEmail({ to: user.email, bcc: process.env.EMAIL_BCC, subject: 'Email Confirmation - Lenovo Go Pro Program', html: htmlTemplate });

    // Return the created user
    res.status(200).json({ user: userProfile });
  } catch (error: any) {
    console.error('Error creating user:', error);

    // Handle validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: error.errors.map((err: { path: string; message: string }) => ({ 
          field: err.path, 
          message: err.message 
        }))
      });
    }

    // Handle database connection or other errors
    return res.status(500).json({ message: 'An error occurred while creating the user' });
  }
};

export const getUserProfile = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Fetch user and related company information
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password_hash'] },
      include: [
        { 
          model: Company, 
          attributes: ['name', 'total_points'] 
        },
        {
          model: User,
          as: 'referrer',
          attributes: ['username'],
        }
      ],
    });

    // Check if user exists
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const total_company_points = await User.sum('accomplishment_total_points', {
      where: {
        company_id: user.company_id,
        level: 'CUSTOMER',
        is_active: true
      }
    });

    // Build the user profile response
    const userProfile = {
      id: user.user_id,
      username: user.username,
      program_saled_id: user.program_saled_id,
      email: user.email,
      company: user.company?.name ?? null,
      phone_number: user.phone_number ?? null,
      job_title: user.job_title ?? null,
      user_point: user.total_points,
      company_point: total_company_points,
      accomplishment_total_points: user.accomplishment_total_points,
      fullname: user.fullname,
      user_type: user.user_type,
      referral_code: user.referral_code,
      referred_by: user.referrer?.username || null
    };

    // Basic response validation: Check required fields
    if (!userProfile.id || !userProfile.email) {
      console.error('Response validation error: Missing required fields');
      return res.status(500).json({ message: 'Response validation failed: Missing required fields' });
    }

    // Send the validated response
    res.status(200).json({ ...userProfile });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'An error occurred while fetching the user profile' });
  }
}

export const getUserList = async (req: Request, res: Response) => {
  try {
    const { company_id, user_type, start_date, end_date } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const whereCondition: any = { level: 'CUSTOMER', is_active: true };

    if (company_id) {
      whereCondition.company_id = company_id;
      delete whereCondition.is_active;
    }

    if (user_type) {
      whereCondition.user_type = user_type;
    }

    // Add date range filters if provided
    if (start_date) {
      whereCondition.createdAt = {
        ...(whereCondition.createdAt || {}),
        [Op.gte]: new Date(start_date as string),
      };
    }

    if (end_date) {
      whereCondition.createdAt = {
        ...(whereCondition.createdAt || {}),
        [Op.lte]: new Date(end_date as string),
      };
    }

    const sortField: string = (req.query.sortBy as string) || 'total_points';
    const orderDirection: 'asc' | 'desc' = (req.query.order as 'asc' | 'desc') || 'desc';

    // Get total count for pagination
    const totalCount = await User.count({ where: whereCondition });
    const totalPages = Math.ceil(totalCount / limit);

    const users = await User.findAll({
      where: whereCondition,
      attributes: { exclude: ['password_hash', 'level', 'token', 'token_purpose', 'token_expiration'] },
      include: [{
        model: User,
        as: 'referrer',
        attributes: ['username'],
      },
      {
        model: Company,
        attributes: ['name'],
      }],
      order: [[sortField, orderDirection]],
      limit,
      offset
    });

    // Transform the response to include referrer username and company name
    const transformedUsers = users.map(user => {
      const plainUser = user.toJSON();
      return {
        ...plainUser,
        // @ts-ignore
        referrer_username: plainUser.referrer?.username || null,
        // @ts-ignore
        company_name: plainUser.company?.name || null,
        referrer: undefined,
        company: undefined,
        created_at: dayjs(plainUser.createdAt).format('DD MMM YYYY HH:mm')
      };
    });

    res.status(200).json({ 
      message: 'List of users', 
      status: res.status, 
      data: transformedUsers,
      pagination: {
        total_items: totalCount,
        total_pages: totalPages,
        current_page: page,
        items_per_page: limit,
        has_next: page < totalPages,
        has_previous: page > 1
      }
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate a reset token
    const token = crypto.randomBytes(32).toString('hex');
    user.token = token;
    user.token_purpose = 'PASSWORD_RESET';
    user.token_expiration = new Date(Date.now() + 3600000); // 1 hour expiration
    await user.save();

    // Send email
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
    await sendEmail({ to: email, bcc: process.env.EMAIL_BCC, subject: 'Password Reset', html: `<p>You requested a password reset. Click <a href="${resetUrl}">here</a> to reset your password.</p>` });

    res.status(200).json({ message: 'Reset link sent to your email' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong' });
  }
}

export const userSignupConfirmation = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Find user by token
    const user = await User.findOne({
      where: {
        token,
        token_purpose: 'EMAIL_CONFIRMATION',
        token_expiration: {
          [Op.gt]: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Update user status and points
    user.is_active = true;
    user.token = '';
    user.token_purpose = 'EMAIL_CONFIRMATION';
    user.token_expiration = new Date();
    await user.save();

    // Update company points
    const company = await Company.findByPk(user.company_id);
    if (company) {
      company.total_points = (company.total_points || 0);
      await company.save();
    }

    let htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'welcomeEmail.html'), 'utf-8');

    htmlTemplate = htmlTemplate
      .replace('{{homePageLink}}', process.env.APP_URL as string)
      .replace('{{faqLink}}', `${process.env.APP_URL}/faq`)

    await sendEmail({ to: user.email, subject: 'Welcome to The Lenovo Go Pro Program', html: htmlTemplate });

    res.status(200).json({ message: 'Email confirmed successfully' });
  } catch (error) {
    console.error('Error confirming email:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  try {
    const user = await User.findOne({
      where: {
        token: token,
        token_expiration: {
          [Op.gt]: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Update the password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password_hash = hashedPassword; // You should hash the password here!
    user.token = null as any;
    user.token_purpose = null as any;
    user.token_expiration = null as any;
    await user.save();

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong' });
  }
}

export const updateUser = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { fullname } = req.body;

    // Update the user's email and password
    const [updatedRowsCount] = await User.update(
      {
          fullname,
      },
      {
          where: { user_id: userId },
      }
    );

    if (updatedRowsCount === 0) {
      return res.status(400).json({ message: 'User not found or no changes made.' });
    }

    console.log(`Updated ${updatedRowsCount} user(s)`);
    res.status(200).json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
}

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const userId = req.params.user_id;
    const user = await User.findByPk(userId)

    if (user) {
      const company = await Company.findByPk(user.company_id)
      if (company) {
        company.total_points = (company.total_points || 0) - (user.accomplishment_total_points || 0)
        await company.save();
      }
      user.is_active = false;
      user.total_points = 0;
      user.accomplishment_total_points = 0;
      await user.save();
      res.status(200).json({ message: 'User deleted', status: res.status });
      return;
    } else {
      return res.status(404).json({ message: 'User not found' });
    }
  } catch (error: any) {
    console.error('Error delete user:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}

export const activateUser = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.body;

    let bonusSignupPoint = 0;

    const currentDate = dayjs();

    // Define the target comparison date
    const targetDate = dayjs('2024-11-23');

    if (currentDate.isBefore(targetDate, 'day')) {
      bonusSignupPoint = 400;
    }

    // Update the user's email and password
    const [updatedRowsCount] = await User.update(
      {
          is_active: true,
          total_points: bonusSignupPoint,
          accomplishment_total_points: bonusSignupPoint,
      },
      {
          where: { user_id: user_id },
      }
    );

    if (updatedRowsCount === 0) {
      return res.status(400).json({ message: 'User not found or no changes made.' });
    }

    res.status(200).json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
}

export const bulkGenerateReferralCodes = async (req: Request, res: Response) => {
  try {
    // Find all users without referral codes or with empty referral codes
    const usersWithoutCodes = await User.findAll({
      where: {
        referral_code: null,
        level: 'CUSTOMER',
        is_active: true
      } as any
    });

    if (usersWithoutCodes.length === 0) {
      return res.status(200).json({ 
        message: 'No users found without referral codes',
        updated_count: 0
      });
    }

    const updatedUsers = [];
    
    for (const user of usersWithoutCodes) {
      let isUnique = false;
      let newReferralCode = '';

      while (!isUnique) {
        // Generate a new 8-character referral code
        newReferralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        
        // Check if this code already exists
        const existingCode = await User.findOne({ where: { referral_code: newReferralCode } });
        if (!existingCode) {
          isUnique = true;
        }
      }

      // Update user with new referral code
      user.referral_code = newReferralCode;
      await user.save();

      updatedUsers.push({
        user_id: user.user_id,
        username: user.username,
        referral_code: newReferralCode
      });
    }

    res.status(200).json({ 
      message: 'Referral codes generated successfully',
      updated_count: updatedUsers.length,
      updated_users: updatedUsers
    });

  } catch (error) {
    console.error('Error generating referral codes:', error);
    res.status(500).json({ message: 'An error occurred while generating referral codes' });
  }
};
