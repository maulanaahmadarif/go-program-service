import { Request, Response } from 'express';
import { Sequelize } from 'sequelize';

import { Company } from '../../models/Company';
import { sequelize } from '../db';
import { User } from '../../models/User';
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
    const { fetch_all = 0 } = req.query;
    const sortField: string = (req.query.sortBy as string) || 'total_points';
    const orderDirection: 'asc' | 'desc' = (req.query.order as 'asc' | 'desc') || 'desc';

    const companies = await Company.findAll(
      {
        order: [[
          Sequelize.literal('total_company_points'), // Order by the virtual field
          orderDirection,
        ]],
        attributes: {
          include: [
            // Add a virtual field "userCount" to count the number of users in each company
            [Sequelize.fn('SUM', Sequelize.col('users.accomplishment_total_points')), 'total_company_points'],
            [Sequelize.fn('COUNT', Sequelize.col('users.user_id')), 'total_users']
          ]
        },
        where: {
          status: 'active'
        },
        include: [
          {
            model: User,
            attributes: [], // Exclude user fields, we only want the count
            where: {
              level: 'CUSTOMER'
            },
            required: Number(fetch_all) === 0
          },
        ],
        group: ['Company.company_id'],
      }
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

export const getCompanyDetail = async (req: Request, res: Response) => {
  try {
    const { company_id } = req.params
    const sortField: string = (req.query.sortBy as string) || 'total_points';
    const orderDirection: 'asc' | 'desc' = (req.query.order as 'asc' | 'desc') || 'desc';

    const companies = await Company.findByPk(company_id, {
      order: [[sortField, orderDirection]],
      attributes: {
        include: [
          // Add a virtual field "userCount" to count the number of users in each company
          [Sequelize.fn('SUM', Sequelize.col('users.accomplishment_total_points')), 'total_company_points'],
          [
            Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN users.is_active = true THEN 1 END")),
            'total_users'
          ],
        ]
      },
      include: [
        {
          model: User,
          where: {
            level: 'CUSTOMER',
          },
          attributes: [], // Exclude user fields, we only want the count
          required: true
        },
      ],
      group: ['Company.company_id'],
    })

    res.status(200).json({ message: 'Company Detail', status: res.status, data: companies });
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

export const mergeCompany = async (req: Request, res: Response) => {
  const { sourceId, destinationId } = req.body;

  try {
    const transaction = await sequelize.transaction();

    const sourceCompany = await Company.findByPk(sourceId, { transaction });
    const destinationCompany = await Company.findByPk(destinationId, { transaction });

    if (!sourceCompany) {
      res.status(400).json({ message: 'Source company not found.', status: res.status });
      return;
    }
    if (!destinationCompany) {
      res.status(400).json({ message: 'Destination company not found.', status: res.status });
      return;
    }

    // Combine points
    const combinedPoints = (sourceCompany.total_points || 0) + (destinationCompany.total_points || 0);

    // Update destination company points
    await destinationCompany.update({ total_points: combinedPoints }, { transaction });

    await User.update(
      { company_id: destinationId },
      { where: { company_id: sourceId }, transaction },
    )

    await sourceCompany.destroy({ transaction });

    // Commit the transaction if all operations are successful
    await transaction.commit();

    res.status(200).json({ message: 'Company merged', status: res.status });
  } catch (error: any) {
    console.error('Error merge company:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const deleteCompany = async (req: Request, res: Response) => {
  try {
    const companyId = req.params.company_id;
    await Company.update({ status: 'deleted', total_points: 0 }, { where: { company_id: Number(companyId) } })
    await User.update({ is_active: false, total_points: 0, accomplishment_total_points: 0 }, { where: { company_id: Number(companyId) } })

    res.status(200).json({ message: 'Company deleted', status: res.status });
  } catch (error: any) {
    console.error('Error delete company:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}