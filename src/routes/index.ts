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
import detailsRoutes from './details';
import fortuneWheelRoutes from './fortune-wheel';
import mysteryBoxRoutes from './mystery-box';
import healthRoutes from './health';

const router = express.Router();

// Health check routes (no /api prefix needed, will be added at root level)
router.use('/health', healthRoutes);

router.use('/user', userRoutes);
router.use('/form', formRoutes);
router.use('/company', companyRoutes);
router.use('/action', actionRoutes);
router.use('/upload', uploadRoutes);
router.use('/auth', authRoutes);
router.use('/project', projectRoutes);
router.use('/product', productRoutes);
router.use('/point', redeemRoutes);
router.use('/details', detailsRoutes);
router.use('/fortune-wheel', fortuneWheelRoutes);
router.use('/mystery-box', mysteryBoxRoutes);

export default router;