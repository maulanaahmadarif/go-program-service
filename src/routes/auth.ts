import express from 'express';
import { generateNewToken, revokeRefreshToken } from '../controllers/auth';

const router = express.Router();

router.post('/refresh-token', generateNewToken);
router.post('/revoke-token', revokeRefreshToken);

export default router;