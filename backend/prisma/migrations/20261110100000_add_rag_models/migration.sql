CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

CREATE TABLE "KnowledgeBase" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "knowledgeBaseId" UUID NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storedFilePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentChunk" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "embedding" vector(768) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key"
    ON "DocumentChunk" ("documentId", "chunkIndex");

CREATE INDEX "KnowledgeBase_ownerUserId_idx"
    ON "KnowledgeBase" ("ownerUserId");

CREATE INDEX "Document_knowledgeBaseId_status_idx"
    ON "Document" ("knowledgeBaseId", "status");

CREATE INDEX "Document_uploadedByUserId_idx"
    ON "Document" ("uploadedByUserId");

CREATE INDEX "DocumentChunk_documentId_idx"
    ON "DocumentChunk" ("documentId");

CREATE INDEX "DocumentChunk_embedding_hnsw_idx"
    ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "KnowledgeBase"
    ADD CONSTRAINT "KnowledgeBase_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
    ADD CONSTRAINT "Document_knowledgeBaseId_fkey"
    FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
    ADD CONSTRAINT "Document_uploadedByUserId_fkey"
    FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentChunk"
    ADD CONSTRAINT "DocumentChunk_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
