import { Request, Response } from 'express';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import ExcelJS from 'exceljs'

import { FormType } from '../../models/FormType';
import { Form } from '../../models/Form';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { sequelize } from '../db';
import { logAction } from '../middleware/log';
import { UserAction } from '../../models/UserAction';
import { Project } from '../../models/Project';
import { sendEmail } from '../services/mail';
import { formatJsonToLabelValueString } from '../utils';

export const deleteForm = async (req: Request, res: Response) => {
  const form_id = req.params.form_id;
  const product_quantity = Number(req.query.product_quantity) || 0;
  const reason = req.query.reason as string

  try {
    if (form_id) {
      const [numOfAffectedRows, updatedForms] = await Form.update(
        { status: 'rejected', note: reason },
        { where: { form_id }, returning: true }
      )

      if (numOfAffectedRows > 0) {
        const updatedForm = updatedForms[0]; // Access the first updated record
        let removedPoint = 0;

        const user = await User.findByPk(updatedForm.user_id);
        const company = await Company.findByPk(user?.company_id);
        const formType = await FormType.findByPk(updatedForm.form_type_id);
        const formsCount = await Form.count(
          {
            where: {
              user_id: user?.user_id,
              project_id: updatedForm.project_id,
              status: 'approved'
            },
          }
        )
        
        if (updatedForm.form_type_id === 1) {
          if (product_quantity >= 1 && product_quantity <= 50) {
            removedPoint = 10
          } else if (product_quantity > 50 && product_quantity <= 300) {
            removedPoint = 20
          } else if (product_quantity > 300) {
            removedPoint = 40
          }
        } else if (updatedForm.form_type_id === 4) {
          if (product_quantity >= 1 && product_quantity <= 50) {
            removedPoint = 20
          } else if (product_quantity > 50 && product_quantity <= 300) {
            removedPoint = 50
          } else if (product_quantity > 300) {
            removedPoint = 100
          }
        } else if (updatedForm.form_type_id === 5) {
          if (product_quantity >= 1 && product_quantity <= 50) {
            removedPoint = 50
          } else if (product_quantity > 50 && product_quantity <= 300) {
            removedPoint = 100
          } else if (product_quantity > 300) {
            removedPoint = 200
          }
        } else if (updatedForm.form_type_id === 6) {
          if (product_quantity >= 1 && product_quantity <= 50) {
            removedPoint = 100
          } else if (product_quantity > 50 && product_quantity <= 300) {
            removedPoint = 200
          } else if (product_quantity > 300) {
            removedPoint = 400
          }
        } else if (updatedForm.form_type_id === 7) {
          if (product_quantity >= 1 && product_quantity <= 50) {
            removedPoint = 5
          } else if (product_quantity > 50 && product_quantity <= 300) {
            removedPoint = 10
          } else if (product_quantity > 300) {
            removedPoint = 20
          }
        } else if (updatedForm.form_type_id === 8) {
          if (product_quantity >= 1 && product_quantity <= 50) {
            removedPoint = 10
          } else if (product_quantity > 50 && product_quantity <= 300) {
            removedPoint = 25
          } else if (product_quantity > 300) {
            removedPoint = 50
          }
        } else if (updatedForm.form_type_id === 9) {
          if (product_quantity >= 1 && product_quantity <= 50) {
            removedPoint = 25
          } else if (product_quantity > 50 && product_quantity <= 300) {
            removedPoint = 50
          } else if (product_quantity > 300) {
            removedPoint = 100
          }
        } else if (updatedForm.form_type_id === 10) {
          if (product_quantity >= 1 && product_quantity <= 50) {
            removedPoint = 50
          } else if (product_quantity > 50 && product_quantity <= 300) {
            removedPoint = 100
          } else if (product_quantity > 300) {
            removedPoint = 200
          }
        }

        // ! CHECK IF ONE OF FORM SUBMITTED BEFORE 14 DECEMBER 2024
        if (user?.user_type === 'T2') {
          if (formsCount === 5) {
            removedPoint -= 200
          }
        } else if (user?.user_type === 'T1') {
          if (formsCount === 3) {
            removedPoint -= 200
          }
        }

        if (user && formType) {
          user.total_points = (user.total_points || 0) - formType.point_reward - removedPoint; // Assuming `points` field exists on User
          user.accomplishment_total_points = (user.accomplishment_total_points || 0) - formType.point_reward - removedPoint;
          await user.save();
        }
    
        if (company && formType) {
          company.total_points = (company.total_points || 0) - formType.point_reward - removedPoint; // Assuming `points` field exists on User
          await company.save();
        }
    
        // await logAction(userId, req.method, 1, 'FORM', req.ip, req.get('User-Agent'));
    
        await UserAction.create({
          user_id: user!.user_id,
          entity_type: 'FORM',
          action_type: req.method,
          form_id: Number(form_id),
          note: reason,
          // ip_address: req.ip,
          // user_agent: req.get('User-Agent'),
        });

        let htmlTemplate = fs.readFileSync(path.join(process.cwd(), 'src', 'templates', 'rejectEmail.html'), 'utf-8');

        htmlTemplate = htmlTemplate
          .replace('{{username}}', user!.username)
          .replace('{{reason}}', reason)

        await sendEmail({ to: user!.email, subject: 'Your Submission is Rejected!', html: htmlTemplate });

      } else {
        res.status(400).json({ message: 'No record found with the specified form_id.', status: res.status });
      }
      
      res.status(200).json({ message: 'Form deleted', status: res.status });
    } else {
      res.status(400).json({ message: 'Form failed to delete', status: res.status });
    }
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

  const transaction = await sequelize.transaction();

  const userId = req.user?.userId;
  const companyId = req.user?.companyId;
  let isProjectFormCompleted = false;
  
  try {
    const submission = await Form.create({
      user_id: userId,
      form_type_id,
      form_data,
      project_id,
      status: 'approved'
    })

    // Update user points based on the form submission
    const company = await Company.findByPk(companyId, { transaction });
    const user = await User.findByPk(userId, { transaction });
    const formType = await FormType.findByPk(form_type_id, { transaction });
    const formsCount = await Form.count(
      {
        where: {
          user_id: userId,
          project_id: project_id,
          status: 'approved'
        },
        transaction
      }
    )

    let additionalPoint = 0;
    if (formType) {
      if (formType.form_type_id === 1) {
        if (product_quantity >= 1 && product_quantity <= 50) {
          additionalPoint = 10
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 20
        } else if (product_quantity > 300) {
          additionalPoint = 40
        }
      } else if (formType.form_type_id === 4) {
        if (product_quantity >= 1 && product_quantity <= 50) {
          additionalPoint = 20
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 50
        } else if (product_quantity > 300) {
          additionalPoint = 100
        }
      } else if (formType.form_type_id === 5) {
        if (product_quantity >= 1 && product_quantity <= 50) {
          additionalPoint = 50
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 100
        } else if (product_quantity > 300) {
          additionalPoint = 200
        }
      } else if (formType.form_type_id === 6) {
        if (product_quantity >= 1 && product_quantity <= 50) {
          additionalPoint = 100
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 200
        } else if (product_quantity > 300) {
          additionalPoint = 400
        }
      } else if (formType.form_type_id === 7) {
        if (product_quantity >= 1 && product_quantity <= 50) {
          additionalPoint = 5
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 10
        } else if (product_quantity > 300) {
          additionalPoint = 20
        }
      } else if (formType.form_type_id === 8) {
        if (product_quantity >= 1 && product_quantity <= 50) {
          additionalPoint = 10
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 25
        } else if (product_quantity > 300) {
          additionalPoint = 50
        }
      } else if (formType.form_type_id === 9) {
        if (product_quantity >= 1 && product_quantity <= 50) {
          additionalPoint = 25
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 50
        } else if (product_quantity > 300) {
          additionalPoint = 100
        }
      } else if (formType.form_type_id === 10) {
        if (product_quantity >= 1 && product_quantity <= 50) {
          additionalPoint = 50
        } else if (product_quantity > 50 && product_quantity <= 300) {
          additionalPoint = 100
        } else if (product_quantity > 300) {
          additionalPoint = 200
        }
      }
    }

    const currentDate = dayjs();

    // Define the target comparison date
    const targetDate = dayjs('2024-12-14');
  
    if (currentDate.isBefore(targetDate, 'day')) {
      if (user?.user_type === 'T2') {
        if (formsCount === 6) {
          additionalPoint += 200
          isProjectFormCompleted = true;
        }
      } else if (user?.user_type === 'T1') {
        if (formsCount === 4) {
          additionalPoint += 200
          isProjectFormCompleted = true;
        }
      }
    }

    if (user && formType) {
      user.total_points = (user.total_points || 0) + formType.point_reward + additionalPoint; // Assuming `points` field exists on User
      user.accomplishment_total_points = (user.accomplishment_total_points || 0) + formType.point_reward + additionalPoint;
      await user.save({ transaction });
    }

    if (company && formType) {
      company.total_points = (company.total_points || 0) + formType.point_reward + additionalPoint; // Assuming `points` field exists on User
      await company.save({ transaction });
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

    await transaction.commit();

    res.status(200).json({ message: `Form successfully submitted`, status: res.status, data: { form_completed: isProjectFormCompleted } });
  } catch (error: any) {
    await transaction.rollback();
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

export const getFormByProject = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = req.query.projectId;

    const forms = await Form.findAll(
      {
        where: {
          user_id: userId,
          project_id: projectId,
          status: 'approved'
        }
      }
    )

    res.status(200).json({ message: 'List of forms', status: res.status, data: forms });
  } catch (error: any) {
    console.error('Error fetching forms:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  }
}

export const getFormSubmission = async (req: Request, res: Response) => {
  try {
    const { company_id, user_id, start_date, end_date } = req.query;
    const companyWhere: any = {};
    const userWhere: any = {};

    if (company_id) {
      companyWhere.company_id = company_id;
    }

    if (user_id) {
      userWhere.user_id = user_id;
    }

    const whereClause: any = {};
  
    if (start_date) {
      whereClause.createdAt = {
        ...(whereClause.createdAt || {}),
        [Op.gte]: new Date(start_date as any),
      };
    }

    if (end_date) {
      whereClause.createdAt = {
        ...(whereClause.createdAt || {}),
        [Op.lte]: new Date(end_date as any),
      };
    }

    const forms = await Form.findAll({
      include: [
        {
          model: User,
          attributes: ['username'],
          required: true,
          where: userWhere,
          include: [
            {
              model: Company,
              attributes: ['name'],
              where: companyWhere,
              required: true,
            }
          ]
        },
        {
          model: Project,
          attributes: ['name']
        },
        {
          model: FormType,
          attributes: ['form_name']
        }
      ],
      where: whereClause,
      order: [['createdAt', 'DESC']]
    })
    res.status(200).json({ message: 'List of forms', status: res.status, data: forms });
  } catch (error: any) {
    console.error('Error fetching forms:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  } 
}

export const downloadSubmission = async (req: Request, res: Response) => {
  try {
    const { company_id, user_id, start_date, end_date } = req.query;
    const companyWhere: any = {};
    const userWhere: any = {};

    if (company_id) {
      companyWhere.company_id = company_id;
    }

    if (user_id) {
      userWhere.user_id = user_id;
    }

    const whereClause: any = {};
  
    if (start_date) {
      whereClause.createdAt = {
        ...(whereClause.createdAt || {}),
        [Op.gte]: new Date(start_date as any),
      };
    }

    if (end_date) {
      whereClause.createdAt = {
        ...(whereClause.createdAt || {}),
        [Op.lte]: new Date(end_date as any),
      };
    }

    const forms = await Form.findAll({
      include: [
        {
          model: User,
          attributes: ['username'],
          required: true,
          where: userWhere,
          include: [
            {
              model: Company,
              attributes: ['name'],
              where: companyWhere,
              required: true,
            }
          ]
        },
        {
          model: Project,
          attributes: ['name']
        },
        {
          model: FormType,
          attributes: ['form_name']
        }
      ],
      where: whereClause,
      order: [['createdAt', 'DESC']]
    })
    
    const workbook = new ExcelJS.Workbook();
    
    const worksheet = workbook.addWorksheet('submissions');

    worksheet.columns = [
      { header: 'Company', key: 'company', width: 10 },
      { header: 'Username', key: 'username', width: 10 },
      { header: 'Project', key: 'project', width: 20 },
      { header: 'Milestone', key: 'milestone', width: 30 },
      { header: 'Submitted At', key: 'created_at', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Form Data', key: 'form_data', width: 50 }
    ];

    // Step 4: Add data to the worksheet, including HTML as text
    forms.forEach((item, index) => {
      // Create the worksheet with the unique name
      worksheet.addRow({
        company: item.user.company?.name,
        username: item.user.username,
        project: item.project.name,
        milestone: item.form_type.form_name,
        created_at: dayjs(item.createdAt).format('DD MMM YYYY HH:mm'),
        status: item.status,
        form_data: formatJsonToLabelValueString(item.form_data as any),
      });
    });

    // // Step 5: Set response headers for downloading the file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=users_with_html.xlsx');

    // Step 6: Write the Excel file to the response
    await workbook.xlsx.write(res);

    // End the response
    res.end();

  } catch (error: any) {
    console.error('Error fetching forms:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }

    // Handle other types of errors
    res.status(500).json({ message: 'Something went wrong', error });
  } 
}