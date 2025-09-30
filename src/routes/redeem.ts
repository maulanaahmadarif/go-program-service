import express from 'express';

import { redeemPoint, redeemList, rejectRedeem, approveRedeem, checkUserRedeemStatus, downloadRedeem } from '../controllers/redeem';
import authenticate from '../middleware/auth';
import checkDomain from '../middleware/domain';

const router = express.Router();

router.post('/redeem', authenticate, checkDomain, redeemPoint);
router.get('/list', authenticate, redeemList);
router.get('/download', authenticate, downloadRedeem);
router.post('/reject', authenticate, rejectRedeem)
router.post('/approve', authenticate, approveRedeem)
router.get('/check-status', authenticate, checkUserRedeemStatus)

export default router;