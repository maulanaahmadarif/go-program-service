import { Response } from 'express';
import { CustomRequest } from '../types/api';
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
import { sendEmail } from '../services/brevo';
import { formatJsonToLabelValueString, getUserType } from '../utils';
import { calculateBonusPoints, calculateReferralMilestoneBonus } from '../utils/points';
import { PointTransaction } from '../../models/PointTransaction';
import { UserMysteryBox } from '../../models/UserMysteryBox';
import { ExistingCustomer } from '../../models/ExistingCustomer';

export const approveSubmission = async (req: CustomRequest, res: Response) => {
  const form_id = req.params.form_id;
  const product_quantity = Number(req.body.product_quantity) || 0;

  const transaction = await sequelize.transaction();

  try {
    if (!form_id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Form ID is required', status: 400 });
    }

    // Reject immediately if form is already approved (avoid double approve)
    const existingForm = await Form.findByPk(form_id, {
      attributes: ['form_id', 'status'],
      transaction
    });
    if (!existingForm) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Form not found', status: 404 });
    }
    if (existingForm.status === 'approved') {
      await transaction.rollback();
      return res.status(400).json({
        message: 'Form is already approved',
        status: 400
      });
    }

    // Step 1: Update form status and get the updated form with all related data in one query
    const [numOfAffectedRows, updatedForms] = await Form.update(
      { status: 'approved' },
      { where: { form_id }, returning: true, transaction }
    );

    if (numOfAffectedRows === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Form not found', status: 404 });
    }

    const updatedForm = updatedForms[0];
    const formSubmittedAt = dayjs(updatedForm.createdAt);
    const targetDate = dayjs('2026-03-20');
    const needsCompletionCount = formSubmittedAt.isBefore(targetDate);

    // Step 2: Fetch user, formType, project and (when needed) approved count in parallel
    const [user, formType, project, approvedSubmissionsCount] = await Promise.all([
      User.findByPk(updatedForm.user_id, {
        transaction,
        attributes: ['user_id', 'username', 'email', 'user_type', 'company_id', 'total_points', 'accomplishment_total_points', 'lifetime_total_points']
      }),
      FormType.findByPk(updatedForm.form_type_id, {
        transaction,
        attributes: ['form_type_id', 'form_name', 'point_reward']
      }),
      Project.findByPk(updatedForm.project_id, {
        transaction,
        attributes: ['project_id', 'name']
      }),
      needsCompletionCount
        ? Form.count({
            where: {
              user_id: updatedForm.user_id,
              project_id: updatedForm.project_id,
              status: 'approved'
            },
            transaction
          })
        : Promise.resolve(0)
    ]);

    if (!user || !formType || !project) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Required data not found', status: 404 });
    }

    // Step 3: Single pass over form_data for products (Aura/TKDN) and customerType
    let isAuraEdition = false;
    let customerTypeBonus = 0;
    if (updatedForm.form_data && Array.isArray(updatedForm.form_data)) {
      for (const entry of updatedForm.form_data as { label?: string; value?: unknown }[]) {
        if (entry.label === 'products' && Array.isArray(entry.value)) {
          isAuraEdition = entry.value.some((product: { productCategory?: string }) =>
            product.productCategory === 'Aura Edition' || product.productCategory === 'TKDN Product'
          );
        } else if (entry.label === 'customerType' && entry.value === 'New User') {
          customerTypeBonus = 1000;
        }
      }
    }

    const additionalPoint = calculateBonusPoints(updatedForm.form_type_id, product_quantity, isAuraEdition);
    const completionBonus = needsCompletionCount && approvedSubmissionsCount === 4 ? 200 : 0;

    // Step 5: Calculate points
    const basePoints = formType.point_reward;
    const totalPoints = basePoints + additionalPoint + completionBonus + customerTypeBonus;

    // Step 6: Create point transaction and user action in parallel, then update user points
    await Promise.all([
      PointTransaction.create({
        user_id: user.user_id,
        points: totalPoints,
        transaction_type: 'earn',
        form_id: Number(form_id),
        description: `Earned ${totalPoints} points (${basePoints} base + ${additionalPoint} bonus + ${completionBonus} completion + ${customerTypeBonus} New User bonus) for form submission: ${formType.form_name} (${formType.form_type_id})`
      }, { transaction }),
      UserAction.create({
        user_id: user.user_id,
        entity_type: 'FORM',
        action_type: 'APPROVED',
        form_id: Number(form_id),
      }, { transaction })
    ]);

    await User.update({
      total_points: sequelize.literal(`total_points + ${totalPoints}`),
      accomplishment_total_points: sequelize.literal(`accomplishment_total_points + ${totalPoints}`),
      lifetime_total_points: sequelize.literal(`lifetime_total_points + ${totalPoints}`)
    }, {
      where: { user_id: user.user_id },
      transaction
    });

    // Step 6b: Form type 4 milestone bonus (when approved form type 4 submission falls in date range)
    const type4StartDate = new Date('2026-02-01T00:00:00.000Z');
    const type4EndDate = new Date('2026-03-20T23:59:59.999Z');
    let formType4MilestoneBonus = 0;
    if (updatedForm.form_type_id === 4 && updatedForm.createdAt >= type4StartDate && updatedForm.createdAt <= type4EndDate) {
      const type4ApprovedCount = await Form.count({
        where: {
          user_id: updatedForm.user_id,
          form_type_id: 4,
          status: 'approved',
          createdAt: { [Op.gte]: type4StartDate, [Op.lte]: type4EndDate }
        },
        transaction
      });
      if (type4ApprovedCount === 10) {
        formType4MilestoneBonus = 6000;
      } else if (type4ApprovedCount === 20) {
        formType4MilestoneBonus = 8000;
      } else if (type4ApprovedCount === 30) {
        formType4MilestoneBonus = 10000;
      }
      if (formType4MilestoneBonus > 0) {
        await PointTransaction.create({
          user_id: user.user_id,
          points: formType4MilestoneBonus,
          transaction_type: 'earn',
          form_id: Number(form_id),
          description: `Bonus points for passing ${type4ApprovedCount - 1} form type 4 submissions milestone`
        }, { transaction });
        await User.update({
          total_points: sequelize.literal(`total_points + ${formType4MilestoneBonus}`),
          accomplishment_total_points: sequelize.literal(`accomplishment_total_points + ${formType4MilestoneBonus}`),
          lifetime_total_points: sequelize.literal(`lifetime_total_points + ${formType4MilestoneBonus}`)
        }, { where: { user_id: user.user_id }, transaction });
      }
    }

    // Step 7: Commit transaction
    await transaction.commit();

    // Step 8: Send email asynchronously (outside transaction)
    setImmediate(async () => {
      try {
        let htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'approveEmail.html'), 'utf-8');

        htmlTemplate = htmlTemplate
          .replace('{{username}}', user.username)
          .replace('{{project}}', project.name)
          .replace('{{milestone}}', formType.form_name);

        sendEmail({ to: user.email, subject: 'Your Milestone Submission is Approved!', html: htmlTemplate }).catch(err => {
          req.log.error({ error: err, stack: err.stack }, 'Email sending failed');
        });
      } catch (emailError: any) {
        req.log.error({ error: emailError, stack: emailError.stack }, 'Error sending approval email');
        // Don't fail the main operation if email fails
      }
    });

    res.status(200).json({ 
      message: 'Form approved successfully', 
      status: 200,
      points_awarded: totalPoints + formType4MilestoneBonus,
      base_points: basePoints,
      bonus_points: additionalPoint,
      completion_bonus: completionBonus,
      customer_type_bonus: customerTypeBonus,
      form_type_4_milestone_bonus: formType4MilestoneBonus
    });

  } catch (error: any) {
    await transaction.rollback();
		req.log.error({ error, stack: error.stack }, 'Error approving form');
    
    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    res.status(500).json({ 
      message: 'Something went wrong', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const deleteForm = async (req: CustomRequest, res: Response) => {
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

        sendEmail({ to: user!.email, subject: 'Your Submission is Rejected!', html: htmlTemplate }).catch(err => {
          req.log.error({ error: err, stack: err.stack }, 'Email sending failed');
        });

      } else {
        res.status(400).json({ message: 'No record found with the specified form_id.', status: res.status });
      }
      
      res.status(200).json({ message: 'Form deleted', status: res.status });
    } else {
      res.status(400).json({ message: 'Form failed to delete', status: res.status });
    }
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error creating form type');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const createFormType = async (req: CustomRequest, res: Response) => {
  const { form_name, point_reward } = req.body;

  try {
    const formType = await FormType.create({
      form_name,
      point_reward
    })

    res.status(200).json({ message: `${form_name} created`, status: res.status });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error creating form type');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const formSubmission = async (req: CustomRequest, res: Response) => {
  const { form_type_id, form_data, project_id, product_quantity = 0, customer_type, customer_name } = req.body;

  const transaction = await sequelize.transaction();

  const userId = req.user?.userId;
  if (!userId) {
    await transaction.rollback();
    return res.status(401).json({ message: 'Unauthorized' });
  }

  let isProjectFormCompleted = false;
  let firstSubmissionBonus = false;
  
  try {
    // Form type 5: validate New User vs existing customer (customer_name exists only when form_type_id is 5)
    if (form_type_id === 5 && customer_type === 'New User' && customer_name) {
      const existingCustomer = await ExistingCustomer.findOne({
        where: {
          [Op.or]: [
            { customer_name: { [Op.iLike]: String(customer_name).trim() } },
            { alias_name: { [Op.iLike]: String(customer_name).trim() } }
          ]
        },
        transaction
      });
      if (existingCustomer) {
        await transaction.rollback();
        return res.status(400).json({
          is_existing_customer: true,
          message: 'Sorry, your Customer is considered as the Retention User of Lenovo. Please change the Customer Type to Retention User',
          status: 400
        });
      }
    }

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

    // Check if this is the user's first form submission
    const totalFormCount = await Form.count({
      where: {
        user_id: userId,
      },
      transaction
    });
    const isFirstSubmission = totalFormCount === 1;

    const user = await User.findByPk(userId, { 
      transaction,
      include: [{
        model: User,
        as: 'referrer'
      }]
    });

    // Give bonus to newly referred user when they submit their first form
    if (isFirstSubmission && user?.referrer) {
      const bonusPoints = 400;

      // Award 400 points to the newly signed up user
      await PointTransaction.create({
        user_id: user.user_id,
        points: bonusPoints,
        transaction_type: 'earn',
        description: `First form submission bonus for signing up with referral code`
      }, { transaction });

      user.total_points = (user.total_points || 0) + bonusPoints;
      user.accomplishment_total_points = (user.accomplishment_total_points || 0) + bonusPoints;
      user.lifetime_total_points = (user.lifetime_total_points || 0) + bonusPoints;
      await user.save({ transaction });

      firstSubmissionBonus = true;
    }

    const currentDate = dayjs();
    const targetDate = dayjs('2026-03-20');
  
    if (currentDate.isBefore(targetDate, 'day')) {
      if (formsCount === 4) {
        isProjectFormCompleted = true;
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
        first_submission_bonus: firstSubmissionBonus
      } 
    });
  } catch (error: any) {
    await transaction.rollback();
    req.log.error({ error, stack: error.stack }, 'Error creating form');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const getFormByProject = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;

    const whereClause: any = {
      user_id: userId,
      status: {
        [Op.or]: ['approved', 'submitted']
      }
    };

    if (projectId) {
      whereClause.project_id = projectId;
    }

    const forms = await Form.findAll({
      where: whereClause
    });

    res.status(200).json({ message: 'List of forms', status: res.status, data: forms });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching forms');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}

export const getFormSubmission = async (req: CustomRequest, res: Response) => {
  try {
    const { company_id, user_id, start_date, end_date, status, user_type, form_type_id, product_category } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // Validate product_category query parameter
    if (product_category && !['TKDN Product', 'Aura Edition'].includes(product_category as string)) {
      return res.status(400).json({ 
        message: 'Invalid product_category.',
        status: 400
      });
    }

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

    // Add form_type_id filter
    if (form_type_id) {
      if (Array.isArray(form_type_id)) {
        whereClause.form_type_id = {
          [Op.in]: form_type_id.map(id => parseInt(id as string))
        };
      } else {
        whereClause.form_type_id = parseInt(form_type_id as string);
      }
    }

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

    // Fetch all forms without pagination first (we'll paginate after filtering)
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
      order: [['createdAt', 'DESC']]
    });

    // Pre-calculate completion bonuses for all users/projects to avoid repeated queries
    const currentDate = dayjs();
    const targetDate = dayjs('2026-03-20');
    const completionBonusMap = new Map<string, boolean>();
    
    if (currentDate.isBefore(targetDate)) {
      // Get all user-project combinations that have exactly 4 approved submissions
      const approvedForms = await Form.findAll({
        where: {
          status: 'approved'
        },
        attributes: ['user_id', 'project_id'],
        group: ['user_id', 'project_id', 'Form.user_id', 'Form.project_id'],
        having: sequelize.literal('COUNT(*) = 4')
      });

      // Store which user-project combinations should get completion bonus
      approvedForms.forEach(form => {
        const key = `${form.user_id}-${form.project_id}`;
        completionBonusMap.set(key, true);
      });
    }

    // Transform forms to include points calculation
    let transformedForms = forms.map(form => {
      const plainForm = form.get({ plain: true }) as any;
      let points = 0;
      let bonus_points = 0;
      let completion_bonus = 0;
      let customer_type_bonus = 0;

      if (plainForm.status === 'approved') {
        points = plainForm.form_type.point_reward;
        
        // Calculate bonus points based on product quantity if exists
        let product_quantity = 0;
        if (plainForm.form_data && Array.isArray(plainForm.form_data) && plainForm.form_data[0]?.value) {
          if (Array.isArray(plainForm.form_data[0].value)) {
            product_quantity = plainForm.form_data[0].value[0]?.numberOfQuantity || 0;
          }
        }

        // Check if form contains Aura Edition or TKDN Product
        let isAuraEdition = false;
        if (plainForm.form_data && Array.isArray(plainForm.form_data)) {
          const productsEntry = plainForm.form_data.find((entry: any) => entry.label === 'products');
          if (productsEntry && Array.isArray(productsEntry.value)) {
            isAuraEdition = productsEntry.value.some((product: { productCategory?: string }) => 
              product.productCategory === 'Aura Edition' || product.productCategory === 'TKDN Product'
            );
          }
        }

        // Calculate bonus points using utility function
        bonus_points = calculateBonusPoints(plainForm.form_type.form_type_id, product_quantity, isAuraEdition);

        // Check completion bonus from pre-calculated map
        const key = `${plainForm.user_id}-${plainForm.project_id}`;
        if (completionBonusMap.has(key)) {
          completion_bonus = 200;
        }

        // New User customer type bonus (1000 points when form_data has customerType = 'New User')
        if (plainForm.form_data && Array.isArray(plainForm.form_data)) {
          const customerTypeEntry = plainForm.form_data.find((entry: any) => entry.label === 'customerType' && entry.value === 'New User');
          if (customerTypeEntry) {
            customer_type_bonus = 1000;
          }
        }
      }

      return {
        ...plainForm,
        base_points: points,
        bonus_points: bonus_points,
        completion_bonus: completion_bonus,
        customer_type_bonus: customer_type_bonus,
        total_points: points + bonus_points + completion_bonus + customer_type_bonus
      };
    });

    // Filter by product_category if provided
    if (product_category) {
      transformedForms = transformedForms.filter(form => {
        if (form.form_data && Array.isArray(form.form_data)) {
          // Check if form_data contains the specified product category
          const hasProductCategory = form.form_data.some((item: any) => {
            if (item.value && Array.isArray(item.value)) {
              return item.value.some((val: any) => val.productCategory === product_category);
            }
            return false;
          });
          return hasProductCategory;
        }
        return false;
      });
    }

    // Calculate pagination on the filtered results
    const totalItems = transformedForms.length;
    const totalPages = Math.ceil(totalItems / limit);
    const offset = (page - 1) * limit;
    
    // Apply pagination to the filtered and transformed results
    const paginatedForms = transformedForms.slice(offset, offset + limit);

    res.status(200).json({ 
      message: 'List of forms', 
      status: res.status, 
      data: paginatedForms,
      pagination: {
        total_items: totalItems,
        total_pages: totalPages,
        current_page: page,
        items_per_page: limit,
        has_next: page < totalPages,
        has_previous: page > 1
      }
    });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching forms');

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
        [Op.gte]: new Date('2026-02-01T00:00:00.000Z'),
        [Op.lte]: new Date('2026-03-20T23:59:59.999Z')
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
    req.log.error({ error, stack: error.stack }, 'Error fetching user forms');

    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const downloadSubmission = async (req: CustomRequest, res: Response) => {
  try {
    const {
      company_id,
      user_id,
      start_date,
      end_date,
      status,
      user_type,
      form_type_id,
      product_category,
    } = req.query;

    // Validate product_category query parameter (same as getFormSubmission)
    if (product_category && !['TKDN Product', 'Aura Edition'].includes(product_category as string)) {
      return res.status(400).json({
        message: 'Invalid product_category.',
        status: 400
      });
    }

    const companyWhere: any = {};
    const userWhere: any = {};

    if (company_id) {
      companyWhere.company_id = company_id;
    }

    if (user_id) {
      userWhere.user_id = user_id;
    }

    // Add user_type filter (same as getFormSubmission)
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

    // Add form_type_id filter (same as getFormSubmission)
    if (form_type_id) {
      if (Array.isArray(form_type_id)) {
        whereClause.form_type_id = {
          [Op.in]: form_type_id.map(id => parseInt(id as string))
        };
      } else {
        whereClause.form_type_id = parseInt(form_type_id as string);
      }
    }

    // Add status filter (same as getFormSubmission)
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

    let forms = await Form.findAll({
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

    // Filter by product_category if provided (same logic as getFormSubmission)
    if (product_category) {
      forms = forms.filter((form: any) => {
        const formData = form.form_data;
        if (!formData || !Array.isArray(formData)) return false;

        return formData.some((item: any) => {
          if (item?.label !== 'products') return false;
          if (!item?.value || !Array.isArray(item.value)) return false;
          return item.value.some((val: any) => val?.productCategory === product_category);
        });
      });
    }
    
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

        // Check if form contains Aura Edition or TKDN Product
        let isAuraEdition = false;
        if (item.form_data && Array.isArray(item.form_data)) {
          const productsEntry = item.form_data.find((entry: any) => entry.label === 'products');
          if (productsEntry && Array.isArray(productsEntry.value)) {
            isAuraEdition = productsEntry.value.some((product: { productCategory?: string }) => 
              product.productCategory === 'Aura Edition' || product.productCategory === 'TKDN Product'
            );
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
    req.log.error({ error, stack: error.stack }, 'Error fetching forms');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  } 
}

export const getReport = async (req: CustomRequest, res: Response) => {
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

    // Check if form contains Aura Edition or TKDN Product
    let isAuraEdition = false;
    if (item.form_data && Array.isArray(item.form_data)) {
      const productsEntry = item.form_data.find((entry: any) => entry.label === 'products');
      if (productsEntry && Array.isArray(productsEntry.value)) {
        isAuraEdition = productsEntry.value.some((product: { productCategory?: string }) => 
          product.productCategory === 'Aura Edition' || product.productCategory === 'TKDN Product'
        );
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

export const getFormTypeUsers = async (req: CustomRequest, res: Response) => {
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
    const startDate = new Date('2026-02-01T00:00:00.000Z');
    const endDate = new Date('2026-03-20T23:59:59.999Z'); // June 20, 2025 end of day

    // JSONB filter: only count forms with products that have productCategory "Aura Edition" or "TKDN Product"
    // Using PostgreSQL @> operator to check if form_data contains products with the specified categories
    const productCategoryFilter = sequelize.literal(
      `(form_data @> '[{"label": "products", "value": [{"productCategory": "Aura Edition"}]}]' OR ` +
      `form_data @> '[{"label": "products", "value": [{"productCategory": "TKDN Product"}]}]')`
    );

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
        },
        [Op.and]: [productCategoryFilter]
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
        },
        [Op.and]: [productCategoryFilter]
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

  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching form type users');
    res.status(500).json({ 
      message: 'An error occurred while fetching users with form type submissions',
      error 
    });
  }
};

export const getChampions = async (req: CustomRequest, res: Response) => {
  try {
    const championStartDate = new Date('2026-02-01T00:00:00.000Z');

    // Fetch form type 4 (quotation), form type 5 (close deal) forms, and form type 5 champion in parallel
    const [quotationForms, formType5Forms, formType5Champion] = await Promise.all([
      Form.findAll({
        where: {
          status: 'approved',
          form_type_id: 4,
          createdAt: { [Op.gte]: championStartDate }
        },
        include: [{ model: User, attributes: ['user_id', 'username', 'fullname', 'email', 'total_points'] }],
        order: [['createdAt', 'DESC']]
      }),
      Form.findAll({
        where: {
          status: 'approved',
          form_type_id: 5,
          createdAt: { [Op.gte]: championStartDate }
        },
        include: [{ model: User, attributes: ['user_id', 'username', 'fullname', 'email', 'total_points'] }],
        order: [['createdAt', 'DESC']]
      }),
      sequelize.query(`
      SELECT 
        u.user_id,
        u.username,
        u.fullname,
        u.email,
        u.total_points,
        COUNT(f.form_id) as approved_submissions_count,
        'Form Type 5' as category,
        5 as form_type_id
      FROM users u
      INNER JOIN forms f ON u.user_id = f.user_id
      INNER JOIN form_types ft ON f.form_type_id = ft.form_type_id
      WHERE f.status = 'approved' 
        AND f.form_type_id = 5
        AND f.created_at >= '2026-02-01T00:00:00.000Z'
      GROUP BY u.user_id, u.username, u.fullname, u.email, u.total_points
      ORDER BY approved_submissions_count DESC, u.total_points DESC
      LIMIT 1
    `, { type: QueryTypes.SELECT })
    ]);

    // Process quotation forms to count TKDN and Aura Edition submissions per user
    const userCounts: { [key: number]: { tkdn: number; auraEdition: number; user: any } } = {};

    quotationForms.forEach(form => {
      const plainForm = form.get({ plain: true }) as any;
      const userId = plainForm.user_id;
      
      if (!userCounts[userId]) {
        userCounts[userId] = {
          tkdn: 0,
          auraEdition: 0,
          user: plainForm.user
        };
      }

      // Check if form_data contains TKDN Product or Aura Edition
      if (plainForm.form_data && Array.isArray(plainForm.form_data)) {
        const hasTKDNProduct = plainForm.form_data.some((item: any) => {
          if (item.value && Array.isArray(item.value)) {
            return item.value.some((val: any) => val.productCategory === "TKDN Product");
          }
          return false;
        });

        const hasAuraEdition = plainForm.form_data.some((item: any) => {
          if (item.value && Array.isArray(item.value)) {
            return item.value.some((val: any) => val.productCategory === "Aura Edition");
          }
          return false;
        });

        if (hasTKDNProduct) userCounts[userId].tkdn += 1;
        if (hasAuraEdition) userCounts[userId].auraEdition += 1;
      }
    });

    // Find champions for each category
    let tkdnChampion = null;
    let auraChampion = null;

    // Find TKDN champion
    const tkdnEntries = Object.entries(userCounts).filter(([_, counts]) => counts.tkdn > 0);
    if (tkdnEntries.length > 0) {
      const [userId, counts] = tkdnEntries.reduce((max, current) => {
        return current[1].tkdn > max[1].tkdn ? current : max;
      });
      
      tkdnChampion = {
        user_id: parseInt(userId),
        username: counts.user.username,
        fullname: counts.user.fullname,
        email: counts.user.email,
        total_points: counts.user.total_points,
        approved_submissions_count: counts.tkdn,
        category: 'TKDN Product',
        form_type_id: 4
      };
    }

    // Find Aura Edition champion
    const auraEntries = Object.entries(userCounts).filter(([_, counts]) => counts.auraEdition > 0);
    if (auraEntries.length > 0) {
      const [userId, counts] = auraEntries.reduce((max, current) => {
        return current[1].auraEdition > max[1].auraEdition ? current : max;
      });
      
      auraChampion = {
        user_id: parseInt(userId),
        username: counts.user.username,
        fullname: counts.user.fullname,
        email: counts.user.email,
        total_points: counts.user.total_points,
        approved_submissions_count: counts.auraEdition,
        category: 'Aura Edition',
        form_type_id: 4
      };
    }

    // Close deal New User champion: form type 5 approved submissions with customerType = 'New User'
    const newCustomerCounts: { [key: number]: { count: number; user: any } } = {};
    formType5Forms.forEach((form: any) => {
      const plainForm = form.get ? form.get({ plain: true }) : form;
      const formData = plainForm.form_data;
      const hasNewUser = formData && Array.isArray(formData) && formData.some(
        (entry: { label?: string; value?: string }) => entry.label === 'customerType' && entry.value === 'New User'
      );
      if (!hasNewUser) return;
      const userId = plainForm.user_id;
      if (!newCustomerCounts[userId]) {
        newCustomerCounts[userId] = { count: 0, user: plainForm.user };
      }
      newCustomerCounts[userId].count += 1;
    });

    let closeDealNewCustomerChampion = null;
    const newCustomerEntries = Object.entries(newCustomerCounts).filter(([_, data]) => data.count > 0);
    if (newCustomerEntries.length > 0) {
      const [userId, data] = newCustomerEntries.reduce((max, current) =>
        current[1].count > max[1].count ? current : max
      );
      closeDealNewCustomerChampion = {
        user_id: parseInt(userId),
        username: data.user.username,
        fullname: data.user.fullname,
        email: data.user.email,
        total_points: data.user.total_points,
        approved_submissions_count: data.count,
        category: 'New User',
        form_type_id: 5
      };
    }

    const champions = {
      tkdn_champion: tkdnChampion,
      aura_champion: auraChampion,
      close_deal_champion: formType5Champion[0] || null,
      close_deal_new_customer_champion: closeDealNewCustomerChampion
    };

    res.status(200).json({
      message: 'Champions list retrieved successfully',
      data: champions
    });

  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching champions');
    res.status(500).json({ 
      message: 'An error occurred while fetching champions',
      error 
    });
  }
};