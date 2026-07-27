CREATE TYPE "ConversationMessageStatus" AS ENUM ('STREAMING', 'COMPLETED', 'ERROR');

CREATE TABLE "conversation_messages" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "ConversationMessageStatus" NOT NULL DEFAULT 'STREAMING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_messages_runId_id_key" ON "conversation_messages"("runId", "id");
CREATE INDEX "conversation_messages_threadId_createdAt_idx" ON "conversation_messages"("threadId", "createdAt");
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "conversation_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
