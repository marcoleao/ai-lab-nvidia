-- Never merge, remove or choose between existing repositories automatically.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Repository" GROUP BY "systemId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'SYSTEM_REPOSITORY_CONFLICT: multiple legacy repositories require explicit review; no repository was removed';
  END IF;
END $$;
ALTER TABLE "Repository" DROP CONSTRAINT "Repository_runtime_check";
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_runtime_check" CHECK (runtime IN ('node','python','generic'));
CREATE UNIQUE INDEX "Repository_systemId_key" ON "Repository"("systemId");
COMMIT;
