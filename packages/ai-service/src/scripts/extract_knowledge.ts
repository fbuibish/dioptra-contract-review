import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Extract knowledge from processed document JSON files in Google Storage
 *
 * This script:
 * 1. Downloads all JSON files from a specified Google Storage bucket/path
 * 2. Extracts text content from each file's OCR structure
 * 3. Concatenates all text content
 * 4. Saves the result to a local text file
 * 5. Extracts specific clauses and updates the contract status
 *
 * Usage:
 *   ts-node extract_knowledge.ts gs://bucket-name/path/to/files unique-id
 */

// API endpoint for updating contract status
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Parse Google Storage URI (gs://bucket-name/path)
function parseGsUri(uri: string): { bucket: string; path: string } {
  if (!uri.startsWith('gs://')) {
    throw new Error('Invalid Google Storage URI. Must start with gs://');
  }

  const parts = uri.substring(5).split('/');
  const bucket = parts[0];
  const path = parts.slice(1).join('/');

  return { bucket, path };
}

// Extract text from the OCR JSON structure
function extractTextFromOcrJson(jsonContent: any): string {
  let extractedText = '';

  try {
    // Check if responses array exists
    if (jsonContent.responses && Array.isArray(jsonContent.responses)) {
      // Iterate through all responses and concatenate their text content
      for (const response of jsonContent.responses) {
        if (response.fullTextAnnotation && response.fullTextAnnotation.text) {
          extractedText += response.fullTextAnnotation.text + '\n\n';
        }
      }
    }

    // If no text was extracted using the direct method, try the detailed structure
    if (
      !extractedText &&
      jsonContent.responses &&
      jsonContent.responses[0] &&
      jsonContent.responses[0].fullTextAnnotation &&
      jsonContent.responses[0].fullTextAnnotation.pages
    ) {
      // Use the existing page/block/paragraph extraction logic as fallback
      const pages = jsonContent.responses[0].fullTextAnnotation.pages;

      // Process each page
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];

        if (page.blocks) {
          // Process each block in the page
          for (const block of page.blocks) {
            if (block.paragraphs) {
              // Process each paragraph in the block
              for (const paragraph of block.paragraphs) {
                if (paragraph.words) {
                  // Process each word in the paragraph
                  for (const word of paragraph.words) {
                    if (word.symbols) {
                      // Process each symbol in the word
                      for (const symbol of word.symbols) {
                        extractedText += symbol.text || '';
                      }
                      extractedText += ' ';
                    }
                  }
                }
                extractedText += '\n';
              }
            }
          }
          // Add extra newline between pages
          extractedText += '\n\n';
        }
      }
    }
  } catch (error) {
    console.error('Error extracting text from OCR JSON:', error);
  }

  return extractedText.trim();
}

// Extract specific clauses using AI/LLM
async function extractClausesWithAI(text: string): Promise<{
  indemnificationText: string;
  terminationText: string;
}> {
  console.log('Extracting clauses using AI...');

  try {
    // Prepare the prompt for the AI
    const prompt = `
    Please analyze the following contract text and extract two specific clauses:
    
    1. Indemnification or liability clause related to data/security breaches
    2. Termination for convenience clause
    
    For each clause, extract the exact text from the contract. If a clause is not found, indicate that it's not present.
    
    Format your response as JSON with the following structure:
    {
      "indemnificationText": "extracted text or 'No indemnification clause found.'",
      "terminationText": "extracted text or 'No termination for convenience clause found.'"
    }
    
    Contract text:
    ${text.substring(0, 15000)}  // Limiting to 15000 chars to avoid token limits
    `;

    // Call the OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a legal document analysis assistant. Extract specific clauses from contracts accurately.',
        },
        { role: 'user', content: prompt },
      ],
    });

    // Parse the response
    const responseContent = completion.choices[0].message.content;
    if (!responseContent) {
      throw new Error('Empty response from AI service');
    }

    // Try to parse the response as JSON
    try {
      // First, try to find a JSON object in the response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      let parsedResponse;

      if (jsonMatch) {
        // Try to parse the matched JSON
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        // If no JSON object is found, try to parse the entire response
        parsedResponse = JSON.parse(responseContent);
      }

      return {
        indemnificationText:
          parsedResponse.indemnificationText || 'No indemnification clause found.',
        terminationText:
          parsedResponse.terminationText || 'No termination for convenience clause found.',
      };
    } catch (parseError) {
      console.warn('Failed to parse AI response as JSON, using fallback extraction');
      console.log('AI response:', responseContent);

      // Fallback to keyword-based extraction
      return extractClausesWithKeywords(text);
    }
  } catch (error) {
    console.error('Error using AI to extract clauses:', error);

    // Fallback to keyword-based extraction
    console.log('Falling back to keyword-based extraction');
    return extractClausesWithKeywords(text);
  }
}

// Keyword-based clause extraction as fallback
function extractClausesWithKeywords(text: string): {
  indemnificationText: string;
  terminationText: string;
} {
  let indemnificationText = '';
  let terminationText = '';

  // Split text into paragraphs for analysis
  const paragraphs = text.split('\n\n');

  for (const paragraph of paragraphs) {
    const lowerParagraph = paragraph.toLowerCase();

    // Check for indemnification/liability clauses
    if (
      lowerParagraph.includes('indemnif') ||
      lowerParagraph.includes('liability') ||
      lowerParagraph.includes('data breach') ||
      lowerParagraph.includes('security breach')
    ) {
      indemnificationText += paragraph + '\n\n';
    }

    // Check for termination clauses
    if (
      lowerParagraph.includes('terminat') &&
      (lowerParagraph.includes('convenience') || lowerParagraph.includes('at will'))
    ) {
      terminationText += paragraph + '\n\n';
    }
  }

  return {
    indemnificationText: indemnificationText.trim() || 'No indemnification clause found.',
    terminationText: terminationText.trim() || 'No termination for convenience clause found.',
  };
}

// Update contract status and clauses via API
async function updateContractStatus(
  contractId: string,
  status: string,
  clauses?: {
    indemnificationText?: string;
    terminationText?: string;
  },
): Promise<void> {
  try {
    console.log(`Updating contract ${contractId} status to: ${status}`);

    const payload: any = { status };

    // Add clauses to payload if provided
    if (clauses) {
      if (clauses.indemnificationText) {
        payload.indemnificationText = clauses.indemnificationText;
      }
      if (clauses.terminationText) {
        payload.terminationText = clauses.terminationText;
      }
    }

    const response = await axios.put(`${API_BASE_URL}/api/contracts/${contractId}`, payload);
    console.log(`Status update successful: ${response.status}`);
  } catch (error) {
    console.error(
      `Failed to update contract status: ${error instanceof Error ? error.message : String(error)}`,
    );
    // We don't want to throw here as this is a secondary operation
  }
}

async function extractKnowledge(gsUri: string, id: string) {
  try {
    // Update status to 'extracting' when starting
    await updateContractStatus(id, 'extracting');

    // Parse the Google Storage URI
    const { bucket: bucketName, path: sourcePath } = parseGsUri(gsUri);

    // Set output file path using the provided ID
    const outputFilePath = path.resolve(__dirname, `../../data/extracted_knowledge_${id}.txt`);

    console.log(`Starting knowledge extraction from ${gsUri}`);

    // Initialize Google Cloud Storage
    const storage = new Storage();

    // List all files in the bucket with the specified prefix
    const [files] = await storage.bucket(bucketName).getFiles({
      prefix: sourcePath,
    });

    console.log(`Found ${files.length} files to process`);

    // Extract and concatenate text from all JSON files
    let combinedText = '';

    for (const file of files) {
      if (!file.name.endsWith('.json')) {
        console.log(`Skipping non-JSON file: ${file.name}`);
        continue;
      }

      console.log(`Processing file: ${file.name}`);

      // Download file content
      const [content] = await file.download();

      try {
        // Parse JSON content
        const jsonContent = JSON.parse(content.toString());

        // Extract text from the OCR JSON structure
        const extractedText = extractTextFromOcrJson(jsonContent);

        if (extractedText) {
          combinedText += extractedText + '\n\n';
        } else {
          console.warn(`No text content could be extracted from ${file.name}`);
        }
      } catch (parseError) {
        console.error(`Error parsing JSON from ${file.name}:`, parseError);
      }
    }

    // Ensure the output directory exists
    const outputDir = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    } else {
      // Clear existing files in the directory
      const files = fs.readdirSync(outputDir);
      for (const file of files) {
        fs.unlinkSync(path.join(outputDir, file));
      }
    }

    // Write the combined text to the output file
    fs.writeFileSync(outputFilePath, combinedText);

    console.log(`Knowledge extraction complete. Output saved to: ${outputFilePath}`);
    console.log(`Total extracted text length: ${combinedText.length} characters`);

    // Extract specific clauses using AI
    console.log('Extracting specific clauses from document...');
    const clauses = await extractClausesWithAI(combinedText);

    // Log the extracted clauses
    console.log('\n=== EXTRACTED CLAUSES ===');
    console.log('Indemnification Clause:');
    console.log('------------------------');
    console.log(clauses.indemnificationText);
    console.log('\nTermination Clause:');
    console.log('------------------');
    console.log(clauses.terminationText);
    console.log('========================\n');

    // Save clauses to separate files for reference
    const indemnificationTextPath = path.resolve(
      __dirname,
      `../../data/indemnification_clause_${id}.txt`,
    );
    const terminationTextPath = path.resolve(__dirname, `../../data/termination_clause_${id}.txt`);

    fs.writeFileSync(indemnificationTextPath, clauses.indemnificationText);
    fs.writeFileSync(terminationTextPath, clauses.terminationText);

    console.log(`Clauses extracted and saved to:
- ${indemnificationTextPath}
- ${terminationTextPath}`);

    // Update status to 'completed' when finished successfully and include the clauses
    await updateContractStatus(id, 'completed', clauses);
  } catch (error) {
    console.error('Error during knowledge extraction:', error);

    // Update status to 'failed' when an error occurs
    await updateContractStatus(id, 'failed');

    process.exit(1);
  }
}

// Execute the function if this script is run directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: ts-node extract_knowledge.ts unique-id gs://bucket-name/path/to/files');
    process.exit(1);
  }

  const id = args[0];
  const gsUri = args[1];

  extractKnowledge(gsUri, id).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

// Export for potential use in other modules
export { extractKnowledge };
