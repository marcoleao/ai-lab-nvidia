CREATE TABLE "WorkActivity" (
 "id" TEXT PRIMARY KEY,"storyId" TEXT NOT NULL REFERENCES "Item"("id") ON DELETE RESTRICT,
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL,"scopeKey" TEXT NOT NULL UNIQUE,"taskId" TEXT NOT NULL REFERENCES "Item"("id") ON DELETE RESTRICT,
 "currentAttemptId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "WorkActivity_storyId_kind_idx" ON "WorkActivity"("storyId","kind");
CREATE TABLE "WorkAttempt" (
 "id" TEXT PRIMARY KEY,"activityId" TEXT NOT NULL REFERENCES "WorkActivity"("id") ON DELETE RESTRICT,
 "sourceType" TEXT NOT NULL,"sourceId" TEXT NOT NULL,"sourceKey" TEXT NOT NULL UNIQUE,"revision" TEXT,
 "state" TEXT NOT NULL DEFAULT 'queued',"stage" TEXT NOT NULL DEFAULT 'queued',"provider" TEXT,
 "actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "startedAt" TIMESTAMP(3),"finishedAt" TIMESTAMP(3),"waitingSince" TIMESTAMP(3),"heartbeatAt" TIMESTAMP(3),
 "heartbeatIntervalMs" INTEGER NOT NULL DEFAULT 15000,"heartbeatStaleAfterMs" INTEGER NOT NULL DEFAULT 45000,
 "leaseId" TEXT,"errorCategory" TEXT,"summary" TEXT
);
CREATE INDEX "WorkAttempt_activityId_queuedAt_idx" ON "WorkAttempt"("activityId","queuedAt");
CREATE INDEX "WorkAttempt_state_queuedAt_idx" ON "WorkAttempt"("state","queuedAt");
CREATE TABLE "WorkTaskLink" (
 "activityId" TEXT NOT NULL REFERENCES "WorkActivity"("id") ON DELETE RESTRICT,
 "taskId" TEXT NOT NULL REFERENCES "Item"("id") ON DELETE RESTRICT,"scope" TEXT NOT NULL,
 "completion" TEXT NOT NULL DEFAULT 'manual_evidence',"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY("activityId","taskId")
);
CREATE INDEX "WorkTaskLink_taskId_idx" ON "WorkTaskLink"("taskId");
CREATE TABLE "WorkEvent" (
 "id" TEXT PRIMARY KEY,"attemptId" TEXT NOT NULL REFERENCES "WorkAttempt"("id") ON DELETE RESTRICT,
 "key" TEXT NOT NULL,"kind" TEXT NOT NULL,"stage" TEXT NOT NULL,"message" TEXT NOT NULL,
 "provider" TEXT,"category" TEXT,"payload" JSONB NOT NULL DEFAULT '{}',"timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("attemptId","key")
);
CREATE INDEX "WorkEvent_timestamp_kind_idx" ON "WorkEvent"("timestamp","kind");
