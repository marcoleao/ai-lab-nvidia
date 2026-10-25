-- Additive contract: legacy records remain unchanged, including their missing facts.
CREATE TABLE "AuditInstallation" (
 id INTEGER PRIMARY KEY CHECK (id=1),
 "epochId" TEXT NOT NULL DEFAULT gen_random_uuid()::text CHECK (length("epochId") BETWEEN 1 AND 240),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "AuditInstallation" (id) VALUES (1);
ALTER TABLE "HistoryEvent"
 ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "auditEpochId" TEXT,
 ADD COLUMN outcome TEXT,
 ADD COLUMN phase TEXT,
 ADD COLUMN decision TEXT,
 ADD COLUMN "operationId" TEXT,
 ADD COLUMN "requestId" TEXT,
 ADD COLUMN "attemptId" TEXT,
 ADD COLUMN "causationEventId" TEXT,
 ADD COLUMN "subjectType" TEXT,
 ADD COLUMN "subjectId" TEXT,
 ADD COLUMN "occurredAt" TIMESTAMP(3),
 ADD COLUMN audit JSONB,
 ADD COLUMN "deduplicationKey" TEXT,
 ADD COLUMN "eventDigest" TEXT;
ALTER TABLE "HistoryEvent" ADD CONSTRAINT history_audit_version CHECK ("schemaVersion" IN (1,2));
ALTER TABLE "HistoryEvent" ADD CONSTRAINT history_audit_v2 CHECK (
 "schemaVersion"=1 OR (
  outcome IS NOT NULL AND outcome IN ('ACCEPTED','SUCCEEDED','REJECTED','FAILED','CANCELLED','NO_CHANGE','DEFERRED','UNKNOWN')
  AND phase IS NOT NULL AND phase IN ('REQUESTED','STARTED','COMPLETED','WAITING','OBSERVED')
  AND (decision IS NULL OR decision IN ('APPROVED','REJECTED','NOT_EVALUATED','NOT_APPLICABLE'))
  AND NULLIF("operationId",'') IS NOT NULL AND NULLIF("subjectType",'') IS NOT NULL AND NULLIF("subjectId",'') IS NOT NULL
  AND NULLIF("auditEpochId",'') IS NOT NULL AND audit->>'auditEpochId'="auditEpochId"
  AND "occurredAt" IS NOT NULL AND audit IS NOT NULL
  AND jsonb_typeof(audit)='object' AND audit->>'schemaVersion'='2'
  AND jsonb_typeof(audit->'target')='object'
  AND audit->'target'->>'id'="subjectId" AND audit->'target'->>'type'="subjectType"
  AND jsonb_typeof(audit->'targets')='array' AND jsonb_typeof(audit->'changes')='array'
  AND jsonb_typeof(audit->'evidence')='array'
  AND jsonb_typeof(audit->'initiator')='object' AND jsonb_typeof(audit->'executor')='object'
  AND length(audit->'initiator'->>'id') BETWEEN 1 AND 240
  AND length(audit->'initiator'->>'name') BETWEEN 1 AND 240
  AND audit->'initiator'->>'type' IN ('human','agent','system','service','anonymous','unknown')
  AND audit->'initiator'->>'authentication' IN ('declared_demo','service','verified','unauthenticated','unknown')
  AND audit->'executor'->>'id'="actorId" AND audit->'executor'->>'name'="actorName"
  AND audit->'executor'->>'type'="actorType"
  AND audit->'executor'->>'authentication' IN ('declared_demo','service','verified','unauthenticated','unknown')
  AND jsonb_typeof(audit->'source')='object'
  AND length(audit->'source'->>'component') BETWEEN 1 AND 240
  AND length(audit->'source'->>'channel') BETWEEN 1 AND 240
  AND jsonb_typeof(audit->'coverage')='object' AND audit->'coverage'->>'version'='2'
  AND jsonb_array_length(audit->'targets')<=5000 AND jsonb_array_length(audit->'changes')<=5000
  AND jsonb_array_length(audit->'evidence')<=100
  AND audit->>'changeCoverage' IN ('captured','not_applicable','not_captured')
  AND (outcome<>'UNKNOWN' OR phase='OBSERVED')
 ) IS TRUE
);
CREATE INDEX "HistoryEvent_operationId_timestamp_idx" ON "HistoryEvent"("operationId",timestamp);
CREATE INDEX "HistoryEvent_schemaVersion_outcome_timestamp_idx" ON "HistoryEvent"("schemaVersion",outcome,timestamp);
CREATE UNIQUE INDEX "HistoryEvent_deduplicationKey_key" ON "HistoryEvent"("deduplicationKey");
ALTER TABLE "HistoryEvent" ADD CONSTRAINT history_audit_dedup_pair CHECK (
 (
 ("deduplicationKey" IS NULL AND "eventDigest" IS NULL) OR
 ("schemaVersion"=2 AND length("deduplicationKey")=64 AND length("eventDigest")=64)
 ) IS TRUE
);
-- All envelope, changes and targets live in this same append-only row: no late
-- insertion into child tables can silently change an already recorded event.
-- Existing history_append_only remains in force. Runtime privileges are handled
-- separately from schema ownership; migrations do not install passwords/roles.
