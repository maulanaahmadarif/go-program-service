import express from 'express';

// import authenticate from '../middleware/auth';
import { userLogin, userSignup, getUserProfile, getUserList } from '../controllers/user';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/login', userLogin);
router.post('/signup', userSignup);
router.get('/profile', authenticate, getUserProfile);
router.get('/list', getUserList);

export default router;