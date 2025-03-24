import * as fs from 'fs';
import * as path from 'path';
import { ImageAnnotatorClient, protos } from '@google-cloud/vision';
import axios from 'axios';
import { spawn } from 'child_process';

// Look for directories in the workspace root
const workspaceRoot = path.resolve(process.cwd(), '../../..');
const inputDir = path.join(workspaceRoot, 'in');
const outputDir = path.join(workspaceRoot, 'out');

// API endpoint for updating contract status
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

console.log('Workspace root:', workspaceRoot);
console.log('Input directory:', inputDir);
console.log('Output directory:', outputDir);

async function updateContractStatus(contractId: string, status: string): Promise<void> {
  try {
    console.log(`Updating contract ${contractId} status to: ${status}`);
    const response = await axios.put(`${API_BASE_URL}/api/contracts/${contractId}`, {
      status: status,
    });
    console.log(`Status update successful: ${response.status}`);
  } catch (error) {
    console.error(
      `Failed to update contract status: ${error instanceof Error ? error.message : String(error)}`,
    );
    // We don't want to throw here as this is a secondary operation
  }
}

async function extractTextFromPDF(gcsUri: string, contractId: string): Promise<string> {
  console.log('Starting OCR process for:', gcsUri);

  // Initialize Vision client
  console.log('Initializing Vision client...');
  const client = new ImageAnnotatorClient();

  // Set up the request for async document text detection
  const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'fb_dioptra_process';
  const gcsOutputUri = `gs://${BUCKET_NAME}/output/${contractId}/`;
  console.log(`Will write results to: ${gcsOutputUri}`);

  const request: protos.google.cloud.vision.v1.IAsyncBatchAnnotateFilesRequest = {
    requests: [
      {
        inputConfig: {
          gcsSource: {
            uri: gcsUri,
          },
          mimeType: 'application/pdf',
        },
        features: [
          {
            type: 'DOCUMENT_TEXT_DETECTION' as unknown as protos.google.cloud.vision.v1.Feature.Type.DOCUMENT_TEXT_DETECTION,
          },
        ],
        outputConfig: {
          gcsDestination: {
            uri: gcsOutputUri,
          },
          batchSize: 50,
        },
      },
    ],
  };

  console.log('Sending request to Google Vision API...');
  const [operation] = await client.asyncBatchAnnotateFiles(request);
  console.log('Waiting for operation to complete...');

  const [filesResponse] = await operation.promise();
  console.log('Operation completed');

  // The actual text content is now stored in the GCS bucket
  // We'll return a message with the location
  return `Text extraction complete. Results stored in: ${gcsOutputUri}`;
}

// Function to run the extract_knowledge script
async function runExtractKnowledge(id: string, gcsUri: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Starting knowledge extraction for contract ${id}...`);

    // Path to the extract_knowledge.ts script
    const scriptPath = path.join(__dirname, 'extract_knowledge.ts');

    // Spawn a new process to run the script
    const extractProcess = spawn('npx', ['ts-node', scriptPath, id, gcsUri]);

    // Capture and log stdout
    extractProcess.stdout.on('data', (data) => {
      console.log(`[Extract] ${data.toString().trim()}`);
    });

    // Capture and log stderr
    extractProcess.stderr.on('data', (data) => {
      console.error(`[Extract Error] ${data.toString().trim()}`);
    });

    // Handle process completion
    extractProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`Knowledge extraction completed successfully for contract ${id}`);
        resolve();
      } else {
        const error = new Error(`Knowledge extraction failed with code ${code}`);
        console.error(error.message);
        reject(error);
      }
    });
  });
}

async function main() {
  const [, , id, gcsUri] = process.argv;

  console.log('Command arguments:', { id, gcsUri });

  if (!id || !gcsUri) {
    console.error('Usage: ts-node process_document.ts <id> <gcsUri>');
    process.exit(1);
  }

  try {
    // Update status to PENDING before starting any processing
    await updateContractStatus(id, 'processing');

    console.log(`Processing file from GCS: ${gcsUri}`);
    const resultMessage = await extractTextFromPDF(gcsUri, id);

    // Show success message with the result information
    console.log(`✅ OCR complete. ${resultMessage}`);
    console.log(`   Document ID: ${id}`);

    // After OCR is complete, run the knowledge extraction
    const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'fb_dioptra_process';
    const outputGcsUri = `gs://${BUCKET_NAME}/output/${id}/`;
    await runExtractKnowledge(id, outputGcsUri);
  } catch (err) {
    console.error('❌ Error during processing:', err);
    console.error('Error details:', err instanceof Error ? err.stack : String(err));

    // Update status to FAILED on error
    await updateContractStatus(id, 'failed');
  }
}

console.log('Script started');
main().catch((err) => {
  console.error('Unhandled error in main:', err);
});
