-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "indemnificationText" TEXT,
    "terminationText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);
