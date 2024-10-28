import express, { Request, Response } from 'express';

const router = express.Router();

export const uploadFile = (req: Request, res: Response) => {
  try {
    // Access the file metadata via req.file
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Respond with success and file info
    res.json({
      message: 'File uploaded successfully',
      filePath: `/public/uploads/${req.file.filename}`, // Public file path
    });
  } catch (error) {
    console.error('Error handling upload:', error);
    res.status(500).json({ message: 'File upload failed' });
  }
}
