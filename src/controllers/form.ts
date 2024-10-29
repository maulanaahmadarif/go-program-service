import { Request, Response } from 'express';

import { FormType } from '../../models/FormType';
import { Form } from '../../models/Form';
import { User } from '../../models/User';
import { Company } from '../../models/Company';

import { logAction } from '../middleware/log';
import { UserAction } from '../../models/UserAction';

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

  const userId = req.user?.userId;
  const companyId = req.user?.companyId;
  
  try {
    const submission = await Form.create({
      user_id: userId,
      form_type_id,
      form_data,
      project_id,
    })

    // Update user points based on the form submission
    const company = await Company.findByPk(companyId);
    const user = await User.findByPk(userId);
    const formType = await FormType.findByPk(form_type_id);

    let additionalPoint = 0;
    if (formType) {
      if (formType.form_type_id === 1) {
        if (product_quantity > 1 && product_quantity <= 50) {
          additionalPoint = 10
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 20
        } else if (product_quantity > 300) {
          additionalPoint = 40
        }
      } else if (formType.form_type_id === 4) {
        if (product_quantity > 1 && product_quantity <= 50) {
          additionalPoint = 20
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 50
        } else if (product_quantity > 300) {
          additionalPoint = 100
        }
      } else if (formType.form_type_id === 5) {
        if (product_quantity > 1 && product_quantity <= 50) {
          additionalPoint = 50
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 100
        } else if (product_quantity > 300) {
          additionalPoint = 200
        }
      } else if (formType.form_type_id === 6) {
        if (product_quantity > 1 && product_quantity <= 50) {
          additionalPoint = 100
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 200
        } else if (product_quantity > 300) {
          additionalPoint = 400
        }
      }
    }

    if (user && formType) {
      user.total_points = (user.total_points || 0) + formType.point_reward + additionalPoint; // Assuming `points` field exists on User
      await user.save();
    }

    if (company && formType) {
      company.total_points = (company.total_points || 0) + formType.point_reward + additionalPoint; // Assuming `points` field exists on User
      await company.save();
    }

    // await logAction(userId, req.method, 1, 'FORM', req.ip, req.get('User-Agent'));

    await UserAction.create({
      user_id: userId,
      entity_type: 'FORM',
      action_type: req.method,
      form_id: submission.form_id,
      // ip_address: req.ip,
      // user_agent: req.get('User-Agent'),
    });

    res.status(200).json({ message: `Form successfully submitted`, status: res.status });
  } catch (error: any) {
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