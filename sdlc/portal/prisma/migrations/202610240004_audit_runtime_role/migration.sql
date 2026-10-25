-- Separate the runtime account from the migration owner in the local LAB.
-- Provision its password outside the migration; this file contains no credential.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sdlc_portal_app') THEN
    CREATE ROLE sdlc_portal_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='sdlc_portal_app'
             AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit))
     OR EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='sdlc_portal_app')
     OR EXISTS (SELECT FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname='sdlc_portal_app')
     OR EXISTS (SELECT FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE r.rolname='sdlc_portal_app') THEN
    RAISE EXCEPTION 'Existing runtime role has unexpected privileges or ownership';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO sdlc_portal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sdlc_portal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sdlc_portal_app;
REVOKE ALL ON "_prisma_migrations" FROM sdlc_portal_app;
REVOKE ALL ON "AuditInstallation" FROM sdlc_portal_app;
GRANT SELECT ON "AuditInstallation" TO sdlc_portal_app;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "HistoryEvent" FROM sdlc_portal_app;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "PlanRevision" FROM sdlc_portal_app;

CREATE TABLE "ItemAuditRevision" (
  id TEXT PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  description TEXT NOT NULL,
  digest TEXT NOT NULL,
  "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE ("itemId", version)
);
CREATE INDEX "ItemAuditRevision_item_idx" ON "ItemAuditRevision" ("itemId", version);
CREATE TRIGGER item_audit_revision_append_only BEFORE UPDATE OR DELETE ON "ItemAuditRevision"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT, INSERT ON "ItemAuditRevision" TO sdlc_portal_app;

CREATE FUNCTION require_runtime_audit_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'sdlc_portal_app' AND NEW."schemaVersion" <> 2 THEN
    RAISE EXCEPTION 'Runtime audit requires contract v2';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER history_runtime_contract BEFORE INSERT ON "HistoryEvent"
FOR EACH ROW EXECUTE FUNCTION require_runtime_audit_contract();
