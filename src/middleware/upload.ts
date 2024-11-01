import multer from 'multer';
import path from 'path';

// Configure storage settings
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, path.join(process.cwd(), 'public'));
//   },
//   filename: (req, file, cb) => {
//     // Generate a unique filename
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//     cb(null, `${uniqueSuffix}-${file.originalname}`);
//   },
// });
const storage = multer.memoryStorage();

// Initialize multer with storage configuration
export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Optional: set file size limit (e.g., 10 MB)
});