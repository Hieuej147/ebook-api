/*
  Warnings:

  - You are about to drop the column `ChapterNumber` on the `chapters` table. All the data in the column will be lost.
  - Added the required column `chapterNumber` to the `chapters` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "chapters_ChapterNumber_idx";

-- AlterTable
ALTER TABLE "chapters" DROP COLUMN "ChapterNumber",
ADD COLUMN     "chapterNumber" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "chapters_chapterNumber_idx" ON "chapters"("chapterNumber");
