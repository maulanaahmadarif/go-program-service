import express from 'express';

import { redeemPoint } from '../controllers/redeem';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/redeem', authenticate, redeemPoint);

export default router;