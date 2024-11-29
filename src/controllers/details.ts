import { Request, Response } from 'express';
import { Model, Sequelize, where } from 'sequelize';
import ExcelJS from 'exceljs'
import { Op } from 'sequelize';

import { Company } from '../../models/Company';
import { User } from '../../models/User';
import { Form } from '../../models/Form';
import { Project } from '../../models/Project';
import { FormType } from '../../models/FormType';
import { formatJsonToLabelValueString, getUserType } from '../utils';
import dayjs from 'dayjs';

export const getProgramDetail = async (req: Request, res: Response) => {
  try {
    const totalCompany = await Company.count({
      distinct: true,
      where: {
        status: 'active'
      },
      include: [
        {
          model: User,
          attributes: [],
          where: {
            level: 'CUSTOMER',
            is_active: true,
          },
          required: true, // Ensures only companies with at least one associated user are counted
        },
      ],
      col: 'company_id',
    });
    const totalUser = await User.count({ where: { level: 'CUSTOMER', is_active: true } })
    const totalAccomplishmentPoint = await User.sum('accomplishment_total_points', { where: { level: 'CUSTOMER', is_active: true } })
    // const totalCompanyPoint = await Company.sum('total_points', { where: { status: 'active' } })
    const totalFormSubmission = await Form.count({
      include: [
        {
          model: User,
          attributes: [],
          where: {
            level: 'CUSTOMER',
            is_active: true,
          },
          required: true, // Ensures only companies with at least one associated user are counted
        },
      ]
    });

    
    res.status(200).json({
      message: 'Success',
      status: res.status,
      data: {
        total_company: totalCompany,
        total_user: totalUser,
        total_accomplishment_point: totalAccomplishmentPoint,
        // total_company_point: totalCompanyPoint,
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
            where: { status: { [Op.or]: ['approved', 'rejected', 'submitted'] } },
            include: [
              {
                model: FormType, // Nested include to get each User's Profile
              },
            ],
          },
        ],
        where: { user_id: req.params.userId },
        order: [
          ['createdAt', 'DESC'], // Order projects by createdAt
        ],
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

export const getAllDataDownload = async (req: Request, res: Response) => {
  try {
    const { company_id } = req.query;

    const whereCondition: any = { status: 'active' };

    if (company_id) {
      whereCondition.company_id = company_id;
    }
    const datas = await Company.findAll({
      where: whereCondition,
      include: [
        {
          model: User,  // Include related Users
          attributes: ['username', 'is_active', 'fullname', 'job_title', 'email', 'total_points', 'accomplishment_total_points', 'phone_number', 'user_type'],
          where: {
            level: 'CUSTOMER',
          },
          include: [
            {
              model: Project,  // Include related Forms
              attributes: ['name', 'createdAt'],
              include: [
                {
                  model: Form,
                  attributes: ['form_data', 'status', 'createdAt'],
                  required: true,
                  include: [
                    {
                      model: FormType,
                      attributes: ['form_name', 'form_type_id'],
                    }
                  ],
                }
              ]
            },
          ],
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();

    const worksheet = workbook.addWorksheet('All Data');

    worksheet.columns = [
      { header: 'Company', key: 'company', width: 10 },
      { header: 'Username', key: 'username', width: 10 },
      { header: 'Full Name', key: 'fullname', width: 20 },
      { header: 'Job', key: 'job', width: 30 },
      { header: 'Email', key: 'email', width: 15 },
      { header: 'User Type', key: 'user_type', width: 15 },
      { header: 'Total Point', key: 'total_point', width: 50 },
      { header: 'Accomplishment Point', key: 'accomplishment_point', width: 50 },
      { header: 'Phone Number', key: 'phone', width: 50 },
      { header: 'Project', key: 'project_name', width: 50 },
      { header: 'Project Created', key: 'created_at', width: 10 },
      { header: 'Milestone 1', key: 'milestone1', width: 50 },
      { header: 'Milestone 2', key: 'milestone2', width: 50 },
      { header: 'Milestone 3', key: 'milestone3', width: 50 },
      { header: 'Milestone 4', key: 'milestone4', width: 50 },
      { header: 'Milestone 5', key: 'milestone5', width: 50 },
      { header: 'Milestone 6', key: 'milestone6', width: 50 },
    ];

    // Step 4: Add data to the worksheet, including HTML as text
    datas.forEach((item, index) => {
      item.users.forEach((user) => {

        const milestones = new Array(6).fill(null);

        if (user.user_type === 'T1') {
          if (user?.project[0]?.form) {
            const sortedForm = user?.project[0]?.form.sort((a, b) => a.form_type.form_type_id - b.form_type.form_type_id);

            for (let i = 0; i < 4; i++) {
              if (i < sortedForm.length) {
                const labelValue = (sortedForm[i].form_data as []).map((item: any) => ({
                  label: item.label,
                  value: item.value
                }))
                milestones[i] = `
                    Date Submitted Form: ${dayjs(sortedForm[i].createdAt).format('DD MMM YYYY HH:mm')}\n
                    ${formatJsonToLabelValueString(labelValue)}
                  `;
              }
            }
          }
        } else if (user.user_type === 'T2') {
          if (user?.project[0]?.form) {
            const sortedForm = user?.project[0]?.form.sort((a, b) => a.form_type.form_type_id - b.form_type.form_type_id);

            for (let i = 0; i < 6; i++) {
              if (i < sortedForm.length) {
                const labelValue = (sortedForm[i].form_data as []).map((item: any) => ({
                  label: item.label,
                  value: item.value
                }))
                milestones[i] = `
                    Date Submitted Form: ${dayjs(sortedForm[i].createdAt).format('DD MMM YYYY HH:mm')}\n
                    ${formatJsonToLabelValueString(labelValue)}
                  `;
              }
            }
          }
        }

        worksheet.addRow({
          company: item.name,
          username: user.username,
          fullname: user.fullname,
          job: user.job_title,
          email: user.email,
          user_type: getUserType(user.user_type),
          total_point: user.total_points,
          accomplishment_point: user.accomplishment_total_points,
          phone: user.phone_number,
          project_name: user?.project[0]?.name,
          created_at: user?.project[0]?.createdAt ? dayjs(user?.project[0]?.createdAt).format('DD MMM YYYY HH:mm') : '',
          milestone1: milestones[0],
          milestone2: milestones[1],
          milestone3: milestones[2],
          milestone4: milestones[3],
          milestone5: milestones[4],
          milestone6: milestones[5],
        });

        for (let i = 1; i < user.project.length; i++) {
          const milestonesProject = new Array(6).fill(null);
          if (user.user_type === 'T1') {
            if (user?.project[i]?.form) {
              const sortedForm = user?.project[i]?.form.sort((a, b) => a.form_type.form_type_id - b.form_type.form_type_id);
  
              for (let i = 0; i < 4; i++) {
                if (i < sortedForm.length) {
                  const labelValue = (sortedForm[i].form_data as []).map((item: any) => ({
                    label: item.label,
                    value: item.value
                  }))
                  milestonesProject[i] = `
                    Date Submitted Form: ${dayjs(sortedForm[i].createdAt).format('DD MMM YYYY HH:mm')}\n
                    ${formatJsonToLabelValueString(labelValue)}
                  `;
                }
              }
            }
          } else if (user.user_type === 'T2') {
            if (user?.project[i]?.form) {
              const sortedForm = user?.project[i]?.form.sort((a, b) => a.form_type.form_type_id - b.form_type.form_type_id);
  
              for (let i = 0; i < 6; i++) {
                if (i < sortedForm.length) {
                  const labelValue = (sortedForm[i].form_data as []).map((item: any) => ({
                    label: item.label,
                    value: item.value
                  }))
                  milestonesProject[i] = `
                    Date Submitted Form: ${dayjs(sortedForm[i].createdAt).format('DD MMM YYYY HH:mm')}\n
                    ${formatJsonToLabelValueString(labelValue)}
                  `;
                }
              }
            }
          }

          worksheet.addRow({
            project_name: user.project[i].name,
            created_at: dayjs(user?.project[0]?.createdAt).format('DD MMM YYYY HH:mm'),
            milestone1: milestonesProject[0],
            milestone2: milestonesProject[1],
            milestone3: milestonesProject[2],
            milestone4: milestonesProject[3],
            milestone5: milestonesProject[4],
            milestone6: milestonesProject[5],
          });
        }
      });
    });

    // // Step 5: Set response headers for downloading the file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=users_with_html.xlsx');

    // // Step 6: Write the Excel file to the response
    await workbook.xlsx.write(res);

    // // End the response
    res.end();
    // res.json(datas);
  } catch (error: any) {
    console.error('Error download datas:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}