# Contract Clause Extractor

This application extracts specific clauses from contract PDFs:

1. Indemnification/liability for data/security breach
2. Termination for convenience

## Architecture

- **Frontend**: NextJS with Material UI
- **Backend**: NextJS API routes with Prisma ORM
- **Database**: PostgreSQL
- **AI Service**: Express API that handles PDF processing

## Setup Instructions

### Prerequisites

- Node.js (v14+)
- PostgreSQL
- Yarn package manager

### Installation

1. Clone the repository:

   ```
   git clone <repository-url>
   cd contract-extractor
   ```

2. Install dependencies:

   ```
   yarn install
   ```

3. Set up Google Service Account:

   - Create a Google Cloud project and enable the required APIs
   - Create a service account and download the JSON key file
   - Add the path to your service account in the root workspace directory:

4. Set up environment variables:

   Create environment files for both packages:

   ```
   # packages/client/.env
   DATABASE_URL="postgresql://username:password@localhost:5432/contract_extractor"
   AI_SERVICE_URL="http://localhost:3001"
   GOOGLE_APPLICATION_CREDENTIALS="../../google-service-account.json"
   # Add any other required environment variables
   ```

   ```
   # packages/ai-service/.env
   PORT=3001
   GOOGLE_APPLICATION_CREDENTIALS="../../google-service-account.json"
   OPENAI_API_KEY="your-openai-api-key"
   API_BASE_URL="http://localhost:3000"
   GCS_BUCKET_NAME="your-gcs-bucket-name"
   # Add any other required environment variables
   ```

5. Set up the database:

   ```
   # Create a PostgreSQL database named "contract_extractor"
   # Then update the DATABASE_URL in packages/client/.env if needed

   cd packages/client
   yarn prisma generate
   yarn prisma migrate dev
   ```

### Running the Application

1. Start the development servers:

   ```
   yarn dev
   ```

2. Access the application:
   - Frontend: http://localhost:3000
   - AI Service: http://localhost:3001

## Usage

1. Upload a contract PDF through the web interface
2. The system will process the document and extract the relevant clauses
3. View the extracted clauses in the table below the upload section

## Project Structure

- `packages/client`: NextJS frontend and API routes
- `packages/ai-service`: Express service for PDF processing
