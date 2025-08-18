import { Request, Response } from 'express';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';
import { Op, QueryTypes } from 'sequelize';
import ExcelJS from 'exceljs'

import { FormType } from '../../models/FormType';
import { Form } from '../../models/Form';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { Product } from '../../models/Product';
import { sequelize } from '../db';
import { logAction } from '../middleware/log';
import { UserAction } from '../../models/UserAction';
import { Project } from '../../models/Project';
import { sendEmail } from '../services/mail';
import { formatJsonToLabelValueString, getUserType } from '../utils';
import { calculateBonusPoints, calculateReferralMilestoneBonus } from '../utils/points';
import { PointTransaction } from '../../models/PointTransaction';
import { UserMysteryBox } from '../../models/UserMysteryBox';

export const approveSubmission = async (req: any, res: Response) => {
  const form_id = req.params.form_id;
  const product_quantity = Number(req.body.product_quantity) || 0;

  const transaction = await sequelize.transaction();

  try {
    if (form_id) {
      const [numOfAffectedRows, updatedForms] = await Form.update(
        { status: 'approved' },
        { where: { form_id }, returning: true, transaction }
      )

      if (numOfAffectedRows > 0) {
        const updatedForm = updatedForms[0]; // Access the first updated record

        // Check if form contains Aura Edition products
        let isAuraEdition = false;
        if (updatedForm.form_data && Array.isArray(updatedForm.form_data)) {
          const productsEntry = updatedForm.form_data.find(entry => entry.label === 'products');
          if (productsEntry && Array.isArray(productsEntry.value)) {
            isAuraEdition = productsEntry.value.some((product: { productCategory?: string }) => product.productCategory === 'Aura Edition');
          }
        }

        let additionalPoint = calculateBonusPoints(updatedForm.form_type_id, product_quantity, isAuraEdition);

        const user = await User.findByPk(updatedForm.user_id, { transaction });
        const company = await Company.findByPk(user?.company_id, { transaction });
        const formType = await FormType.findByPk(updatedForm.form_type_id, { transaction });
        // Check for completion bonus based on user type
        const currentDate = dayjs();
        const targetDate = dayjs('2025-09-20');
        
        if (currentDate.isBefore(targetDate)) {
          const additionalPointCompletionPoint = 200;
          
          const approvedSubmissionsCount = await Form.count({
            where: {
              user_id: updatedForm.user_id,
              project_id: updatedForm.project_id,
              status: 'approved'
            },
            transaction
          });

          if (user?.user_type === 'T2' && approvedSubmissionsCount === 4) {
            additionalPoint += additionalPointCompletionPoint; // Add bonus points for T2 user completing 6 submissions
          } else if (user?.user_type === 'T1' && approvedSubmissionsCount === 4) {
            additionalPoint += additionalPointCompletionPoint; // Add bonus points for T1 user completing 4 submissions
          }
        }

        if (user && formType) {
          const basePoints = formType.point_reward;
          const totalPoints = basePoints + additionalPoint;
          
          // Create point transaction record for base points
          await PointTransaction.create({
            user_id: user.user_id,
            points: basePoints,
            transaction_type: 'earn',
            form_id: Number(form_id),
            description: `Earned ${basePoints} base points for form submission: ${formType.form_name}`
          }, { transaction });

          // Create point transaction record for bonus points if any
          if (additionalPoint > 0) {
            await PointTransaction.create({
              user_id: user.user_id,
              points: additionalPoint,
              transaction_type: 'earn',
              form_id: Number(form_id),
              description: `Earned ${additionalPoint} bonus points for form submission: ${formType.form_name}`
            }, { transaction });
          }

          user.total_points = (user.total_points || 0) + totalPoints;
          user.accomplishment_total_points = (user.accomplishment_total_points || 0) + totalPoints;
          user.lifetime_total_points = (user.lifetime_total_points || 0) + totalPoints;
          await user.save({ transaction });

          // Check for milestone achievements and create mystery boxes
          const totalApprovedForms = await Form.count({
            where: {
              user_id: user.user_id,
              status: 'approved'
            },
            transaction
          });

          // Define milestone thresholds
          const milestones = [5, 10, 50];
          
          for (const milestone of milestones) {
            if (totalApprovedForms >= milestone) {
              // Check if mystery box already exists for this milestone
              const existingMysteryBox = await UserMysteryBox.findOne({
                where: {
                  user_id: user.user_id,
                  milestone_reached: milestone,
                },
                transaction
              });

              if (!existingMysteryBox) {
                // Determine product based on milestone and probability
                let selectedProductId: number;
                
                if (milestone === 5) {
                  // 5 Milestone: 60% +500 points, 40% sbux evoucher
                  const random = Math.random();
                  selectedProductId = random < 0.6 ? 4 : 7; // 4 = +500 points, 7 = sbux evoucher
                } else if (milestone === 10) {
                  // 10 Milestone: 30% +500 points, 70% sbux evoucher
                  const random = Math.random();
                  selectedProductId = random < 0.3 ? 4 : 7; // 4 = +500 points, 7 = sbux evoucher
                } else if (milestone === 50) {
                  // 50 Milestone: 80% sbux points, 20% airpods pro
                  const random = Math.random();
                  selectedProductId = random < 0.8 ? 7 : 9; // 7 = sbux evoucher, 9 = airpods pro
                } else {
                  // Fallback to +500 points if milestone doesn't match
                  selectedProductId = 4;
                }

                // Check if selected product has stock available, fallback to +500 points if out of stock
                if (selectedProductId !== 4) { // Don't check stock for +500 points (ID 4)
                  const selectedProduct = await Product.findByPk(selectedProductId, { transaction });
                  if (!selectedProduct || selectedProduct.stock_quantity <= 0) {
                    selectedProductId = 4; // Fallback to +500 points
                  }
                }

                // Create new mystery box for this milestone with selected product
                await UserMysteryBox.create({
                  user_id: user.user_id,
                  product_id: selectedProductId,
                  milestone_reached: milestone,
                  status: 'available'
                }, { transaction });
              }
            }
          }
        }
    
        if (company && formType) {
          await company.save({ transaction });
        }

        // Get project information for email
        const project = await Project.findByPk(updatedForm.project_id, { transaction });

        await transaction.commit();

        // Send approval email after successful transaction
        if (user && project && formType) {
          let htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'approveEmail.html'), 'utf-8');

          htmlTemplate = htmlTemplate
            .replace('{{username}}', user.username)
            .replace('{{project}}', project.name)
            .replace('{{milestone}}', formType.form_name);

          await sendEmail({ to: user.email, subject: 'Your Milestone Submission is Approved!', html: htmlTemplate });
        }

        res.status(200).json({ message: 'Form approved successfully', status: res.status });
        return;
      }
    }

    await transaction.rollback();
    res.status(404).json({ message: 'Form not found', status: res.status });
  } catch (error) {
    await transaction.rollback();
    console.error('Error approving form:', error);
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
    const submission = await Form.create({
      user_id: userId,
      form_type_id,
      form_data,
      project_id,
      status: 'submitted'
    }, { transaction })

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

    const user = await User.findByPk(userId, { 
      transaction,
      include: [{
        model: User,
        as: 'referrer'
      }]
    });

    const currentDate = dayjs();
    const targetDate = dayjs('2025-06-30');
  
    if (currentDate.isBefore(targetDate, 'day')) {
      if (user?.user_type === 'T2') {
        if (formsCount === 5) {
          isProjectFormCompleted = true;
        }
      } else if (user?.user_type === 'T1') {
        if (formsCount === 4) {
          isProjectFormCompleted = true;
        }
      }
    }

    // Check for form type 4 bonus points
    if (form_type_id === 4 && user) {
      // Check if submission is within the date range: May 1, 2025 to June 20, 2025 end of day
      const startDate = dayjs('2025-08-17T00:00:00');
      const cutoffDate = dayjs('2025-09-20T23:59:59');
      
      if (currentDate.isAfter(startDate) && currentDate.isBefore(cutoffDate)) {
        const type4SubmittedCount = await Form.count({
          where: {
            user_id: userId,
            form_type_id: 4,
            createdAt: {
              [Op.gte]: new Date('2025-08-17T00:00:00.000Z'),
              [Op.lte]: new Date('2025-09-20T23:59:59.999Z')
            }
          },
          transaction
        });

        let bonusPoints = 0;
        if (type4SubmittedCount === 31) { // Passed 30 checkpoint
          bonusPoints = 6000;
        } else if (type4SubmittedCount === 41) { // Passed 40 checkpoint
          bonusPoints = 8000;
        } else if (type4SubmittedCount === 51) { // Passed 50 checkpoint
          bonusPoints = 10000;
        }

        if (bonusPoints > 0) {
          // Create point transaction record for form type 4 milestone bonus
          await PointTransaction.create({
            user_id: user.user_id,
            points: bonusPoints,
            transaction_type: 'earn',
            form_id: submission.form_id,
            description: `Bonus points for passing ${type4SubmittedCount - 1} form type 4 submissions milestone`
          }, { transaction });

          // Update user's points
          user.total_points = (user.total_points || 0) + bonusPoints;
          user.accomplishment_total_points = (user.accomplishment_total_points || 0) + bonusPoints;
          user.lifetime_total_points = (user.lifetime_total_points || 0) + bonusPoints;
          await user.save({ transaction });
        }
      }
    }

    // Check for referral milestone bonus for the referrer
    if (user?.referrer) {
      // Count referred users who have submitted forms for the referrer
      const referredUsersWithForms = await User.count({
        where: {
          referred_by: user.referrer.user_id
        },
        include: [{
          model: Form,
          required: true // This ensures users have at least one form
        }],
        distinct: true,
        transaction
      });

      const referralMilestone = calculateReferralMilestoneBonus(referredUsersWithForms);
      
      if (referralMilestone.bonusPoints > 0 && referralMilestone.milestone) {
        // Award milestone bonus to the referrer
        const referrer = user.referrer;
        
        // Create point transaction record for referral milestone bonus
        await PointTransaction.create({
          user_id: referrer.user_id,
          points: referralMilestone.bonusPoints,
          transaction_type: 'earn',
          description: `Referral milestone bonus for reaching ${referralMilestone.milestone} referred users with form submissions`
        }, { transaction });

        // Update referrer's points
        referrer.total_points = (referrer.total_points || 0) + referralMilestone.bonusPoints;
        referrer.accomplishment_total_points = (referrer.accomplishment_total_points || 0) + referralMilestone.bonusPoints;
        referrer.lifetime_total_points = (referrer.lifetime_total_points || 0) + referralMilestone.bonusPoints;
        await referrer.save({ transaction });

        console.log(`Referral milestone bonus awarded: ${referralMilestone.bonusPoints} points to user ${referrer.username} for reaching ${referralMilestone.milestone} referred users with form submissions`);
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
        first_submission_bonus: false
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
    const { company_id, user_id, start_date, end_date, status, user_type } = req.query;
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

    // Add user_type filter
    if (user_type) {
      if (Array.isArray(user_type)) {
        userWhere.user_type = {
          [Op.in]: user_type
        };
      } else {
        userWhere.user_type = user_type;
      }
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

        // Check if form contains Aura Edition products
        let isAuraEdition = false;
        if (plainForm.form_data && Array.isArray(plainForm.form_data)) {
          const productsEntry = plainForm.form_data.find((entry: any) => entry.label === 'products');
          if (productsEntry && Array.isArray(productsEntry.value)) {
            isAuraEdition = productsEntry.value.some((product: { productCategory?: string }) => product.productCategory === 'Aura Edition');
          }
        }

        // Calculate bonus points using utility function
        bonus_points = calculateBonusPoints(plainForm.form_type.form_type_id, product_quantity, isAuraEdition);
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

export const getFormSubmissionByUserId = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { form_type_id } = req.query;

    const whereClause: any = {
      user_id: userId,
      status: 'approved'
    };

    if (form_type_id) {
      whereClause.form_type_id = form_type_id;
      whereClause.createdAt = {
        [Op.gte]: new Date('2025-08-17T00:00:00.000Z'),
        [Op.lte]: new Date('2025-09-20T23:59:59.999Z')
      };
    }

    const forms = await Form.findAll({
      attributes: ['form_id', 'form_data', 'createdAt'],
      where: whereClause,
      include: [
        {
          model: Project,
          attributes: ['name']
        },
        {
          model: FormType,
          attributes: ['form_name']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const transformedForms = forms.map(form => {
      const plainForm = form.get({ plain: true }) as any;
      return {
        form_id: plainForm.form_id,
        form_data: plainForm.form_data,
        project_name: plainForm.project.name,
        form_name: plainForm.form_type.form_name,
        submitted_at: plainForm.createdAt
      };
    });

    res.status(200).json({ 
      message: 'List of approved user forms', 
      status: res.status, 
      data: transformedForms
    });
  } catch (error: any) {
    console.error('Error fetching user forms:', error);

    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    res.status(500).json({ message: 'Something went wrong', error });
  }
};

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

        // Check if form contains Aura Edition products
        let isAuraEdition = false;
        if (item.form_data && Array.isArray(item.form_data)) {
          const productsEntry = item.form_data.find((entry: any) => entry.label === 'products');
          if (productsEntry && Array.isArray(productsEntry.value)) {
            isAuraEdition = productsEntry.value.some((product: { productCategory?: string }) => product.productCategory === 'Aura Edition');
          }
        }

        const bonus_points = calculateBonusPoints(item.form_type.form_type_id, product_quantity, isAuraEdition);
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

    // Check if form contains Aura Edition products
    let isAuraEdition = false;
    if (item.form_data && Array.isArray(item.form_data)) {
      const productsEntry = item.form_data.find((entry: any) => entry.label === 'products');
      if (productsEntry && Array.isArray(productsEntry.value)) {
        isAuraEdition = productsEntry.value.some((product: { productCategory?: string }) => product.productCategory === 'Aura Edition');
      }
    }

    const bonus_point = calculateBonusPoints(item.form_type.form_type_id, product_quantity, isAuraEdition);

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

export const getFormTypeUsers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const form_type_id = parseInt(req.query.form_type_id as string);
    const offset = (page - 1) * limit;

    // Validate form_type_id
    if (!form_type_id) {
      return res.status(400).json({
        message: 'form_type_id is required',
        status: 400
      });
    }

    // Date filter: from May 1, 2025 to June 20, 2025 end of day
    const startDate = new Date('2025-08-17T00:00:00.000Z');
    const endDate = new Date('2025-09-20T23:59:59.999Z'); // June 20, 2025 end of day

    // First get all users with their form type submission counts using a subquery
    const userSubmissions = await Form.findAll({
      attributes: [
        [sequelize.col('Form.user_id'), 'user_id'],
        [sequelize.fn('COUNT', sequelize.col('Form.form_id')), 'submission_count']
      ],
      where: {
        form_type_id,
        createdAt: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      },
      group: [sequelize.col('Form.user_id'), sequelize.col('user.user_id')],
      order: [[sequelize.fn('COUNT', sequelize.col('Form.form_id')), 'DESC']],
      limit,
      offset,
      include: [{
        model: User,
        required: true,
        attributes: [
          'user_id',
          'username',
          'fullname',
          'total_points'
        ]
      }]
    });

    // Get total count for pagination
    const totalCount = await Form.count({
      where: {
        form_type_id,
        createdAt: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      },
      distinct: true,
      col: 'user_id'
    });

    const totalPages = Math.ceil(totalCount / limit);

    // Transform the response
    const transformedUsers = userSubmissions.map(submission => {
      const plainSubmission = submission.get({ plain: true }) as any;
      return {
        user_id: plainSubmission.user.user_id,
        username: plainSubmission.user.username,
        fullname: plainSubmission.user.fullname || '-',
        total_points: plainSubmission.user.total_points || 0,
        form_type_submissions: parseInt(plainSubmission.submission_count)
      };
    });

    res.status(200).json({
      message: `List of users with form type ${form_type_id} submissions`,
      data: transformedUsers,
      pagination: {
        total_items: totalCount,
        total_pages: totalPages,
        current_page: page,
        items_per_page: limit
      }
    });

  } catch (error) {
    console.error('Error fetching form type users:', error);
    res.status(500).json({ 
      message: 'An error occurred while fetching users with form type submissions',
      error 
    });
  }
};