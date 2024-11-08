import { Request, Response } from 'express';

import { Company } from '../../models/Company';
import { User } from '../../models/User';
import { Form } from '../../models/Form';
import { Project } from '../../models/Project';
import { FormType } from '../../models/FormType';

export const getProgramDetail = async (req: Request, res: Response) => {
  try {
    const totalCompany = await Company.count({
      include: [
        {
          model: User,
          where: {
            level: 'CUSTOMER',
          },
          required: true, // Ensures only companies with at least one associated user are counted
        },
      ],
    });
    const totalUser = await User.count({ where: { level: 'CUSTOMER' } })
    const totalAccomplishmentPoint = await User.sum('accomplishment_total_points', { where: { level: 'CUSTOMER' } })
    const totalCompanyPoint = await Company.sum('total_points')
    const totalFormSubmission = await Form.count({ where: { status: 'approved' } });

    
    res.status(200).json({
      message: 'Success',
      status: res.status,
      data: {
        total_company: totalCompany,
        total_user: totalUser,
        total_accomplishment_point: totalAccomplishmentPoint,
        total_company_point: totalCompanyPoint,
        total_form_submission : totalFormSubmission,
      }
    });
  } catch (error: any) {
    console.error('Error fetching company:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId // Assuming user ID is passed as a URL parameter

    // Fetch user and related company information
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password_hash', 'level', 'token', 'token_purpose', 'token_expiration'] },
      include: [{ association: 'company', attributes: ['name', 'total_points'] }],
    });

    // Check if user exists
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Send the validated response
    res.status(200).json({ data: user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'An error occurred while fetching the user profile' });
  }
}

export const getProjectList = async (req: Request, res: Response) => {
  try {
    const projects = await Project.findAll(
      {
        include: [
          {
            model: Form,
            where: { status: 'approved' },
            include: [
              {
                model: FormType, // Nested include to get each User's Profile
              },
            ],
          },
        ],
        where: { user_id: req.params.userId },
        order: [['createdAt', 'DESC']]
      }
    )

    res.status(200).json({ message: 'List of projects', status: res.status, data: projects });
  } catch (error: any) {
    console.error('Error fetching projects:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};