import { Request, Response } from 'express';
import { Product } from '../../models/Product';
import { CustomRequest } from '../types/api';
import { Op } from 'sequelize';

export const getProductList = async (req: CustomRequest, res: Response) => {
  try {
    const { is_active = true, product_id } = req.query;
    
    const whereClause: any = {
      is_active: is_active
    };

    // Add product_id filter if provided
    if (product_id) {
      whereClause.product_id = product_id;
    }

    const products = await Product.findAll({ 
      where: whereClause,
      order: [['points_required', 'ASC']]
    });

    res.status(200).json({ message: 'Product list', status: res.status, data: products });
  } catch (error: any) {
    console.error('Error fetching products:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};