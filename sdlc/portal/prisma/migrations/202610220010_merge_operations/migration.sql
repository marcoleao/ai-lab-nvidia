CREATE TABLE "MergeOperation" (
 "id" TEXT PRIMARY KEY, "executionId" TEXT NOT NULL UNIQUE REFERENCES "StoryExecution"("id") ON DELETE RESTRICT,
 "storyId" TEXT NOT NULL REFERENCES "Item"("id") ON DELETE RESTRICT,
 "projectId" INTEGER NOT NULL CHECK ("projectId" > 0), "iid" INTEGER NOT NULL CHECK ("iid" > 0),
 "sourceBranch" TEXT NOT NULL, "targetBranch" TEXT NOT NULL, "sha" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'tracking' CHECK ("state" IN ('tracking','queued','running','blocked','failed','succeeded')),
 "actorId" TEXT, "actorName" TEXT, "requestedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3),
 "origin" TEXT, "mergedBy" TEXT, "message" TEXT, "blocks" JSONB NOT NULL DEFAULT '[]',
 "leaseId" TEXT, "leaseUntil" TIMESTAMP(3), "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "MergeOperation_state_checkedAt_idx" ON "MergeOperation"("state", "checkedAt");
INSERT INTO "MergeOperation" ("id","executionId","storyId","projectId","iid","sourceBranch","targetBranch","sha","updatedAt")
 SELECT 'merge-'||e."id",e."id",e."storyId",r."gitlabProjectId",
 substring(e."mergeRequestUrl" from '/merge_requests/([0-9]+)$')::integer,e."branch",
 e."snapshot" #>> '{codeContext,targetBranch}',e."commitSha",CURRENT_TIMESTAMP
 FROM "StoryExecution" e JOIN "Repository" r ON r."id"=e."repositoryId"
 WHERE e."state"='succeeded' AND e."stage"='completed' AND r."gitlabProjectId">0
 AND e."mergeRequestUrl" ~ '/merge_requests/[0-9]+$' AND e."commitSha" ~ '^[a-f0-9]{40,64}$'
 AND e."branch" IS NOT NULL AND e."snapshot" #>> '{codeContext,targetBranch}' IS NOT NULL;
