import express from 'express';

// import authenticate from '../middleware/auth';
import { getUserActionList } from '../controllers/action';
import authenticate from '../middleware/auth';


const router = express.Router();

router.get('/list', authenticate, getUserActionList);

export default router;