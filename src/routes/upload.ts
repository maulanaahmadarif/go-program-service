import express from 'express';

import { upload } from '../middleware/upload';
import { uploadFile } from '../controllers/upload';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/file', authenticate, upload.single('file'), uploadFile);

export default router;