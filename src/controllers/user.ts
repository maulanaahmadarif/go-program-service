import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { User } from '../../models/User';

export const userLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.user_id, email: user.email, companyId: user.company_id }, process.env.JWT_SECRET as string, {
      expiresIn: '1h',  // Adjust expiration as needed
    });

    res.status(200).json({ message: 'Login successful', token, user_id: user.user_id });
  } catch (error) {
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const userSignup = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      username,
      program_saled_id,
      phone_number,
      job_title,
      company_id
    } = req.body

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in the database
    const user = await User.create({
      username,
      company_id,
      email,
      password_hash: hashedPassword,
      program_saled_id,
      phone_number,
      job_title,
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
    };

    // Return the created user
    res.status(200).json({ user: userProfile });
  } catch (error: any) {
    console.error('Error creating user:', error);

    // Handle validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }

    // Handle database connection or other errors
    return res.status(500).json({ message: 'An error occurred while creating the user' });
  }
};

export const getUserProfile = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId; // Assuming user ID is passed as a URL parameter

    // Fetch user and related company information
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password_hash'] },
      include: [{ association: 'company', attributes: ['name', 'total_points'] }],
    });

    // Check if user exists
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Build the user profile response
    const userProfile = {
      id: user.user_id,
      email: user.email,
      company: user.company?.name ?? null,
      phone_number: user.phone_number ?? null,
      job_title: user.job_title ?? null,
      user_point: user.total_points,
      company_point: user.company?.total_points,
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
    const sortField: string = (req.query.sortBy as string) || 'total_points';
    const orderDirection: 'asc' | 'desc' = (req.query.order as 'asc' | 'desc') || 'desc';

    const users = await User.findAll(
      {
        attributes: { exclude: ['password_hash'] },
        order: [[sortField, orderDirection]]
      }
    )

    res.status(200).json({ message: 'List of users', status: res.status, data: users });
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