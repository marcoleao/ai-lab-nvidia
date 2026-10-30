import {z} from 'zod';
export const mergeClosureObservationSchema=z.object({projectId:z.number().int().positive(),iid:z.number().int().positive(),sourceBranch:z.string().min(1).max(255),targetBranch:z.string().min(1).max(255),sourceSha:z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),state:z.literal('closed'),mergeCommitSha:z.null(),squashCommitSha:z.null(),mergedAt:z.null(),mergeScheduled:z.literal(false)}).strict();
export const mergeOpenClosureObservationSchema=mergeClosureObservationSchema.extend({state:z.literal('opened'),updatedAt:z.string().datetime({offset:true})}).strict();
