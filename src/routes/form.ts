import express from 'express';

// import authenticate from '../middleware/auth';
import { createFormType, formSubmission, getFormByProject, deleteForm } from '../controllers/form';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/create-form-type', createFormType);
router.post('/submit', authenticate, formSubmission);
router.get('/project', authenticate, getFormByProject);
router.delete('/delete/:form_id', authenticate, deleteForm);

export default router;