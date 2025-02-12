import { Request, Response } from 'express';
import { UserAction } from '../../models/UserAction';
import { User } from '../../models/User';
import { Form } from '../../models/Form';
import { FormType } from '../../models/FormType';
import { Project } from '../../models/Project';
import { CustomRequest } from '../types/api';

export const getUserActionList = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const list = await UserAction.findAll({
      where: { user_id: userId },
      include: [
        {
          model: Form,
          include: [
            {
              model: FormType,
              attributes: ['form_name']
            },
            {
              model: Project,
              attributes: ['name']
            }
          ]
        },
        {
          model: User,
          attributes: ['username']
        }
      ],
      order: [['createdAt', 'DESC']],
    });
    res.status(200).json({ message: 'Action list', status: res.status, data: list });
  } catch (error: any) {
    console.error('Error delete user:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}