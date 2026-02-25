import express from 'express';

import { getProductList } from '../controllers/product';
import authenticate from '../middleware/auth';
import { cacheGet } from '../middleware/cache';

const router = express.Router();

// router.get('/list', cacheGet({ keyPrefix: 'cache:product:list', ttlSeconds: 300 }), getProductList);
router.get('/list', getProductList);

export default router;