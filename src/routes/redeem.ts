import express from 'express';

import { redeemPoint, redeemList, rejectRedeem, approveRedeem } from '../controllers/redeem';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/redeem', authenticate, redeemPoint);
router.get('/list', authenticate, redeemList);
router.post('/reject', authenticate, rejectRedeem)
router.post('/approve', authenticate, approveRedeem)

export default router;