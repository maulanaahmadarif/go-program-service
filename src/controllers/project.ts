import { Response } from 'express';
import { Op, literal } from 'sequelize';

import { Project } from '../../models/Project';
import { Form } from '../../models/Form';
import { CustomRequest } from '../types/api';
import { invalidateCacheByPrefix } from '../middleware/cache';

const COMPLETED_PROJECT_FORM_COUNT = 4;
const projectCompletedFormCountSql = `(
  SELECT COUNT(*)
  FROM forms AS project_forms
  WHERE project_forms.project_id = "Project"."project_id"
    AND project_forms.status IN ('submitted', 'approved')
)`;

export const createProject = async (req: CustomRequest, res: Response) => {
  const { name, user_id } = req.body;

  try {
    const project = await Project.create({
      name,
      user_id
    })

    await invalidateCacheByPrefix('cache:project:list');

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
        await invalidateCacheByPrefix('cache:project:list');

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
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const { name, search, created_at, start_date, end_date, status } = req.query;

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
    const whereClause: any = { user_id: userId };
    const andConditions: any[] = [];
    const nameSearch = (search || name) as string | undefined;

    if (nameSearch) {
      whereClause.name = {
        [Op.iLike]: `%${nameSearch}%`
      };
    }

    if (created_at) {
      const createdAt = new Date(created_at as string);

      if (isNaN(createdAt.getTime())) {
        return res.status(400).json({
          message: 'Invalid created_at format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)',
          status: 400
        });
      }

      const startOfDay = new Date(createdAt);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(createdAt);
      endOfDay.setHours(23, 59, 59, 999);

      whereClause.createdAt = {
        [Op.gte]: startOfDay,
        [Op.lte]: endOfDay
      };
    } else if (start_date || end_date) {
      whereClause.createdAt = {};

      if (start_date) {
        const startDate = new Date(start_date as string);

        if (isNaN(startDate.getTime())) {
          return res.status(400).json({
            message: 'Invalid start_date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)',
            status: 400
          });
        }

        whereClause.createdAt[Op.gte] = startDate;
      }

      if (end_date) {
        const endDate = new Date(end_date as string);

        if (isNaN(endDate.getTime())) {
          return res.status(400).json({
            message: 'Invalid end_date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)',
            status: 400
          });
        }

        const endOfDay = new Date(endDate);
        if (endDate.getHours() === 0 && endDate.getMinutes() === 0 && endDate.getSeconds() === 0) {
          endOfDay.setHours(23, 59, 59, 999);
        }

        whereClause.createdAt[Op.lte] = endOfDay;
      }
    }

    if (status) {
      const projectStatus = String(status).toLowerCase();

      if (!['completed', 'ongoing'].includes(projectStatus)) {
        return res.status(400).json({
          message: "Status must be either 'completed' or 'ongoing'",
          status: 400
        });
      }

      andConditions.push(
        literal(
          `${projectCompletedFormCountSql} ${projectStatus === 'completed' ? '>=' : '<'} ${COMPLETED_PROJECT_FORM_COUNT}`
        )
      );
    }

    if (andConditions.length > 0) {
      whereClause[Op.and] = andConditions;
    }

    const { count, rows: projects } = await Project.findAndCountAll(
      {
        include: [
          {
            model: Form,
            attributes: ['form_id', 'form_type_id', 'status', 'createdAt'],
            required: false
          }
        ],
        where: whereClause,
        distinct: true,
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      }
    )

    const projectsWithSummary = projects.map(project => {
      const plainProject = project.get({ plain: true }) as any;
      const forms = plainProject.form || [];

      const formSummary = forms.reduce((summary: any, form: any) => {
        summary.total += 1;
        summary[form.status] = (summary[form.status] || 0) + 1;
        return summary;
      }, {
        total: 0,
        pending: 0,
        submitted: 0,
        approved: 0,
        rejected: 0
      });

      const completedFormCount = formSummary.submitted + formSummary.approved;

      return {
        ...plainProject,
        form_summary: {
          ...formSummary,
          submitted_or_approved: completedFormCount
        },
        project_status: completedFormCount >= COMPLETED_PROJECT_FORM_COUNT ? 'completed' : 'ongoing'
      };
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      message: 'Project list',
      status: res.status,
      data: projectsWithSummary,
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