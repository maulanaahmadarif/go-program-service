import express from 'express';

// import authenticate from '../middleware/auth';
import { userLogin, userSignup, getUserProfile, getUserList, forgotPassword, resetPassword, updateUser, userSignupConfirmation } from '../controllers/user';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/login', userLogin);
router.post('/signup', userSignup);
router.get('/profile', authenticate, getUserProfile);
router.get('/list', getUserList);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/update', authenticate, updateUser);
router.get('/confirmation/:token', userSignupConfirmation)

export default router;