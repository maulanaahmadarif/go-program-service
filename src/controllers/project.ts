import { Request, Response } from 'express';

import { Project } from '../../models/Project';

export const createProject = async (req: Request, res: Response) => {
  const { name, user_id } = req.body;

  try {
    const project = await Project.create({
      name,
      user_id
    })

    res.status(200).json({ message: 'project created', status: res.status });
  } catch (error: any) {
    console.error('Error creating project:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const getProjectList = async (req: Request, res: Response) => {
  try {
    const projects = await Project.findAll(
      {
        attributes: { exclude: ['user_id'] },
        order: [['createdAt', 'DESC']]
      }
    )

    res.status(200).json({ message: 'List of projects', status: res.status, data: projects });
  } catch (error: any) {
    console.error('Error fetching projects:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};