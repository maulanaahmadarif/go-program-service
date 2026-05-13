import { Response } from 'express';
import { UserAction } from '../../models/UserAction';
import { Form } from '../../models/Form';
import { FormType } from '../../models/FormType';
import { Project } from '../../models/Project';
import { CustomRequest } from '../types/api';
import { Redemption } from '../../models/Redemption';
import { Product } from '../../models/Product';
import { CoinTransaction } from '../../models/CoinTransaction';

export const getUserActionList = async (req: CustomRequest, res: Response) => {
  try {
    const user_id = req.user?.userId;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;

    if (page < 1) {
      return res.status(400).json({
        message: 'Page must be a positive integer',
        status: 400
      });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        message: 'Limit must be a positive integer between 1 and 100',
        status: 400
      });
    }

    const offset = (page - 1) * limit;
    
    const { count, rows: actions } = await UserAction.findAndCountAll({
      where: { user_id },
      include: [
        {
          model: Form,
          attributes: ['form_type_id'],
          required: false,
          include: [
            { model: FormType, attributes: ['form_name'] },
            { model: Project, attributes: ['project_id', 'name'] }
          ]
        },
        {
          model: Redemption,
          include: [{ model: Product, attributes: ['product_id', 'name'] }],
          required: false,
        },
        {
          model: CoinTransaction,
          attributes: ['transaction_id', 'coins', 'transaction_type', 'description', 'createdAt'],
          required: false,
        },
      ],
      distinct: true,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      message: 'List of user action',
      status: res.status,
      data: actions,
      pagination: {
        total_items: count,
        total_pages: totalPages,
        current_page: page,
        items_per_page: limit,
        has_next: page < totalPages,
        has_previous: page > 1
      }
    });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching user action list');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      req.log.error({ validationErrors: messages }, 'Validation error occurred');
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}