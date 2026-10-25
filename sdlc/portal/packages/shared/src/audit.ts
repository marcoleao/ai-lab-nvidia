import {z} from 'zod';

export const auditOutcomes=['ACCEPTED','SUCCEEDED','REJECTED','FAILED','CANCELLED','NO_CHANGE','DEFERRED','UNKNOWN'] as const;
export const auditPhases=['REQUESTED','STARTED','COMPLETED','WAITING','OBSERVED'] as const;
export const auditDecisions=['APPROVED','REJECTED','NOT_EVALUATED','NOT_APPLICABLE'] as const;
export type AuditOutcome=typeof auditOutcomes[number];
export type AuditPhase=typeof auditPhases[number];
export type AuditDecision=typeof auditDecisions[number];
const label=z.string().max(240);
export const auditActorSchema=z.object({id:label.min(1),name:label.min(1),type:z.enum(['human','agent','system','service','anonymous','unknown']),authentication:z.enum(['declared_demo','service','verified','unauthenticated','unknown'])}).strict();
export const auditTargetSchema=z.object({type:label.min(1),id:label.min(1),key:label.optional(),name:label.optional(),version:z.number().int().nonnegative().optional()}).strict();
export const auditValueSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('value'),value:z.json()}).strict(),
  z.object({kind:z.enum(['absent','not_observed','restricted'])}).strict(),
]);
export const auditChangeSchema=z.object({field:label.min(1),before:auditValueSchema,after:auditValueSchema}).strict();
export const auditEvidenceSchema=z.object({type:label.min(1),id:label.optional(),url:z.string().max(1000).optional(),revision:label.optional(),source:label.optional(),observedAt:z.iso.datetime().optional()}).strict();
export const auditEnvelopeSchema=z.object({
  schemaVersion:z.literal(2),auditEpochId:label.min(1),target:auditTargetSchema,targets:z.array(auditTargetSchema).max(5000),
  initiator:auditActorSchema,executor:auditActorSchema,onBehalfOf:auditActorSchema.optional(),
  changes:z.array(auditChangeSchema).max(5000),changeCoverage:z.enum(['captured','not_applicable','not_captured']),
  evidence:z.array(auditEvidenceSchema).max(100),reasonCode:label.optional(),
  source:z.object({component:label.min(1),channel:label.min(1)}).strict(),
  coverage:z.object({version:z.literal(2)}).strict(),
}).strict();
export type AuditActor=z.infer<typeof auditActorSchema>;
export type AuditTarget=z.infer<typeof auditTargetSchema>;
export type AuditChange=z.infer<typeof auditChangeSchema>;
export type AuditEvidence=z.infer<typeof auditEvidenceSchema>;
export type AuditEnvelope=z.infer<typeof auditEnvelopeSchema>;
