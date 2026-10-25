import type {AuditOutcome,AuditPhase,AuditDecision} from '../../../packages/shared/src/audit.ts';

export type AuditPolicy={outcome:AuditOutcome;phase:AuditPhase;decision?:AuditDecision;allowedOutcomes?:readonly AuditOutcome[];allowedPhases?:readonly AuditPhase[];effect:'local'|'request'|'observation'|'decision'|'external';changes:'expected'|'optional'|'not_applicable'};
const local:AuditPolicy={outcome:'SUCCEEDED',phase:'COMPLETED',effect:'local',changes:'expected',allowedOutcomes:['SUCCEEDED','NO_CHANGE']};
const request:AuditPolicy={outcome:'ACCEPTED',phase:'REQUESTED',effect:'request',changes:'optional'};
const response:AuditPolicy={outcome:'SUCCEEDED',phase:'COMPLETED',effect:'observation',changes:'optional'};
const failed:AuditPolicy={outcome:'FAILED',phase:'COMPLETED',effect:'observation',changes:'optional'};
const waiting:AuditPolicy={outcome:'DEFERRED',phase:'WAITING',effect:'observation',changes:'optional'};
const uncertainFailure:AuditPolicy={...failed,allowedOutcomes:['FAILED','UNKNOWN'],allowedPhases:['COMPLETED','OBSERVED']};
const provisioningFailure:AuditPolicy={...failed,allowedOutcomes:['FAILED','DEFERRED'],allowedPhases:['COMPLETED','WAITING']};
// This explicit registry is the meaning of NEW events, never a heuristic for old rows.
// SUCCEEDED/STARTED confirms only the start/claim fact, not completion of its operation.
export const auditCatalog={
  ITEM_CREATED:local,ITEM_UPDATED:local,PLANNING_APPROVED:{...local,decision:'APPROVED'},
  REPOSITORIES_SELECTED:local,PROJECT_LIFECYCLE_CHANGED:local,STATUS_CHANGED:local,ITEM_ARCHIVED:local,
  ITEM_STATE_POLICY_CHANGED:{...local,decision:'NOT_APPLICABLE'},
  GITLAB_PROVISIONED:{...local,effect:'external'},GITLAB_PROVISIONING_FAILED:provisioningFailure,GITLAB_RETRY_REQUESTED:request,
  REPOSITORY_LINKED:local,REPOSITORY_REQUESTED:request,REPOSITORY_RETRY_REQUESTED:request,
  REPOSITORY_PROVISIONED:{...local,effect:'external'},REPOSITORY_PROVISIONING_FAILED:provisioningFailure,
  GITLAB_PROVISIONING_STARTED:{...response,phase:'STARTED'},REPOSITORY_PROVISIONING_STARTED:{...response,phase:'STARTED'},
  GITLAB_PROVISIONING_UNCONFIRMED:{...response,outcome:'UNKNOWN',phase:'OBSERVED',effect:'external'},
  REPOSITORY_PROVISIONING_UNCONFIRMED:{...response,outcome:'UNKNOWN',phase:'OBSERVED',effect:'external'},
  GITLAB_EFFECT_OBSERVED:{...response,phase:'OBSERVED',effect:'external'},REPOSITORY_EFFECT_OBSERVED:{...response,phase:'OBSERVED',effect:'external'},
  ASSISTANT_MESSAGE_SENT:request,ASSISTANT_TURN_STARTED:{...response,phase:'STARTED'},
  ASSISTANT_TURN_CANCELLED:{...response,outcome:'CANCELLED'},ASSISTANT_TURN_FAILED:failed,ASSISTANT_TURN_EXPIRED:failed,
  ASSISTANT_COMPLETED:response,ASSISTANT_RESPONSE_RECORDED:response,ASSISTANT_COMPLETION_REQUESTED:request,
  PLAN_GENERATION_REQUESTED:request,PLAN_PROPOSED:response,PLAN_REVISED:local,PLAN_APPLIED:local,
  CONVERSATION_LINKED:{...local,decision:'NOT_APPLICABLE'},
  EXECUTION_REQUESTED:request,EXECUTION_REPLANNED:request,EXECUTION_RETRIED:request,
  EXECUTION_CANCELLED:{...response,outcome:'CANCELLED'},EXECUTION_LEASE_EXPIRED:uncertainFailure,EXECUTION_FAILED:uncertainFailure,
  EXECUTION_INPUT_REQUIRED:waiting,EXECUTION_STAGE_COMPLETED:response,
  GATE_APPROVED:{...local,decision:'APPROVED'},G1_READY:{...response,phase:'WAITING',decision:'NOT_EVALUATED'},
  PATCH_VALIDATION_REJECTED:{...response,outcome:'REJECTED',decision:'REJECTED'},CODE_PUBLISHED:{...response,effect:'external'},
  EXECUTION_DECISION_REQUESTED:request,EXECUTION_DISCUSSION_SENT:request,EXECUTION_DECISION_CONFIRMED:local,
  EXECUTION_DISCUSSION_REPLIED:response,
  QUALITY_CHECK_REQUESTED:request,QUALITY_CORRECTION_REQUESTED:request,
  QUALITY_CHECK_FAILED:{...failed,decision:'NOT_EVALUATED'},QUALITY_CHECK_COMPLETED:{...response,decision:'NOT_EVALUATED'},
  MERGE_REQUESTED:request,MERGE_RECONCILIATION_REQUESTED:request,
  MERGE_COMPLETED:{...response,effect:'external'},MERGE_BLOCKED:{...waiting,decision:'NOT_EVALUATED'},MERGE_FAILED:uncertainFailure,
  MERGE_DISCUSSION_SENT:request,MERGE_DISCUSSION_FAILED:failed,MERGE_DISCUSSION_REPLIED:response,
  RELEASE_CREATED:local,RELEASE_COMPOSITION_CHANGED:local,STORY_RELEASE_PLANNED:local,
  WORK_TASKS_COMPLETED:{...response,changes:'not_applicable'},WORK_TASKS_BOUND:local,WORK_TASK_STATUS_CHANGED:local,
  COMMAND_REJECTED:{...failed,outcome:'REJECTED',phase:'REQUESTED',effect:'request'},
  COMMAND_FAILED:failed,INTEGRATION_PROBE_REQUESTED:request,INTEGRATION_PROBE_COMPLETED:response,INTEGRATION_PROBE_FAILED:failed,
  AUDIT_VERIFICATION_RECORDED:{...response,phase:'OBSERVED'},
  AUDIT_REVISION_READ:{...response,phase:'OBSERVED',changes:'not_applicable'},
} satisfies Record<string,AuditPolicy>;
export type AuditAction=keyof typeof auditCatalog;
export function auditPolicy(action:string):AuditPolicy{
  if(!Object.prototype.hasOwnProperty.call(auditCatalog,action))throw new Error(`AUDIT_ACTION_UNKNOWN: ${action}`);
  return auditCatalog[action as AuditAction];
}
