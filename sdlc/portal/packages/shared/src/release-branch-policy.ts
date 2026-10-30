// Offered planning policy. Only an explicit command records a human choice.
// It never changes GitLab protections, code destinations or deployment gates.
export const releaseBranchPolicy={
 version:'release-branches-v1',
 rules:[
  'Preservar a branch padrão como integração de desenvolvimento durante a adoção; ela não representa produção ou a composição de todas as releases.',
  'Desenvolver Histórias por execução e Merge Request com base e destino explícitos; DEV individual continua independente da release.',
  'Planejar uma branch própria da release a partir de um commit fixo, com composição de código verificada antes de QA.',
  'Adotar código existente somente por revisão explícita. Desmarcar uma História não retira código nem resolve dependências.',
  'Isolar composições por identidade de release, sem impor uma única release OPEN por Sistema. Concorrência de ambientes depende do executor.',
  'Alterar conteúdo fechado por outra release OPEN em DEV; correções exigem nova revisão/MR e propagação revisável, sem reset, force push ou redução de proteção.'
 ]
} as const;
export type BranchPlanDecision={id:string;number:number;releaseId:string;releaseRecordVersion:number;compositionRevisionId:string;compositionNumber:number;repositoryId:string;repositoryRecordVersion:number;branchName:string;defaultBranch:string;baseSha:string;scenario:'initial';policyVersion:string;policyDigest:string;actorName:string;createdAt:string};
export type BranchPlanRecording={policy:typeof releaseBranchPolicy;policyDigest:string;contextToken:string|null;blockers:string[];current:BranchPlanDecision|null;currentState:'absent'|'current'|'context_changed'|'retained';latestDecisionId:string|null};
