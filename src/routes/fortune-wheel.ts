import express from 'express';
import { spinWheel, checkEligibility, getFortuneWheelList, downloadFortuneWheelList } from '../controllers/fortune-wheel';
import authenticate from '../middleware/auth';
import checkDomain from '../middleware/domain';

const router = express.Router();

router.get('/check-eligibility', authenticate, checkEligibility);
router.post('/spin', authenticate, checkDomain, spinWheel);
router.get('/list', authenticate, getFortuneWheelList);
router.get('/list/download', authenticate, downloadFortuneWheelList);

export default router; 