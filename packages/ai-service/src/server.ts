import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// POST /process_document endpoint
app.post('/process_document', async (req, res) => {
  try {
    const { id, filename } = req.body;

    // Validate input
    if (!id || !filename) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Both id and filename are required',
      });
    }

    // Log the request
    console.log(`Received document processing request for id: ${id}, filename: ${filename}`);

    // Respond immediately with 200
    res.status(200).json({
      success: true,
      message: 'Document processing request received and processing started',
      data: {
        id,
        filename,
        timestamp: new Date().toISOString(),
      },
    });

    // After responding, kick off the processing script asynchronously
    const scriptPath = path.join(__dirname, 'scripts', 'process_document.ts');

    console.log(`Running script: ${scriptPath} ${id} "${filename}"`);
    exec(`ts-node ${scriptPath} ${id} "${filename}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Processing script error: ${error.message}`);
        return;
      }

      if (stderr) {
        console.error(`Processing script stderr: ${stderr}`);
        return;
      }

      console.log(`Document processing completed for id: ${id}`);
      console.log(`Output: ${stdout}`);
    });
  } catch (error) {
    console.error('Document processing error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process document request',
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
