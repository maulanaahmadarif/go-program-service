import { Request, Response } from 'express';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import ExcelJS from 'exceljs'

import { FormType } from '../../models/FormType';
import { Form } from '../../models/Form';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { sequelize } from '../db';
import { logAction } from '../middleware/log';
import { UserAction } from '../../models/UserAction';
import { Project } from '../../models/Project';
import { sendEmail } from '../services/mail';
import { formatJsonToLabelValueString, getUserType } from '../utils';
import { calculateBonusPoints } from '../utils/points';

export const approveSubmission = async (req: any, res: Response) => {
  const form_id = req.params.form_id;
  const product_quantity = Number(req.body.product_quantity) || 0;

  try {
    if (form_id) {
      const [numOfAffectedRows, updatedForms] = await Form.update(
        { status: 'approved' },
        { where: { form_id }, returning: true }
      )

      if (numOfAffectedRows > 0) {
        const updatedForm = updatedForms[0]; // Access the first updated record
        let additionalPoint = calculateBonusPoints(updatedForm.form_type_id, product_quantity);

        const user = await User.findByPk(updatedForm.user_id);
        const company = await Company.findByPk(user?.company_id);
        const formType = await FormType.findByPk(updatedForm.form_type_id);

        // Check for completion bonus based on user type
        const currentDate = dayjs();
        const targetDate = dayjs('2025-03-14');
        
        if (currentDate.isBefore(targetDate)) {
          const approvedSubmissionsCount = await Form.count({
            where: {
              user_id: updatedForm.user_id,
              project_id: updatedForm.project_id,
              status: 'approved'
            }
          });

          if (user?.user_type === 'T2' && approvedSubmissionsCount === 6) {
            additionalPoint += 200; // Add bonus points for T2 user completing 6 submissions
          } else if (user?.user_type === 'T1' && approvedSubmissionsCount === 4) {
            additionalPoint += 200; // Add bonus points for T1 user completing 4 submissions
          }
        }

        if (user && formType) {
          user.total_points = (user.total_points || 0) + formType.point_reward + additionalPoint;
          user.accomplishment_total_points = (user.accomplishment_total_points || 0) + formType.point_reward + additionalPoint;
          await user.save();
        }
    
        if (company && formType) {
          company.total_points = (company.total_points || 0) + formType.point_reward + additionalPoint;
          await company.save();
        }
    
        // await logAction(userId, req.method, 1, 'FORM', req.ip, req.get('User-Agent'));
    
        await UserAction.create({
          user_id: user!.user_id,
          entity_type: 'FORM',
          action_type: req.method,
          form_id: Number(form_id),
          // ip_address: req.ip,
          // user_agent: req.get('User-Agent'),
        });

        let htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'approveEmail.html'), 'utf-8');
        let subjectEmail = 'Congratulations! Your Submission is Approved'

        htmlTemplate = htmlTemplate
          .replace('{{username}}', user!.username)

        await sendEmail({ to: user!.email, subject: subjectEmail, html: htmlTemplate });

      } else {
        res.status(400).json({ message: 'No record found with the specified form_id.', status: res.status });
      }
      
      res.status(200).json({ message: 'Form approved', status: res.status });
    } else {
      res.status(400).json({ message: 'Form failed to approve', status: res.status });
    }
  } catch (error: any) {
    console.error('Error creating form type:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const deleteForm = async (req: Request, res: Response) => {
  const form_id = req.params.form_id;
  const reason = req.query.reason as string

  try {
    if (form_id) {
      const [numOfAffectedRows, updatedForms] = await Form.update(
        { status: 'rejected', note: reason },
        { where: { form_id }, returning: true }
      )

      if (numOfAffectedRows > 0) {
        const updatedForm = updatedForms[0]; // Access the first updated record

        const user = await User.findByPk(updatedForm.user_id);
        const project = await Project.findByPk(updatedForm.project_id);
        const formType = await FormType.findByPk(updatedForm.form_type_id);
        // await logAction(userId, req.method, 1, 'FORM', req.ip, req.get('User-Agent'));
    
        await UserAction.create({
          user_id: user!.user_id,
          entity_type: 'FORM',
          action_type: req.method,
          form_id: Number(form_id),
          note: reason,
          // ip_address: req.ip,
          // user_agent: req.get('User-Agent'),
        });

        let htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'rejectEmail.html'), 'utf-8');

        htmlTemplate = htmlTemplate
          .replace('{{username}}', user!.username)
          .replace('{{project}}', project!.name)
          .replace('{{milestone}}', formType!.form_name)
          .replace('{{reason}}', reason)

        await sendEmail({ to: user!.email, subject: 'Your Submission is Rejected!', html: htmlTemplate });

      } else {
        res.status(400).json({ message: 'No record found with the specified form_id.', status: res.status });
      }
      
      res.status(200).json({ message: 'Form deleted', status: res.status });
    } else {
      res.status(400).json({ message: 'Form failed to delete', status: res.status });
    }
  } catch (error: any) {
    console.error('Error creating form type:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const createFormType = async (req: Request, res: Response) => {
  const { form_name, point_reward } = req.body;

  try {
    const formType = await FormType.create({
      form_name,
      point_reward
    })

    res.status(200).json({ message: `${form_name} created`, status: res.status });
  } catch (error: any) {
    console.error('Error creating form type:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const formSubmission = async (req: any, res: Response) => {
  const { form_type_id, form_data, project_id, product_quantity = 0 } = req.body;

  const transaction = await sequelize.transaction();

  const userId = req.user?.userId;
  let isProjectFormCompleted = false;
  
  try {
    // Check if this is user's first submission
    const previousSubmissions = await Form.count({
      where: {
        user_id: userId,
      },
      transaction
    });

    const submission = await Form.create({
      user_id: userId,
      form_type_id,
      form_data,
      project_id,
      status: 'submitted'
    })

    // Update user points based on the form submission
    const user = await User.findByPk(userId, { 
      transaction,
      include: [{
        model: User,
        as: 'referrer'
      }]
    });

    // If this is first submission and user was referred, add bonus points
    if (previousSubmissions === 0 && user?.referred_by) {
      // Add 200 points to the user
      await user.update({
        total_points: (user.total_points || 0) + 200,
        accomplishment_total_points: (user.accomplishment_total_points || 0) + 200
      }, { transaction });

      // Add 100 points to the referrer
      if (user.referrer) {
        await user.referrer.update({
          total_points: (user.referrer.total_points || 0) + 100,
          accomplishment_total_points: (user.referrer.accomplishment_total_points || 0) + 100
        }, { transaction });

        // Update referrer's company points
        const referrerCompany = await Company.findByPk(user.referrer.company_id, { transaction });
        if (referrerCompany) {
          await referrerCompany.update({
            total_points: (referrerCompany.total_points || 0) + 100
          }, { transaction });
        }
      }

      // Update user's company points
      const userCompany = await Company.findByPk(user.company_id, { transaction });
      if (userCompany) {
        await userCompany.update({
          total_points: (userCompany.total_points || 0) + 200
        }, { transaction });
      }
    }

    const formsCount = await Form.count(
      {
        where: {
          user_id: userId,
          project_id: project_id,
          status: {
            [Op.or]: ['submitted', 'approved']
          }
        },
        transaction
      }
    )

    const currentDate = dayjs();
    const targetDate = dayjs('2025-03-14');
  
    if (currentDate.isBefore(targetDate, 'day')) {
      if (user?.user_type === 'T2') {
        if (formsCount === 6) {
          isProjectFormCompleted = true;
        }
      } else if (user?.user_type === 'T1') {
        if (formsCount === 4) {
          isProjectFormCompleted = true;
        }
      }
    }

    await UserAction.create({
      user_id: userId,
      entity_type: 'FORM',
      action_type: 'SUBMITTED',
      form_id: submission.form_id,
    }, { transaction });

    await transaction.commit();

    res.status(200).json({ 
      message: `Form successfully submitted`, 
      status: res.status, 
      data: { 
        form_completed: isProjectFormCompleted,
        first_submission_bonus: previousSubmissions === 0 && user?.referred_by ? true : false
      } 
    });
  } catch (error: any) {
    await transaction.rollback();
    console.error('Error creating form:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const getFormByProject = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = req.query.projectId;

    const forms = await Form.findAll(
      {
        where: {
          user_id: userId,
          project_id: projectId,
          status: {
            [Op.or]: ['approved', 'submitted']
          }
        }
      }
    )

    res.status(200).json({ message: 'List of forms', status: res.status, data: forms });
  } catch (error: any) {
    console.error('Error fetching forms:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}

export const getFormSubmission = async (req: Request, res: Response) => {
  try {
    const { company_id, user_id, start_date, end_date, status } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const companyWhere: any = {};
    const userWhere: any = {};

    if (company_id) {
      companyWhere.company_id = company_id;
    }

    if (user_id) {
      userWhere.user_id = user_id;
    }

    const whereClause: any = {};

    // Add status filter
    if (status) {
      if (Array.isArray(status)) {
        whereClause.status = {
          [Op.in]: status
        };
      } else {
        whereClause.status = status;
      }
    }
  
    if (start_date) {
      whereClause.createdAt = {
        ...(whereClause.createdAt || {}),
        [Op.gte]: new Date(start_date as any),
      };
    }

    if (end_date) {
      whereClause.createdAt = {
        ...(whereClause.createdAt || {}),
        [Op.lte]: new Date(end_date as any),
      };
    }

    // Get total count for pagination
    const totalCount = await Form.count({
      where: whereClause,
      include: [
        {
          model: User,
          required: true,
          where: userWhere,
          include: [
            {
              model: Company,
              where: companyWhere,
              required: true,
            }
          ]
        }
      ]
    });
    const totalPages = Math.ceil(totalCount / limit);

    const forms = await Form.findAll({
      include: [
        {
          model: User,
          attributes: ['username', 'user_type'],
          required: true,
          where: userWhere,
          include: [
            {
              model: Company,
              attributes: ['name'],
              where: companyWhere,
              required: true,
            }
          ]
        },
        {
          model: Project,
          attributes: ['name']
        },
        {
          model: FormType,
          attributes: ['form_name', 'point_reward', 'form_type_id']
        }
      ],
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // Transform forms to include points calculation
    const transformedForms = forms.map(form => {
      const plainForm = form.get({ plain: true }) as any;
      let points = 0;
      let bonus_points = 0;

      if (plainForm.status === 'approved') {
        points = plainForm.form_type.point_reward;
        
        // Calculate bonus points based on product quantity if exists
        let product_quantity = 0;
        if (plainForm.form_data && Array.isArray(plainForm.form_data) && plainForm.form_data[0]?.value) {
          if (Array.isArray(plainForm.form_data[0].value)) {
            product_quantity = plainForm.form_data[0].value[0]?.numberOfQuantity || 0;
          }
        }

        // Calculate bonus points using utility function
        bonus_points = calculateBonusPoints(plainForm.form_type.form_type_id, product_quantity);
      }

      return {
        ...plainForm,
        base_points: points,
        bonus_points: bonus_points,
        total_points: points + bonus_points
      };
    });

    res.status(200).json({ 
      message: 'List of forms', 
      status: res.status, 
      data: transformedForms,
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
    console.error('Error fetching forms:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  } 
}

export const downloadSubmission = async (req: Request, res: Response) => {
  try {
    const { company_id, user_id, start_date, end_date } = req.query;
    const companyWhere: any = {};
    const userWhere: any = {};

    if (company_id) {
      companyWhere.company_id = company_id;
    }

    if (user_id) {
      userWhere.user_id = user_id;
    }

    const whereClause: any = {};
  
    if (start_date) {
      whereClause.createdAt = {
        ...(whereClause.createdAt || {}),
        [Op.gte]: new Date(start_date as any),
      };
    }

    if (end_date) {
      whereClause.createdAt = {
        ...(whereClause.createdAt || {}),
        [Op.lte]: new Date(end_date as any),
      };
    }

    const forms = await Form.findAll({
      include: [
        {
          model: User,
          attributes: ['username', 'user_type', 'fullname', 'job_title', 'email', 'phone_number'],
          required: true,
          where: userWhere,
          include: [
            {
              model: Company,
              attributes: ['name'],
              where: companyWhere,
              required: true,
            }
          ]
        },
        {
          model: Project,
          attributes: ['name']
        },
        {
          model: FormType,
          attributes: ['form_name', 'point_reward', 'form_type_id']
        }
      ],
      where: whereClause,
      order: [['createdAt', 'DESC']]
    })
    
    const workbook = new ExcelJS.Workbook();
    
    const worksheet = workbook.addWorksheet('submissions');

    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Company', key: 'company', width: 15 },
      { header: 'Username', key: 'username', width: 15 },
      { header: 'Fullname', key: 'fullname', width: 20 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Phone Number', key: 'phone_number', width: 15 },
      { header: 'Job', key: 'job', width: 15 },
      { header: 'User Type', key: 'user_type', width: 10 },
      { header: 'Project', key: 'project', width: 20 },
      { header: 'Milestone', key: 'milestone', width: 30 },
      { header: 'Submitted At', key: 'created_at', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Points Gained', key: 'points_gained', width: 15 },
      { header: 'Form Data', key: 'form_data', width: 50 }
    ];

    // Add data to the worksheet
    forms.forEach((item, index) => {
      let points_gained = 0;
      if (item.status === 'approved') {
        // Calculate points for approved forms
        const product_quantity = item.form_data && Array.isArray(item.form_data) && 
          item.form_data[0]?.value && Array.isArray(item.form_data[0].value) ? 
          item.form_data[0].value[0]?.numberOfQuantity || 0 : 0;

        const bonus_points = calculateBonusPoints(item.form_type.form_type_id, product_quantity);
        points_gained = item.form_type.point_reward + bonus_points;
      }

      worksheet.addRow({
        no: index + 1,
        company: item.user.company?.name,
        username: item.user.username,
        fullname: item.user.fullname || '-',
        email: item.user.email,
        phone_number: item.user.phone_number || '-',
        job: item.user.job_title || '-',
        user_type: getUserType(item.user.user_type),
        project: item.project.name,
        milestone: item.form_type.form_name,
        created_at: dayjs(item.createdAt).format('DD MMM YYYY HH:mm'),
        status: item.status,
        note: item.note || '-',
        points_gained: points_gained,
        form_data: formatJsonToLabelValueString(item.form_data as any),
      });
    });

    // Set response headers for downloading the file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=submissions.xlsx');

    // Write the Excel file to the response
    await workbook.xlsx.write(res);

    // End the response
    res.end();

  } catch (error: any) {
    console.error('Error fetching forms:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  } 
}

export const getReport = async (req: Request, res: Response) => {
  const userId = 130;

  const user = await User.findByPk(userId)
  const forms = await Form.findAll({
    where: { user_id: userId, status: {
      [Op.or]: ['approved', 'rejected']
    }},
    include: [
      {
        model: User,
        include: [Company]
      },
      {
        model: FormType
      },
      {
        model: Project
      }
    ],
    order: [['status', 'asc']]
  })

  let bonusSignupPoint = 0;

  const currentDate = dayjs(user?.createdAt);
  const targetDate = dayjs('2024-11-23');

  if (currentDate.isBefore(targetDate, 'day')) {
    bonusSignupPoint = 400;
  }

  const newForm = forms.map((item) => {
    let product_quantity = 0;
    if (item.form_data && Array.isArray(item.form_data) && item.form_data[0]?.value) {
      if (Array.isArray(item.form_data[0].value)) {
        product_quantity = item.form_data[0].value[0]?.numberOfQuantity || 0;
      }
    }

    const bonus_point = calculateBonusPoints(item.form_type.form_type_id, product_quantity);

    return {
      username: item.user.username,
      company: item.user.company?.name,
      milestone: item.form_type.form_name,
      base_point: item.form_type.point_reward,
      bonus_point: bonus_point,
      project: item.project.name,
      status: item.status,
      total_point: item.form_type.point_reward + bonus_point,
      submitted_at: dayjs(item.createdAt).format('DD MMM YYYY HH:mm'),
      updated_at: dayjs(item.updatedAt).format('DD MMM YYYY HH:mm'),
    }
  })

  const total = newForm
    .filter(item => item.status === 'approved')
    .reduce((sum, item) => sum + item.total_point, 0);

  // res.json(newForm);
  res.json({
    submission: newForm,
    expected_total: total + bonusSignupPoint,
    current_total: user?.total_points || 0,
    current_acc_total: user?.accomplishment_total_points || 0,
    bonus_registration: bonusSignupPoint,
    diff_point: (total + bonusSignupPoint) - (user?.total_points || 0)
  });
}