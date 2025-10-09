import express from 'express';
import { livenessProbe, readinessProbe } from '../controllers/health';

const router = express.Router();

router.get('/live', livenessProbe);
router.get('/ready', readinessProbe);

export default router;

