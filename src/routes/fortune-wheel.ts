import express from 'express';
import { spinWheel, checkEligibility, getFortuneWheelList, downloadFortuneWheelList } from '../controllers/fortune-wheel';
import authenticate from '../middleware/auth';
import { cacheGet } from '../middleware/cache';
import checkDomain from '../middleware/domain';

const router = express.Router();

router.get('/check-eligibility', authenticate, checkEligibility);
router.post('/spin', authenticate, checkDomain, spinWheel);
router.get('/list', authenticate, cacheGet({ keyPrefix: 'cache:fortune-wheel:list', ttlSeconds: 30, includeUser: true }), getFortuneWheelList);
router.get('/list/download', authenticate, downloadFortuneWheelList);

export default router; 