BEGIN;
-- One policy shared by projections, whole-scope filters and command checks.
-- jsonb text is deterministic in the pinned PostgreSQL runtime. The policy is
-- explicit; older immutable records are never silently reinterpreted.
CREATE FUNCTION sdlc_story_planning_reference(story_id TEXT) RETURNS JSONB
LANGUAGE sql STABLE AS $$
 WITH source AS (
  SELECT i.*,s.id AS spec_id,s.number AS spec_number,e.id AS execution_id,e."commitSha" AS sha,e."storyVersion" AS execution_version,
   encode(sha256(convert_to(jsonb_build_object('name',i.name,'description',i.description,'requirements',i.data->'requirements','acceptanceCriteria',i.data->'acceptanceCriteria','technicalPlan',i.data->'technicalPlan')::text,'UTF8')),'hex') AS content_digest
  FROM "Item" i
  LEFT JOIN LATERAL(SELECT id,number FROM "StorySpecificationRevision" WHERE "storyId"=i.id ORDER BY number DESC LIMIT 1) s ON true
  LEFT JOIN LATERAL(SELECT id,"commitSha","storyVersion" FROM "StoryExecution" WHERE "storyId"=i.id ORDER BY "createdAt" DESC,id DESC LIMIT 1) e ON true
  WHERE i.id=story_id AND i.kind='story'
 )
 SELECT jsonb_build_object('storyId',id,'storyKey',key,'storyName',name,'recordVersion',version,'contentPolicy','story-planning-v2','contentDigest',content_digest,
  'specification',CASE WHEN spec_id IS NULL THEN NULL ELSE jsonb_build_object('id',spec_id,'number',spec_number) END,
  'execution',CASE WHEN execution_id IS NULL THEN NULL ELSE jsonb_build_object('id',execution_id,'sha',sha,'storyRecordVersion',execution_version) END,
  'referenceToken',encode(sha256(convert_to(jsonb_build_object('policy','story-planning-v2','content',content_digest,'specification',spec_id,'code',CASE WHEN execution_id IS NULL THEN NULL WHEN sha IS NULL THEN jsonb_build_object('unconfirmedExecution',execution_id) ELSE jsonb_build_object('sha',sha) END)::text,'UTF8')),'hex'))
 FROM source;
$$;
REVOKE ALL ON FUNCTION sdlc_story_planning_reference(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sdlc_story_planning_reference(TEXT) TO sdlc_portal_app;
COMMIT;
