import express from 'express';

import { redeemPoint, redeemList, rejectRedeem } from '../controllers/redeem';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/redeem', authenticate, redeemPoint);
router.get('/list', authenticate, redeemList);
router.post('/reject', authenticate, rejectRedeem)

export default router;