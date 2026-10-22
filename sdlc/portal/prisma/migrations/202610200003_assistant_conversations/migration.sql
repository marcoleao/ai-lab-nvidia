BEGIN;
CREATE TABLE "ChatSession" (
 id TEXT PRIMARY KEY, "contextId" TEXT NOT NULL UNIQUE REFERENCES "Item"(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL DEFAULT 0, "nextTurn" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ChatTurn" (
 id TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL REFERENCES "ChatSession"(id) ON DELETE RESTRICT,
 sequence INTEGER NOT NULL, input TEXT NOT NULL, output TEXT,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
 model TEXT, error TEXT, "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL,
 "contextSnapshot" JSONB NOT NULL, "leaseId" TEXT, "leaseUntil" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE("sessionId",sequence)
);
CREATE INDEX "ChatTurn_status_createdAt_idx" ON "ChatTurn"(status,"createdAt");
CREATE FUNCTION validate_chat_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Item" WHERE id=NEW."contextId" AND kind IN ('system','project')) THEN RAISE EXCEPTION 'Chat context must be a system or project'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER chat_context BEFORE INSERT OR UPDATE ON "ChatSession" FOR EACH ROW EXECUTE FUNCTION validate_chat_context();
COMMIT;
