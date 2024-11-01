import express from 'express';

import { getProductList } from '../controllers/product';
import authenticate from '../middleware/auth';

const router = express.Router();

router.get('/list', getProductList);

export default router;