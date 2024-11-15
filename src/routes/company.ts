import express from 'express';

import authenticate from '../middleware/auth';
import { createCompany, getCompanyList, getCompanyDetail, mergeCompany, deleteCompany } from '../controllers/company';

const router = express.Router();

router.post('/create', createCompany);
router.get('/list', getCompanyList);
router.get('/detail/:company_id', getCompanyDetail);
router.put('/merge', authenticate, mergeCompany);
router.delete('/delete/:company_id', authenticate, deleteCompany)

export default router;