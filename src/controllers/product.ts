import { Request, Response } from 'express';

import { Product } from '../../models/Product';

interface CustomRequest extends Request {
  user?: {
    userId: number;
  };
}

export const getProductList = async (req: CustomRequest, res: Response) => {
  try {
    const products = await Product.findAll()

    res.status(200).json({ message: 'List of products', status: res.status, data: products });
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