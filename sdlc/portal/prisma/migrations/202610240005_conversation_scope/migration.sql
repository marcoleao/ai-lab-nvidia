-- Additive references only: existing conversations, requirements and approvals
-- keep their original scope. No historical links or decisions are fabricated.
CREATE OR REPLACE FUNCTION validate_chat_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Item" WHERE id=NEW."contextId" AND kind IN ('system','project','story')) THEN
    RAISE EXCEPTION 'Chat context must be a system, project or story';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE "ConversationLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "projectKind" "ItemKind" NOT NULL DEFAULT 'project',
  "storyId" TEXT NOT NULL,
  "storyKind" "ItemKind" NOT NULL DEFAULT 'story',
  "sourceType" TEXT NOT NULL CHECK ("sourceType" IN ('chat_turn', 'plan_proposal')),
  "sourceId" TEXT NOT NULL,
  "sourceVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("sourceVersion" >= 0),
  "storyVersion" INTEGER NOT NULL CHECK ("storyVersion" > 0),
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationLink_project_kind_check" CHECK ("projectKind" = 'project'),
  CONSTRAINT "ConversationLink_story_kind_check" CHECK ("storyKind" = 'story'),
  CONSTRAINT "ConversationLink_source_version_check" CHECK (
    ("sourceType" = 'chat_turn' AND "sourceVersion" = 0) OR
    ("sourceType" = 'plan_proposal' AND "sourceVersion" > 0)
  ),
  CONSTRAINT "ConversationLink_projectId_projectKind_fkey" FOREIGN KEY ("projectId", "projectKind") REFERENCES "Item"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConversationLink_storyId_storyKind_fkey" FOREIGN KEY ("storyId", "storyKind") REFERENCES "Item"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ConversationLink_source_target_revision_key" ON "ConversationLink" ("sourceType", "sourceId", "sourceVersion", "storyId", "storyVersion");
CREATE INDEX "ConversationLink_storyId_createdAt_id_idx" ON "ConversationLink" ("storyId", "createdAt", "id");
CREATE INDEX "ConversationLink_projectId_createdAt_id_idx" ON "ConversationLink" ("projectId", "createdAt", "id");
CREATE TRIGGER conversation_link_append_only BEFORE UPDATE OR DELETE ON "ConversationLink"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT, INSERT ON "ConversationLink" TO sdlc_portal_app;
