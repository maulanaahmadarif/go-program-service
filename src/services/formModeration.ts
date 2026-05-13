import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Op } from 'sequelize';

import { sequelize } from '../db';
import logger from '../utils/logger';
import { calculateBonusPoints } from '../utils/points';
import { enqueueApprovalEmail, enqueueRejectionEmail } from '../queues/emailQueue';
import { Form } from '../../models/Form';
import { FormType } from '../../models/FormType';
import { PointTransaction } from '../../models/PointTransaction';
import { Project } from '../../models/Project';
import { User } from '../../models/User';
import { UserAction } from '../../models/UserAction';
import { REDEMPTION_TIMEZONE } from './redemptionWindow';

dayjs.extend(utc);
dayjs.extend(timezone);

export class ModerationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface ApproveFormResult {
  message: string;
  status: number;
  points_awarded: number;
  base_points: number;
  bonus_points: number;
  completion_bonus: number;
  customer_type_bonus: number;
  form_type_4_milestone_bonus: number;
}

/** Form type 4 milestone window in REDEMPTION_TIMEZONE (default Asia/Jakarta): 2026-05-13 start through 2026-06-20 EOD */
const type4StartDate = dayjs.tz('2026-05-13 00:00:00', REDEMPTION_TIMEZONE).toDate();
/** Shared campaign end: inclusive through end of 2026-06-20 in Jakarta (completion bonus + type 4 window). */
const CAMPAIGN_END_JAKARTA = dayjs.tz('2026-06-20', REDEMPTION_TIMEZONE).endOf('day');
const type4EndDate = CAMPAIGN_END_JAKARTA.toDate();

const getDerivedProductQuantity = (formData: unknown): number => {
  if (!Array.isArray(formData)) return 0;
  const productsEntry = formData.find((entry: any) => entry?.label === 'products');
  if (!productsEntry || !Array.isArray(productsEntry.value) || productsEntry.value.length === 0) return 0;
  const quantity = Number(productsEntry.value[0]?.numberOfQuantity || 0);
  return Number.isFinite(quantity) ? quantity : 0;
};

const parseFormDataFlags = (formData: unknown) => {
  let isAuraEdition = false;
  let customerTypeBonus = 0;
  if (Array.isArray(formData)) {
    for (const entry of formData as { label?: string; value?: unknown }[]) {
      if (entry.label === 'products' && Array.isArray(entry.value)) {
        isAuraEdition = entry.value.some((product: { productCategory?: string }) =>
          product.productCategory === 'Aura Edition' || product.productCategory === 'TKDN Product'
        );
      } else if (entry.label === 'customerType' && entry.value === 'New User') {
        customerTypeBonus = 1000;
      }
    }
  }
  return { isAuraEdition, customerTypeBonus };
};

export const approveFormById = async (formId: number): Promise<ApproveFormResult> => {
  const transaction = await sequelize.transaction();

  try {
    const existingForm = await Form.findByPk(formId, {
      attributes: ['form_id', 'status'],
      transaction,
    });
    if (!existingForm) {
      throw new ModerationError('Form not found', 404);
    }
    if (existingForm.status === 'approved') {
      throw new ModerationError('Form is already approved', 400);
    }

    const [numOfAffectedRows, updatedForms] = await Form.update(
      { status: 'approved' },
      { where: { form_id: formId }, returning: true, transaction }
    );

    if (numOfAffectedRows === 0) {
      throw new ModerationError('Form not found', 404);
    }

    const updatedForm = updatedForms[0];
    const formSubmittedAtJakarta = dayjs(updatedForm.createdAt).tz(REDEMPTION_TIMEZONE);
    /** 200pt completion bonus when the form was submitted on or before 2026-06-20 EOD in REDEMPTION_TIMEZONE (Jakarta). */
    const eligibleForCompletionBonus =
      formSubmittedAtJakarta.valueOf() <= CAMPAIGN_END_JAKARTA.valueOf();

    const [user, formType, project, approvedSubmissionsCount] = await Promise.all([
      User.findByPk(updatedForm.user_id, {
        transaction,
        attributes: ['user_id', 'username', 'email', 'user_type', 'company_id', 'total_points', 'accomplishment_total_points', 'lifetime_total_points'],
      }),
      FormType.findByPk(updatedForm.form_type_id, {
        transaction,
        attributes: ['form_type_id', 'form_name', 'point_reward'],
      }),
      Project.findByPk(updatedForm.project_id, {
        transaction,
        attributes: ['project_id', 'name'],
      }),
      eligibleForCompletionBonus
        ? Form.count({
            where: {
              user_id: updatedForm.user_id,
              project_id: updatedForm.project_id,
              status: 'approved',
            },
            transaction,
          })
        : Promise.resolve(0),
    ]);

    if (!user || !formType || !project) {
      throw new ModerationError('Required data not found', 404);
    }

    const { isAuraEdition, customerTypeBonus } = parseFormDataFlags(updatedForm.form_data);
    const effectiveProductQuantity = getDerivedProductQuantity(updatedForm.form_data);
    const additionalPoint = calculateBonusPoints(updatedForm.form_type_id, effectiveProductQuantity, isAuraEdition);
    const completionBonus = eligibleForCompletionBonus && approvedSubmissionsCount === 4 ? 200 : 0;

    const basePoints = formType.point_reward;
    const totalPoints = basePoints + additionalPoint + completionBonus + customerTypeBonus;

    await Promise.all([
      PointTransaction.create(
        {
          user_id: user.user_id,
          points: totalPoints,
          transaction_type: 'earn',
          form_id: Number(formId),
          description: `Earned ${totalPoints} points (${basePoints} base + ${additionalPoint} bonus + ${completionBonus} completion + ${customerTypeBonus} New User bonus) for form submission: ${formType.form_name} (${formType.form_type_id})`,
        },
        { transaction }
      ),
      UserAction.create(
        {
          user_id: user.user_id,
          entity_type: 'FORM',
          action_type: 'APPROVED',
          form_id: Number(formId),
        },
        { transaction }
      ),
    ]);

    await User.update(
      {
        total_points: sequelize.literal(`total_points + ${totalPoints}`),
        accomplishment_total_points: sequelize.literal(`accomplishment_total_points + ${totalPoints}`),
        lifetime_total_points: sequelize.literal(`lifetime_total_points + ${totalPoints}`),
      },
      {
        where: { user_id: user.user_id },
        transaction,
      }
    );

    let formType4MilestoneBonus = 0;
    if (
      updatedForm.form_type_id === 4 &&
      updatedForm.createdAt >= type4StartDate &&
      updatedForm.createdAt <= type4EndDate
    ) {
      const type4ApprovedCount = await Form.count({
        where: {
          user_id: updatedForm.user_id,
          form_type_id: 4,
          status: 'approved',
          createdAt: { [Op.gte]: type4StartDate, [Op.lte]: type4EndDate },
        },
        transaction,
      });

      if (type4ApprovedCount === 10) {
        formType4MilestoneBonus = 6000;
      } else if (type4ApprovedCount === 20) {
        formType4MilestoneBonus = 8000;
      } else if (type4ApprovedCount === 30) {
        formType4MilestoneBonus = 10000;
      }

      if (formType4MilestoneBonus > 0) {
        await PointTransaction.create(
          {
            user_id: user.user_id,
            points: formType4MilestoneBonus,
            transaction_type: 'earn',
            form_id: Number(formId),
            description: `Bonus points for passing ${type4ApprovedCount - 1} form type 4 submissions milestone`,
          },
          { transaction }
        );

        await User.update(
          {
            total_points: sequelize.literal(`total_points + ${formType4MilestoneBonus}`),
            accomplishment_total_points: sequelize.literal(`accomplishment_total_points + ${formType4MilestoneBonus}`),
            lifetime_total_points: sequelize.literal(`lifetime_total_points + ${formType4MilestoneBonus}`),
          },
          { where: { user_id: user.user_id }, transaction }
        );
      }
    }

    await transaction.commit();

    enqueueApprovalEmail({
      to: user.email,
      username: user.username,
      projectName: project.name,
      milestoneName: formType.form_name,
      formId: Number(formId),
    }).catch((error: any) => {
      logger.error({ error, stack: error.stack, formId }, 'Failed enqueue approval email');
    });

    return {
      message: 'Form approved successfully',
      status: 200,
      points_awarded: totalPoints + formType4MilestoneBonus,
      base_points: basePoints,
      bonus_points: additionalPoint,
      completion_bonus: completionBonus,
      customer_type_bonus: customerTypeBonus,
      form_type_4_milestone_bonus: formType4MilestoneBonus,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export interface RejectFormResult {
  message: string;
  status: number;
}

export const rejectFormById = async (formId: number, reason: string = '-'): Promise<RejectFormResult> => {
  const transaction = await sequelize.transaction();
  try {
    const existingForm = await Form.findByPk(formId, {
      attributes: ['form_id', 'status'],
      transaction,
    });
    if (!existingForm) {
      throw new ModerationError('Form not found', 404);
    }
    if (existingForm.status === 'rejected') {
      throw new ModerationError('Form is already rejected', 400);
    }

    const [numOfAffectedRows, updatedForms] = await Form.update(
      { status: 'rejected', note: reason },
      { where: { form_id: formId }, returning: true, transaction }
    );

    if (numOfAffectedRows === 0) {
      throw new ModerationError('No record found with the specified form_id.', 404);
    }

    const updatedForm = updatedForms[0];

    const [user, project, formType] = await Promise.all([
      User.findByPk(updatedForm.user_id, { transaction }),
      Project.findByPk(updatedForm.project_id, { transaction }),
      FormType.findByPk(updatedForm.form_type_id, { transaction }),
    ]);

    if (!user || !project || !formType) {
      throw new ModerationError('Required data not found', 404);
    }

    await UserAction.create(
      {
        user_id: user.user_id,
        entity_type: 'FORM',
        action_type: 'DELETE',
        form_id: Number(formId),
        note: reason,
      },
      { transaction }
    );

    await transaction.commit();

    enqueueRejectionEmail({
      to: user.email,
      username: user.username,
      projectName: project.name,
      milestoneName: formType.form_name,
      reason,
      formId: Number(formId),
    }).catch((error: any) => {
      logger.error({ error, stack: error.stack, formId }, 'Failed enqueue rejection email');
    });

    return { message: 'Form deleted', status: 200 };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

