import express from 'express';

// import authenticate from '../middleware/auth';
import { createCompany, getCompanyList, getCompanyDetail } from '../controllers/company';

const router = express.Router();

router.post('/create', createCompany);
router.get('/list', getCompanyList);
router.get('/detail/:company_id', getCompanyDetail);

export default router;