import express from 'express';

import { getProjectList, createProject } from '../controllers/project';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/create', authenticate, createProject);
router.get('/list', authenticate, getProjectList);

export default router;