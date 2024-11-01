import express, { Request, Response } from 'express';
import { BlobServiceClient } from '@azure/storage-blob';

const router = express.Router();

export const uploadFile = async (req: Request, res: Response) => {
  try {
    const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING as string;
    const containerName = 'documents';

    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw new Error('Azure Storage connection string not found');
    }
    
    // Initialize Blob Service Client
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    // Access the file metadata via req.file
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Get a reference to the container and blob
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(req.file.originalname);

    // Upload the buffer directly to Azure Blob Storage
    await blobClient.uploadData(req.file.buffer);

    const fileUrl = blobClient.url;

    // Respond with success and file info
    res.json({
      message: 'File uploaded successfully',
      filePath: fileUrl, // Public file path
    });
  } catch (error) {
    console.error('Error handling upload:', error);
    res.status(500).json({ message: 'File upload failed' });
  }
}
