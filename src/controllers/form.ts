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
import { formBulkApproveQueue, formBulkRejectQueue } from '../queues/formQueues';
import { approveFormById, ModerationError, rejectFormById } from '../services/formModeration';
import { queueConfig } from '../config/queue';

export const approveSubmission = async (req: CustomRequest, res: Response) => {
  const form_id = Number(req.params.form_id);

  try {
    if (!form_id) {
      return res.status(400).json({ message: 'Form ID is required', status: 400 });
    }

    const result = await approveFormById(form_id);
    res.status(200).json(result);
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error approving form');
    if (error instanceof ModerationError) {
      return res.status(error.status).json({ message: error.message, status: error.status });
    }
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }
    res.status(500).json({
      message: 'Something went wrong',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const deleteForm = async (req: CustomRequest, res: Response) => {
  const form_id = Number(req.params.form_id);
  const reason = (req.query.reason as string) || '-';
  try {
    if (!form_id) {
      return res.status(400).json({ message: 'Form failed to delete', status: 400 });
    }
    const result = await rejectFormById(form_id, reason);
    res.status(200).json(result);
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error deleting form');
    if (error instanceof ModerationError) {
      return res.status(error.status).json({ message: error.message, status: error.status });
    }
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

const parseBulkIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
};

export const enqueueBulkApprove = async (req: CustomRequest, res: Response) => {
  try {
    const actor_user_id = req.user?.userId;
    if (!actor_user_id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const form_ids = parseBulkIds(req.body.form_ids);
    const maxBulkIds = queueConfig.bulk.maxIds;
    if (form_ids.length === 0) {
      return res.status(400).json({ message: 'form_ids must be a non-empty array of numbers', status: 400 });
    }
    if (form_ids.length > maxBulkIds) {
      return res.status(400).json({ message: `Maximum ${maxBulkIds} form IDs per request`, status: 400 });
    }

    const job = await formBulkApproveQueue.add('bulk-approve' as const, {
      form_ids,
      actor_user_id,
    });

    return res.status(202).json({
      message: 'Bulk approve job queued',
      status: 202,
      data: {
        queue: 'approve',
        job_id: String(job.id),
        total_items: form_ids.length,
      },
    });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error enqueueing bulk approve');
    return res.status(500).json({ message: 'Failed to queue bulk approve job', status: 500 });
  }
};

export const enqueueBulkReject = async (req: CustomRequest, res: Response) => {
  try {
    const actor_user_id = req.user?.userId;
    if (!actor_user_id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const form_ids = parseBulkIds(req.body.form_ids);
    const maxBulkIds = queueConfig.bulk.maxIds;
    if (form_ids.length === 0) {
      return res.status(400).json({ message: 'form_ids must be a non-empty array of numbers', status: 400 });
    }
    if (form_ids.length > maxBulkIds) {
      return res.status(400).json({ message: `Maximum ${maxBulkIds} form IDs per request`, status: 400 });
    }

    const reason = (req.body.reason as string) || '-';
    const job = await formBulkRejectQueue.add('bulk-reject' as const, {
      form_ids,
      actor_user_id,
      reason,
    });

    return res.status(202).json({
      message: 'Bulk reject job queued',
      status: 202,
      data: {
        queue: 'reject',
        job_id: String(job.id),
        total_items: form_ids.length,
      },
    });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error enqueueing bulk reject');
    return res.status(500).json({ message: 'Failed to queue bulk reject job', status: 500 });
  }
};

export const getBulkModerationJobStatus = async (req: CustomRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const queueType = (req.query.queue as string | undefined)?.toLowerCase();
    const queueCandidates =
      queueType === 'approve'
        ? [formBulkApproveQueue]
        : queueType === 'reject'
          ? [formBulkRejectQueue]
          : [formBulkApproveQueue, formBulkRejectQueue];

    let job = null as any;
    let queueName = '';
    for (const queue of queueCandidates) {
      // eslint-disable-next-line no-await-in-loop
      const found = await queue.getJob(jobId);
      if (found) {
        job = found;
        queueName = queue.name;
        break;
      }
    }

    if (!job) {
      return res.status(404).json({ message: 'Job not found', status: 404 });
    }

    const state = await job.getState();
    return res.status(200).json({
      message: 'Bulk moderation job status',
      status: 200,
      data: {
        queue: queueName,
        job_id: String(job.id),
        state,
        progress: job.progress || { processed: 0, total: 0 },
        result: job.returnvalue || null,
        failed_reason: job.failedReason || null,
      },
    });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching bulk moderation job status');
    return res.status(500).json({ message: 'Failed to fetch job status', status: 500 });
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
    const productCategory = typeof product_category === 'string' ? product_category : undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const offset = (page - 1) * limit;

    // Validate product_category query parameter
    if (productCategory && !['TKDN Product', 'Aura Edition'].includes(productCategory)) {
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

    if (productCategory) {
      whereClause[Op.and] = [
        sequelize.literal(`
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements("Form"."form_data") AS form_entry
            WHERE form_entry->>'label' = 'products'
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(form_entry->'value', '[]'::jsonb)) AS product
                WHERE product->>'productCategory' = ${sequelize.escape(productCategory)}
              )
          )
        `),
      ];
    }

    const { count, rows } = await Form.findAndCountAll({
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
      offset,
      distinct: true,
    });

    const forms = rows.map((form) => form.get({ plain: true }) as any);
    const currentDate = dayjs();
    const targetDate = dayjs('2026-03-20');
    const completionBonusMap = new Map<string, boolean>();

    if (currentDate.isBefore(targetDate)) {
      const candidatePairs = [...new Set(
        forms
          .filter((form) => form.status === 'approved')
          .map((form) => `${form.user_id}-${form.project_id}`)
      )];

      if (candidatePairs.length > 0) {
        const pairConditions = candidatePairs.map((key) => {
          const [candidateUserId, candidateProjectId] = key.split('-').map((value) => Number(value));
          return { user_id: candidateUserId, project_id: candidateProjectId };
        });

        const approvedForms = await Form.findAll({
          attributes: [
            'user_id',
            'project_id',
            [sequelize.fn('COUNT', sequelize.col('form_id')), 'submission_count'],
          ],
          where: {
            status: 'approved',
            [Op.or]: pairConditions,
          },
          group: ['user_id', 'project_id'],
          having: sequelize.literal('COUNT("form_id") = 4'),
          raw: true,
        });

        approvedForms.forEach((form: any) => {
          const key = `${form.user_id}-${form.project_id}`;
          completionBonusMap.set(key, true);
        });
      }
    }

    // Transform current page rows only
    const transformedForms = forms.map((plainForm) => {
      let points = 0;
      let bonus_points = 0;
      let completion_bonus = 0;
      let customer_type_bonus = 0;

      if (plainForm.status === 'approved') {
        points = plainForm.form_type.point_reward;

        // Derive product quantity from form_data.products[*].numberOfQuantity
        let product_quantity = 0;
        let isAuraEdition = false;
        if (Array.isArray(plainForm.form_data)) {
          const productsEntry = plainForm.form_data.find((entry: any) => entry.label === 'products');
          if (productsEntry && Array.isArray(productsEntry.value) && productsEntry.value.length > 0) {
            const quantity = Number(productsEntry.value[0]?.numberOfQuantity || 0);
            product_quantity = Number.isFinite(quantity) ? quantity : 0;
            isAuraEdition = productsEntry.value.some((product: { productCategory?: string }) =>
              product.productCategory === 'Aura Edition' || product.productCategory === 'TKDN Product'
            );
          }
        }

        // Check completion bonus from pre-calculated map
        const key = `${plainForm.user_id}-${plainForm.project_id}`;
        if (completionBonusMap.has(key)) {
          completion_bonus = 200;
        }

        // New User customer type bonus (1000 points when form_data has customerType = 'New User')
        if (Array.isArray(plainForm.form_data)) {
          const customerTypeEntry = plainForm.form_data.find((entry: any) => entry.label === 'customerType' && entry.value === 'New User');
          if (customerTypeEntry) {
            customer_type_bonus = 1000;
          }
        }

        bonus_points = calculateBonusPoints(plainForm.form_type.form_type_id, product_quantity, isAuraEdition);
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

    const totalItems = Number(count);
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({ 
      message: 'List of forms', 
      status: res.status, 
      data: transformedForms,
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
        [Op.gte]: new Date('2026-02-11T00:00:00.000Z'),
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

    const currentDate = dayjs();
    const targetDate = dayjs('2026-03-20');
    const completionBonusMap = new Map<string, boolean>();

    if (currentDate.isBefore(targetDate)) {
      const candidatePairs = [...new Set(
        forms
          .filter((form: any) => form.status === 'approved')
          .map((form: any) => `${form.user_id}-${form.project_id}`)
      )];

      if (candidatePairs.length > 0) {
        const pairConditions = candidatePairs.map((key) => {
          const [candidateUserId, candidateProjectId] = key.split('-').map((value) => Number(value));
          return { user_id: candidateUserId, project_id: candidateProjectId };
        });

        const approvedForms = await Form.findAll({
          attributes: [
            'user_id',
            'project_id',
            [sequelize.fn('COUNT', sequelize.col('form_id')), 'submission_count'],
          ],
          where: {
            status: 'approved',
            [Op.or]: pairConditions,
          },
          group: ['user_id', 'project_id'],
          having: sequelize.literal('COUNT("form_id") = 4'),
          raw: true,
        });

        approvedForms.forEach((form: any) => {
          const key = `${form.user_id}-${form.project_id}`;
          completionBonusMap.set(key, true);
        });
      }
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
      let base_points = 0;
      let bonus_points = 0;
      let completion_bonus = 0;
      let customer_type_bonus = 0;

      if (item.status === 'approved') {
        base_points = item.form_type.point_reward;

        // Derive product quantity from form_data.products[*].numberOfQuantity
        let product_quantity = 0;
        let isAuraEdition = false;
        if (item.form_data && Array.isArray(item.form_data)) {
          const productsEntry = item.form_data.find((entry: any) => entry.label === 'products');
          if (productsEntry && Array.isArray(productsEntry.value) && productsEntry.value.length > 0) {
            const quantity = Number(productsEntry.value[0]?.numberOfQuantity || 0);
            product_quantity = Number.isFinite(quantity) ? quantity : 0;
            isAuraEdition = productsEntry.value.some((product: { productCategory?: string }) => 
              product.productCategory === 'Aura Edition' || product.productCategory === 'TKDN Product'
            );
          }
        }

        // Completion bonus
        const completionKey = `${item.user_id}-${item.project_id}`;
        if (completionBonusMap.has(completionKey)) {
          completion_bonus = 200;
        }

        // New User customer type bonus (1000 points when form_data has customerType = 'New User')
        if (Array.isArray(item.form_data)) {
          const customerTypeEntry = item.form_data.find((entry: any) => entry.label === 'customerType' && entry.value === 'New User');
          if (customerTypeEntry) {
            customer_type_bonus = 1000;
          }
        }

        bonus_points = calculateBonusPoints(item.form_type.form_type_id, product_quantity, isAuraEdition);
        points_gained = base_points + bonus_points + completion_bonus + customer_type_bonus;
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
    const startDate = new Date('2026-02-11T00:00:00.000Z');
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
    const championStartDate = new Date('2026-02-11T00:00:00.000Z');

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
        AND f.created_at >= '2026-02-11T00:00:00.000Z'
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