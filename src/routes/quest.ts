import express from 'express';
import { getQuestStatus, startQuest, claimQuestReward, getQuestList, downloadQuestList } from '../controllers/quest';
import authenticate from '../middleware/auth';

const router = express.Router();

router.get('/status', authenticate, getQuestStatus);
router.post('/start', authenticate, startQuest);
router.post('/claim', authenticate, claimQuestReward);
router.get('/list', authenticate, getQuestList);
router.get('/list/download', authenticate, downloadQuestList);

export default router;
