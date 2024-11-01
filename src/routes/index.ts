import express from 'express';
import userRoutes from './user';
import companyRoutes from './company';
import formRoutes from './form';
import actionRoutes from './action';
import uploadRoutes from './upload';
import authRoutes from './auth';
import projectRoutes from './project';
import productRoutes from './product';
import redeemRoutes from './redeem';

const router = express.Router();

router.use('/user', userRoutes);
router.use('/form', formRoutes);
router.use('/company', companyRoutes);
router.use('/action', actionRoutes);
router.use('/upload', uploadRoutes);
router.use('/auth', authRoutes);
router.use('/project', projectRoutes);
router.use('/product', productRoutes);
router.use('/point', redeemRoutes);

export default router;