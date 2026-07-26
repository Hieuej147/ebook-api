CREATE TYPE "ConversationThreadStatus" AS ENUM ('IDLE', 'RUNNING', 'DELETING');
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'ERROR', 'STOPPED');

CREATE TABLE "conversation_threads" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New conversation',
  "status" "ConversationThreadStatus" NOT NULL DEFAULT 'IDLE',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_runs" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_events" (
  "runId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "threadId" TEXT NOT NULL,
  "event" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_events_pkey" PRIMARY KEY ("runId", "sequence")
);

CREATE INDEX "conversation_threads_userId_agentId_archivedAt_updatedAt_idx"
  ON "conversation_threads"("userId", "agentId", "archivedAt", "updatedAt");
CREATE INDEX "conversation_threads_agentId_updatedAt_idx"
  ON "conversation_threads"("agentId", "updatedAt");
CREATE INDEX "agent_runs_threadId_startedAt_idx" ON "agent_runs"("threadId", "startedAt");
CREATE UNIQUE INDEX "agent_runs_one_active_per_thread"
  ON "agent_runs"("threadId") WHERE "status" = 'RUNNING';
CREATE INDEX "agent_events_threadId_createdAt_sequence_idx"
  ON "agent_events"("threadId", "createdAt", "sequence");

ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "conversation_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
