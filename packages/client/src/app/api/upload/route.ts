import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Storage } from '@google-cloud/storage';

// Initialize Prisma client
const prisma = new PrismaClient();

// Initialize Google Cloud Storage
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'fb_dioptra_process';
const bucket = storage.bucket(bucketName);

// AI service URL
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    // Parse the form data
    const formData = await req.formData();
    const file = formData.get('pdf') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Generate a unique filename
    const fileName = `${Date.now()}-${file.name}`;
    // Add the "input" subfolder to the file path
    const filePath = `input/${fileName}`;

    // Upload file to Google Cloud Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const gcsFile = bucket.file(filePath);

    await gcsFile.save(fileBuffer, {
      contentType: file.type,
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    // Get the public URL for client access
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;

    // Create the Google Storage URI for AI service
    const gsUri = `gs://${bucketName}/${filePath}`;

    // Create a record in the database with status "pending"
    const contract = await prisma.contract.create({
      data: {
        fileName: file.name, // Store the raw filename in the database
        status: 'pending',
      },
    });

    // Send request to AI service for extraction
    try {
      const response = await fetch(`${AI_SERVICE_URL}/process_document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: contract.id,
          filename: gsUri, // Send the Google Storage URI instead of public URL
        }),
      });

      if (!response.ok) {
        console.error('AI service responded with error:', await response.text());
      }
    } catch (aiError) {
      console.error('Failed to communicate with AI service:', aiError);
      // Continue execution - we don't want to fail the upload if AI service is down
    }

    // Return success response with contract ID
    return NextResponse.json(
      {
        message: 'File uploaded successfully',
        contractId: contract.id,
        fileUrl: publicUrl,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Error processing file:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
