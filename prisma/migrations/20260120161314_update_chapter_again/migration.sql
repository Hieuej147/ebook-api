/*
  Warnings:

  - Added the required column `ChapterNumber` to the `chapters` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "chapters" ADD COLUMN     "ChapterNumber" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "chapters_ChapterNumber_idx" ON "chapters"("ChapterNumber");
