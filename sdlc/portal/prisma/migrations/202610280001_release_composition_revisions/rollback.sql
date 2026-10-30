BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "ReleaseCompositionRevision" WHERE source='planned') THEN RAISE EXCEPTION 'Retain planned composition revisions; rollback would discard recorded decisions'; END IF; END; $$;
DROP TABLE "ReleaseCompositionRevision";
DROP FUNCTION validate_composition_revision();
COMMIT;
