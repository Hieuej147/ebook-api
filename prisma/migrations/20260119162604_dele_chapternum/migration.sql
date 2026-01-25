/*
  Warnings:

  - You are about to drop the column `chapterNumber` on the `chapters` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "chapters_chapterNumber_idx";

-- AlterTable
ALTER TABLE "chapters" DROP COLUMN "chapterNumber";
