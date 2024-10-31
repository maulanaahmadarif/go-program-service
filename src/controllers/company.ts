import { Request, Response } from 'express';

import { Company } from '../../models/Company';
import { sendEmail } from '../services/mail';

export const createCompany = async (req: Request, res: Response) => {
  const { name, address, industry } = req.body;

  try {
    const company = await Company.create({
      name,
      address,
      industry
    })

    res.status(200).json({ message: 'Company created', status: res.status });
  } catch (error: any) {
    console.error('Error creating company:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const getCompanyList = async (req: Request, res: Response) => {
  try {
    const sortField: string = (req.query.sortBy as string) || 'total_points';
    const orderDirection: 'asc' | 'desc' = (req.query.order as 'asc' | 'desc') || 'desc';

    const companies = await Company.findAll(
      { order: [[sortField, orderDirection]] }
    )

    res.status(200).json({ message: 'List of company', status: res.status, data: companies });
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