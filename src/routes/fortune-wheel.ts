import express from 'express';
import { spinWheel, checkEligibility } from '../controllers/fortune-wheel';
import authenticate from '../middleware/auth';

const router = express.Router();

router.get('/check-eligibility', authenticate, checkEligibility);
router.post('/spin', authenticate, spinWheel);

export default router; 