import express from 'express';
import { getQuestStatus, startQuest, claimQuestReward } from '../controllers/quest';
import authenticate from '../middleware/auth';

const router = express.Router();

router.get('/status', authenticate, getQuestStatus);
router.post('/start', authenticate, startQuest);
router.post('/claim', authenticate, claimQuestReward);

export default router;
