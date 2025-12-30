import express from 'express';

import { redeemPoint, redeemReferralPoint, redeemList, getUserRedemptionList, rejectRedeem, approveRedeem, checkUserRedeemStatus, downloadRedeem } from '../controllers/redeem';
import authenticate from '../middleware/auth';
import checkDomain from '../middleware/domain';

const router = express.Router();

router.post('/redeem', authenticate, checkDomain, redeemPoint);
router.post('/redeem-referral', authenticate, checkDomain, redeemReferralPoint);
router.get('/list', authenticate, redeemList);
router.get('/user-list', authenticate, getUserRedemptionList);
router.get('/download', authenticate, downloadRedeem);
router.post('/reject', authenticate, rejectRedeem)
router.post('/approve', authenticate, approveRedeem)
router.get('/check-status', authenticate, checkUserRedeemStatus)

export default router;