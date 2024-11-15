import { Request, Response } from 'express';
import { Model, Sequelize } from 'sequelize';
import ExcelJS from 'exceljs'

import { Company } from '../../models/Company';
import { User } from '../../models/User';
import { Form } from '../../models/Form';
import { Project } from '../../models/Project';
import { FormType } from '../../models/FormType';

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
    const totalAccomplishmentPoint = await User.sum('accomplishment_total_points', { where: { level: 'CUSTOMER' } })
    const totalCompanyPoint = await Company.sum('total_points')
    const totalFormSubmission = await Form.count({
      where: { status: 'approved' },
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

// export const getAllDataDownload = async (req: Request, res: Response) => {
//   try {
    
//     const datas = await Company.findAll({
//       where: { status: 'active' },
//       include: [
//         {
//           model: User,  // Include related Users
//           attributes: ['username'],
//           where: {
//             level: 'CUSTOMER',
//             is_active: true,
//           },
//           include: [
//             {
//               model: Project,  // Include related Forms
//               attributes: ['name'],
//               required: true,
//               include: [
//                 {
//                   model: Form,
//                   where: { status: 'approved' },
//                   attributes: ['form_data', 'status'],
//                   required: true,
//                   include: [
//                     {
//                       model: FormType,
//                       attributes: ['form_name'],
//                     }
//                   ]
//                 }
//               ]
//             },
//           ],
//         },
//       ],
//     });

//     const workbook = new ExcelJS.Workbook();
    

//     // Step 4: Add data to the worksheet, including HTML as text
//     datas.forEach((item, index) => {
//       const worksheet = workbook.addWorksheet(item.name);

//       worksheet.columns = [
//         { header: 'Username', key: 'username', width: 10 },
//         { header: 'Full Name', key: 'fullname', width: 20 },
//         { header: 'Job', key: 'job', width: 30 },
//         { header: 'Email', key: 'email', width: 15 },
//         { header: 'Total Point', key: 'total_point', width: 50 },
//         { header: 'Accomplishment Poiny', key: 'accomplishment_point', width: 50 },
//         { header: 'Phone Number', key: 'phone', width: 50 },
//         { header: 'Project', key: 'project_name', width: 50 },
//         // { header: 'Form Submission', key: 'forms', width: 50 },
//       ];

//       const user = item.users[index];

//       worksheet.addRow({
//         username: user.username,
//         fullname: user.fullname,
//         job: user.job_title,
//         email: user.email,
//         total_point: user.total_points,
//         accomplishment_point: user.accomplishment_total_points,
//         phone: user.phone_number,
//         project_name: user.project,
//       });
//     });

//     // Step 5: Set response headers for downloading the file
//     res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//     res.setHeader('Content-Disposition', 'attachment; filename=users_with_html.xlsx');

//     // Step 6: Write the Excel file to the response
//     await workbook.xlsx.write(res);

//     // End the response
//     res.end();
//     // res.json(datas);
//   } catch (error: any) {
//     console.error('Error fetching projects:', error);

//     // Handle validation errors from Sequelize
//     if (error.name === 'SequelizeValidationError') {
//       const messages = error.errors.map((err: any) => err.message);
//       return res.status(400).json({ message: 'Validation error', errors: messages });
//     }

//     // Handle other types of errors
//     res.status(500).json({ message: 'Something went wrong', error });
//   }
// }