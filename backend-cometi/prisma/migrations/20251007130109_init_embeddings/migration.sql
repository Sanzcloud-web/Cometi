-- AlterTable
ALTER TABLE "Chunk" ADD COLUMN     "chunkHash" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "chunkCount" INTEGER,
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "embeddingModel" TEXT;
