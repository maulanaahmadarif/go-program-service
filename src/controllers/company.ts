import { Response } from 'express';
import { Sequelize } from 'sequelize';

import { Company } from '../../models/Company';
import { sequelize } from '../db';
import { User } from '../../models/User';
import { RefreshToken } from '../../models/RefreshToken';
import { VerificationToken } from '../../models/VerificationToken';
import { CustomRequest } from '../types/api';

export const createCompany = async (req: CustomRequest, res: Response) => {
  const { name, address, industry } = req.body;

  try {
    const company = await Company.create({
      name,
      address,
      industry
    })

    res.status(200).json({ message: 'Company created', status: res.status });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error creating company');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      req.log.error({ validationErrors: messages }, 'Validation error occurred');
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const getCompanyList = async (req: CustomRequest, res: Response) => {
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
            [Sequelize.fn('SUM', Sequelize.col('users.lifetime_total_points')), 'lifetime_total_points'],
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

    // const workbook = new ExcelJS.Workbook();
        
    // const worksheet = workbook.addWorksheet('submissions');

    // worksheet.columns = [
    //   { header: 'No', key: 'no', width: 10 },
    //   { header: 'Company Name', key: 'company', width: 10 },
    //   { header: 'Total Points', key: 'total_company_points', width: 10 },
    //   { header: 'User List', key: 'usernames', width: 10 },
    //   { header: 'Created At', key: 'created_at', width: 15 },
    // ];

    // // Step 4: Add data to the worksheet, including HTML as text
    // companies.forEach((item, index) => {
    //   const users = 
    //   // Create the worksheet with the unique name
    //   worksheet.addRow({
    //     no: index + 1,
    //     company: item.name,
    //     total_company_points: item.getDataValue('total_company_points'),
    //     usernames: item.users.map(item => item.username).join('\n'),
    //     created_at: dayjs(item.createdAt).format('DD MMM YYYY'),
    //   });
    // });

    // // // Step 5: Set response headers for downloading the file
    // res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // res.setHeader('Content-Disposition', 'attachment; filename=users_with_html.xlsx');

    // // Step 6: Write the Excel file to the response
    // await workbook.xlsx.write(res);

    // // // End the response
    // res.end();

    res.status(200).json({ message: 'List of company', status: res.status, data: companies });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching company list');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      req.log.error({ validationErrors: messages }, 'Validation error occurred');
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const getCompanyDetail = async (req: CustomRequest, res: Response) => {
  try {
    const { company_id } = req.params
    const orderDirection: 'asc' | 'desc' = (req.query.order as 'asc' | 'desc') || 'desc';

    const companies = await Company.findByPk(company_id, {
      order: [[Sequelize.literal('total_company_points'), orderDirection]],
      attributes: {
        include: [
          // Add a virtual field "userCount" to count the number of users in each company
          [Sequelize.fn('SUM', Sequelize.col('users.accomplishment_total_points')), 'total_company_points'],
          [Sequelize.fn('SUM', Sequelize.col('users.lifetime_total_points')), 'lifetime_total_points'],
          [Sequelize.fn('COUNT', Sequelize.col('users.user_id')), 'total_users'],
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
    req.log.error({ error, stack: error.stack }, 'Error fetching company detail');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      req.log.error({ validationErrors: messages }, 'Validation error occurred');
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const mergeCompany = async (req: CustomRequest, res: Response) => {
  const { sourceId, destinationId } = req.body;
  const transaction = await sequelize.transaction();

  try {

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

    // Update destination company points
    await destinationCompany.update({}, { transaction });

    await User.update(
      { company_id: destinationId },
      { where: { company_id: sourceId }, transaction },
    )

    await sourceCompany.destroy({ transaction });

    // Commit the transaction if all operations are successful
    await transaction.commit();

    res.status(200).json({ message: 'Company merged', status: res.status });
  } catch (error: any) {
    await transaction.rollback();
    req.log.error({ error, stack: error.stack }, 'Error merging company');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      req.log.error({ validationErrors: messages }, 'Validation error occurred');
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const deleteCompany = async (req: CustomRequest, res: Response) => {
  const transaction = await sequelize.transaction();

  try {
    const companyId = req.params.company_id;

    // Get all users in the company
    const users = await User.findAll({
      where: { company_id: Number(companyId) },
      transaction
    });

    // Delete refresh tokens and verification tokens for all users
    const userIds = users.map(user => user.user_id);
    if (userIds.length > 0) {
      await RefreshToken.destroy({
        where: { user_id: userIds },
        transaction
      });

      await VerificationToken.destroy({
        where: { user_id: userIds },
        transaction
      });
    }

    // Delete all users associated with the company
    await User.destroy({
      where: { company_id: Number(companyId) },
      transaction
    });

    // Delete the company
    await Company.destroy({
      where: { company_id: Number(companyId) },
      transaction
    });

    await transaction.commit();
    res.status(200).json({ message: 'Company and associated users deleted successfully', status: res.status });
  } catch (error: any) {
    await transaction.rollback();
    req.log.error({ error, stack: error.stack }, 'Error deleting company');

    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      req.log.error({ validationErrors: messages }, 'Validation error occurred');
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    res.status(500).json({ message: 'Something went wrong', error });
  }
};