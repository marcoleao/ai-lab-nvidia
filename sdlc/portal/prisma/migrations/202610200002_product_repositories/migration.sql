BEGIN;
ALTER TABLE "Item" ADD COLUMN "projectLifecycle" TEXT;
UPDATE "Item" SET "projectLifecycle"='planned' WHERE kind='project';
ALTER TABLE "Item" ADD CONSTRAINT "Item_lifecycle_check" CHECK (
 (kind='project' AND "projectLifecycle" IS NOT NULL AND "projectLifecycle" IN ('planned','active','completed','cancelled')) OR
 (kind<>'project' AND "projectLifecycle" IS NULL));
CREATE TABLE "Repository" (
 "id" TEXT PRIMARY KEY, "systemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
 "key" TEXT NOT NULL, "name" TEXT NOT NULL, "runtime" TEXT NOT NULL CHECK (runtime IN ('node','python')),
 "mode" TEXT NOT NULL DEFAULT 'create' CHECK (mode IN ('create','link')),
 "gitlabProjectId" INTEGER UNIQUE, "gitlabPath" TEXT, "gitlabUrl" TEXT,
 "state" TEXT NOT NULL DEFAULT 'pending', "message" TEXT NOT NULL DEFAULT '',
 "attempts" INTEGER NOT NULL DEFAULT 0, "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE("systemId","key")
);
CREATE TABLE "ItemRepository" (
 "itemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,
 PRIMARY KEY("itemId","repositoryId")
);
INSERT INTO "Repository" (id,"systemId",key,name,runtime,"gitlabProjectId","gitlabPath","gitlabUrl",state,message,"createdAt","updatedAt")
SELECT 'legacy-repository-'||id,"parentId",lower(COALESCE(data->>'code',key)),name,
 COALESCE(data->>'runtime','node'),(data->>'gitlabProjectId')::integer,data->>'gitlabPath',data->>'gitlabUrl',
 CASE WHEN data->>'gitlabState'='ready' THEN 'ready' ELSE 'not_configured' END,
 CASE WHEN data->>'gitlabState'='ready' THEN '' ELSE 'Repositório migrado; solicite provisionamento explicitamente.' END,
 "createdAt",CURRENT_TIMESTAMP FROM "Item" WHERE kind='project';
INSERT INTO "ItemRepository" SELECT id,'legacy-repository-'||id FROM "Item" WHERE kind='project';
WITH RECURSIVE work AS (
 SELECT id,id AS project_id FROM "Item" WHERE kind='project'
 UNION ALL SELECT i.id,w.project_id FROM "Item" i JOIN work w ON i."parentId"=w.id
)
INSERT INTO "ItemRepository" SELECT i.id,'legacy-repository-'||w.project_id FROM work w JOIN "Item" i ON i.id=w.id WHERE i.kind IN ('story','task');
ALTER TABLE "Environment" DROP CONSTRAINT "Environment_projectId_fkey";
DROP INDEX "Environment_projectId_code_key";
UPDATE "Environment" SET "projectId"='legacy-repository-'||"projectId";
ALTER TABLE "Environment" RENAME COLUMN "projectId" TO "repositoryId";
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Environment_repositoryId_code_key" ON "Environment"("repositoryId",code);
UPDATE "ProvisioningJob" SET state='cancelled',message='Repositório transferido ao Sistema; Projeto não provisiona GitLab.' WHERE "itemId" IN (SELECT id FROM "Item" WHERE kind='project');
INSERT INTO "HistoryEvent" (id,"itemId","ancestorIds","actorId","actorName","actorType",action,message,payload,timestamp)
SELECT 'repository-migration-'||id,id,ARRAY["parentId"],'migration:product-repositories','Migração do modelo','system',
 'REPOSITORY_OWNERSHIP_MIGRATED','Repositório e ambientes vinculados ao Sistema; Projeto preservado como iniciativa.',
 jsonb_build_object('repositoryId','legacy-repository-'||id,'systemId',"parentId",'lifecycle','planned'),CURRENT_TIMESTAMP FROM "Item" WHERE kind='project';
UPDATE "Item" SET data=data-'runtime'-'gitlabState'-'gitlabMessage'-'gitlabProjectId'-'gitlabPath'-'gitlabUrl',version=version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE kind='project';
CREATE FUNCTION validate_repository_system() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Item" WHERE id=NEW."systemId" AND kind='system') THEN RAISE EXCEPTION 'Repository owner must be a system'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER repository_owner BEFORE INSERT OR UPDATE ON "Repository" FOR EACH ROW EXECUTE FUNCTION validate_repository_system();
CREATE FUNCTION validate_item_repository() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id TEXT;
BEGIN
 WITH RECURSIVE chain AS (SELECT id,kind,"parentId" FROM "Item" WHERE id=NEW."itemId" UNION ALL SELECT i.id,i.kind,i."parentId" FROM "Item" i JOIN chain c ON i.id=c."parentId") SELECT id INTO owner_id FROM chain WHERE kind='system';
 IF NOT EXISTS (SELECT 1 FROM "Item" WHERE id=NEW."itemId" AND kind IN ('project','story','task')) OR NOT EXISTS (SELECT 1 FROM "Repository" WHERE id=NEW."repositoryId" AND "systemId"=owner_id) THEN RAISE EXCEPTION 'Repository must belong to the work item system'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER repository_scope BEFORE INSERT OR UPDATE ON "ItemRepository" FOR EACH ROW EXECUTE FUNCTION validate_item_repository();
COMMIT;
