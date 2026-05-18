import express from 'express';
import { redeemCoin, getCoinTransactions } from '../controllers/coin';
import authenticate from '../middleware/auth';
import checkDomain from '../middleware/domain';

const router = express.Router();

router.post('/redeem', authenticate, redeemCoin);
router.get('/transactions', authenticate, getCoinTransactions);

export default router;
