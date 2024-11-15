import express from 'express';

// import authenticate from '../middleware/auth';
import {
  userLogin,
  userSignup,
  getUserProfile,
  getUserList,
  forgotPassword,
  resetPassword,
  updateUser,
  userSignupConfirmation,
  addInternalUser,
  deleteUser
} from '../controllers/user';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/login', userLogin);
router.post('/signup', userSignup);
// router.post('/add-internal-user', addInternalUser)
router.get('/profile', authenticate, getUserProfile);
router.get('/list', getUserList);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/update', authenticate, updateUser);
router.get('/confirmation/:token', userSignupConfirmation)
router.delete('/delete/:user_id', authenticate, deleteUser)

export default router;