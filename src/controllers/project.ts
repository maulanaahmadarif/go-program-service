import { Response } from 'express';
import { Op } from 'sequelize';

import { Project } from '../../models/Project';
import { Form } from '../../models/Form';
import { User } from '../../models/User';
import { CustomRequest } from '../types/api';

export const createProject = async (req: CustomRequest, res: Response) => {
  const { name, user_id } = req.body;

  try {
    const project = await Project.create({
      name,
      user_id
    })

    res.status(200).json({ message: 'project created', status: res.status, data: project });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error creating project');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      req.log.error({ validationErrors: messages }, 'Validation error occurred');
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const editProject = async (req: CustomRequest, res: Response) => {
  const { name, project_id } = req.body;

  try {
    if (project_id) {
      const [numOfAffectedRows, updatedProject] = await Project.update(
        { name },
        { where: { project_id }, returning: true }
      )

      if (numOfAffectedRows > 0) {
        res.status(200).json({ message: 'Project name updated', status: res.status, data: updatedProject[0] });
      } else {
        res.status(400).json({ message: 'No record found with the specified project_id.', status: res.status });
      }
    } else {
      res.status(400).json({ message: 'Project failed to update', status: res.status });
    }
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error updating project');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      req.log.error({ validationErrors: messages }, 'Validation error occurred');
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

export const getProjectList = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const projects = await Project.findAll(
      {
        include: [
          { model: Form, where: { status: { [Op.or]: ['approved', 'submitted'] } }, required: false }
        ],
        where: { user_id: req.user?.userId },
        order: [['createdAt', 'DESC']]
      }
    )

    res.status(200).json({ message: 'Project list', status: res.status, data: projects });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching projects');

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      req.log.error({ validationErrors: messages }, 'Validation error occurred');
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
};