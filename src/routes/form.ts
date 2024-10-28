import express from 'express';

// import authenticate from '../middleware/auth';
import { createFormType, formSubmission } from '../controllers/form';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/create-form-type', createFormType);
router.post('/submit', authenticate, formSubmission);

export default router;