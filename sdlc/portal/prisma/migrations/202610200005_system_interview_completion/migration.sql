BEGIN;
CREATE OR REPLACE FUNCTION validate_plan_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM "Item" i
   JOIN "ChatTurn" t ON t.id=NEW."turnId" AND t.kind='plan'
   JOIN "ChatSession" s ON s.id=t."sessionId"
   JOIN "Item" source ON source.id=s."contextId"
   WHERE i.id=NEW."projectId" AND i.kind='project'
     AND (source.id=i.id OR (
       source.kind='system' AND source.id=i."parentId"
       AND t."contextSnapshot"->>'createItems'='true'
       AND t."contextSnapshot"->>'contextId'=i.id
     ))
 ) THEN RAISE EXCEPTION 'Proposal must belong to the turn project or selected project of its system'; END IF;
 RETURN NEW;
END;$$;
COMMIT;
