import express from 'express';

// import authenticate from '../middleware/auth';
import { createCompany, getCompanyList } from '../controllers/company';

const router = express.Router();

router.post('/create', createCompany);
router.get('/list', getCompanyList);

export default router;