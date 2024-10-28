import express from 'express';

const router = express.Router();

import { generateNewToken } from '../controllers/auth';

router.post('/refresh-token', generateNewToken);

export default router;