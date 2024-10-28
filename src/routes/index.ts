import express from 'express';
import userRoutes from './user';
import companyRoutes from './company';
import formRoutes from './form';
import actionRoutes from './action';
import uploadRoutes from './upload';
import authRoutes from './auth';

const router = express.Router();

router.use('/user', userRoutes);
router.use('/form', formRoutes);
router.use('/company', companyRoutes);
router.use('/action', actionRoutes);
router.use('/upload', uploadRoutes);
router.use('/auth', authRoutes);

export default router;