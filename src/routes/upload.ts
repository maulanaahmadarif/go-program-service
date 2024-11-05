import express from 'express';

import { upload } from '../middleware/upload';
import { uploadFile, _uploadFileDummy } from '../controllers/upload';
import authenticate from '../middleware/auth';

const router = express.Router();

router.post('/file', authenticate, upload.single('file'), uploadFile);
router.post('/file-dummy', upload.single('file'), _uploadFileDummy);

export default router;