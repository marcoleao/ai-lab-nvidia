BEGIN;
-- Only a derived query function is removed. Recorded references remain intact.
DROP FUNCTION sdlc_story_planning_reference(TEXT);
COMMIT;
