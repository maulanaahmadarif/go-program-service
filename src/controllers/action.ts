import { Request, Response } from 'express';

import { UserAction } from '../../models/UserAction';
import { Form } from '../../models/Form';
import { FormType } from '../../models/FormType';
import { Project } from '../../models/Project';
import { Redemption } from '../../models/Redemption';

interface CustomRequest extends Request {
  user?: {
    userId: number;
  };
}

export const getUserActionList = async (req: CustomRequest, res: Response) => {
  try {
    const user_id = req.user?.userId;
    
    const actions = await UserAction.findAll({
      where: { user_id },
      include: [
        {
          model: Form,
          attributes: ['form_type_id'],
          include: [
            { model: FormType, attributes: ['form_name'] },
            { model: Project, attributes: ['project_id', 'name'] }
          ]
        },
        {
          model: Redemption
        }
      ],
      order: [['createdAt', 'DESC']]
    })

    res.status(200).json({ message: 'List of user action', status: res.status, data: actions });
  } catch (error: any) {
    console.error('Error fetching user actions:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};