import express, { Request, Response } from 'express';
import fs from 'fs';
import { BlobServiceClient } from '@azure/storage-blob';
import { fromBuffer, FileTypeResult } from 'file-type';
import pdf from 'pdf-parse';
import Tesseract from 'tesseract.js';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

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

export const _uploadFileDummy = async (req: Request, res: Response) => {
  try {
    // Check if the file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Determine the file type
    const fileBuffer = req.file.buffer;
    const fileType: FileTypeResult | undefined = await fromBuffer(req.file.buffer);

    if (!fileType) {
      return res.status(400).json({ message: 'File type not recognized' });
    }

    const imageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    const pdfType = 'application/pdf';

    if (imageTypes.includes(fileType.mime)) {
      // Handle image file
      const imageText = await Tesseract.recognize(fileBuffer, 'eng');

      const prompt = `
        You are an intelligent data extractor. Your task is to analyze the following text from a quotation document and extract specific information. 
        Please identify the quotation date, quotation number, and calculate the total quantity from the line items. 
        Return the results in the following JSON format:

        {
          "quotationDate": "YYYY-MM-DD",
          "quotationNumber": "QUO123456",
          "totalQuantity": 10
        }

        Here is the text to analyze:

        ${imageText.data.text} // The text extracted by Tesseract OCR
      `;

      const messages = [
        { role: 'system', content: 'You are an intelligent data extractor. Your job is to accurately identify specific information from given texts.' },
        { role: 'user', content: prompt }
      ];


      const chatCompletion = await client.chat.completions.create({
        messages: messages as any,
        model: 'gpt-3.5-turbo',
      });

      return res.status(200).json({
        message: 'Uploaded file is a valid image',
        data: chatCompletion.choices[0].message.content,
      });
      // Tesseract.recognize(
      //   fileBuffer,
      //   'eng', // Specify the language; 'eng' is English
      //   {
      //     logger: (info) => console.log(info), // Optional: log progress
      //   }
      // ).then(({ data: { text } }) => {
      //   // The extracted text is available in text
        
      //   return res.status(200).json({
      //     message: 'Uploaded file is a valid image',
      //     extractedText: text,
      //   });
      // }).catch((error) => {
      //   console.error('Error during OCR processing:', error);
      //   return res.status(500).send('Error during OCR processing');
      // });
    } else if (fileType.mime === pdfType) {
      // Handle PDF file
      const pdfData = await pdf(fileBuffer);

      return res.status(200).json({
        message: 'Uploaded file is a valid PDF',
        data: pdfData.text,
      });
    } else {
      return res.status(400).json({ message: 'Invalid file type. Only images and PDF files are allowed.' });
    }
  } catch (error) {
    console.error('Error validating file type:', (error as Error).message);
    res.status(500).send({ message: 'Something wrong happens' });
  }
}