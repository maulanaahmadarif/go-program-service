import express from 'express';
import { getCheckinStatus, performCheckin, getDailyCheckinRewards } from '../controllers/daily-checkin';
import authenticate from '../middleware/auth';
import checkDomain from '../middleware/domain';

const router = express.Router();

router.get('/rewards', authenticate, getDailyCheckinRewards);
router.get('/status', authenticate, getCheckinStatus);
router.post('/checkin', authenticate, performCheckin);

export default router;
