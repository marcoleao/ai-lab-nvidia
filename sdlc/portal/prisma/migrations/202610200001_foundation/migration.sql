-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('system', 'project', 'epic', 'story', 'task');

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "kind" "ItemKind" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "parentKind" "ItemKind",
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "liveStatus" TEXT NOT NULL DEFAULT 'not_deployed',
    "currentVersion" TEXT,
    "currentPackageDigest" TEXT,
    "url" TEXT,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ancestorIds" TEXT[],
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'human',
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestKey" (
    "id" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "scope" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("scope")
);

-- CreateTable
CREATE TABLE "ProvisioningJob" (
    "itemId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningJob_pkey" PRIMARY KEY ("itemId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_key_key" ON "Item"("key");

-- CreateIndex
CREATE INDEX "Item_parentId_archived_idx" ON "Item"("parentId", "archived");

-- CreateIndex
CREATE INDEX "Item_kind_archived_idx" ON "Item"("kind", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Item_id_kind_key" ON "Item"("id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_projectId_code_key" ON "Environment"("projectId", "code");

-- CreateIndex
CREATE INDEX "HistoryEvent_itemId_timestamp_idx" ON "HistoryEvent"("itemId", "timestamp");

-- CreateIndex
CREATE INDEX "HistoryEvent_ancestorIds_idx" ON "HistoryEvent" USING GIN ("ancestorIds");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_parentId_parentKind_fkey" FOREIGN KEY ("parentId", "parentKind") REFERENCES "Item"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningJob" ADD CONSTRAINT "ProvisioningJob_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints remain enforced even outside HTTP handlers.
ALTER TABLE "Item" ADD CONSTRAINT "Item_hierarchy_check" CHECK (
  (kind = 'system' AND "parentId" IS NULL AND "parentKind" IS NULL) OR
  (kind = 'project' AND "parentId" IS NOT NULL AND "parentKind" = 'system') OR
  (kind = 'epic' AND "parentId" IS NOT NULL AND "parentKind" = 'project') OR
  (kind = 'story' AND "parentId" IS NOT NULL AND "parentKind" = 'epic') OR
  (kind = 'task' AND "parentId" IS NOT NULL AND "parentKind" = 'story')
);
ALTER TABLE "Item" ADD CONSTRAINT "Item_status_check" CHECK (
  (kind = 'system' AND status IN ('active')) OR
  (kind = 'project' AND status IN ('awaiting_approval','approved')) OR
  (kind = 'epic' AND status IN ('todo','approved','doing','done')) OR
  (kind = 'story' AND status IN ('specification','approved','coding','code_review','security_scan','testing','uat','production','completed')) OR
  (kind = 'task' AND status IN ('todo','doing','done'))
);
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_code_check" CHECK (code IN ('QA','HML','PRD'));
CREATE FUNCTION prevent_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'HistoryEvent is append-only';
END;
$$;
CREATE TRIGGER history_append_only BEFORE UPDATE OR DELETE ON "HistoryEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

