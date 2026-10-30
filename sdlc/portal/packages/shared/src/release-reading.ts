import {environmentCodes} from './environments.ts';
import type {EnvironmentCode} from './environments.ts';

export type ReleaseEnvironmentCounts=Record<EnvironmentCode,number>&{unconfirmed:number;total:number};

export const releaseCompositionStates=['OPEN','CLOSED','CANCELED'] as const;
export const releaseStateLabels={OPEN:'OPEN · Aberta',CLOSED:'CLOSED · Fechada',CANCELED:'CANCELED · Cancelada'};
export function releaseReading(compositionStatus?:string|null,flowEnvironment?:string|null){
 const known=releaseCompositionStates.includes(compositionStatus as typeof releaseCompositionStates[number]);
 // OPEN starts in DEV by contract. Closed historical records without an
 // environment remain unknown; this projection never attests a deployment.
 const initial=flowEnvironment===undefined&&compositionStatus==='OPEN'?'DEV':flowEnvironment;
 const code=known&&environmentCodes.includes(initial as typeof environmentCodes[number])?initial!:null;
 return {
  version:3 as const,source:'release_composition' as const,
  composition:{state:known?compositionStatus!:'unconfirmed',label:known?releaseStateLabels[compositionStatus as keyof typeof releaseStateLabels]:'Estado da release não confirmado'},
  candidate:{state:'no_evidence' as const,label:'Sem candidata ou artefato confirmado'},
  environment:{state:code?'registered' as const:'unconfirmed' as const,code,label:code?`${code} · ${compositionStatus==='OPEN'?'ambiente inicial':'ambiente registrado'} do fluxo`:'Ambiente do fluxo não confirmado'},
  deployment:{state:'no_evidence' as const,label:'Sem evidência de implantação disponível'},
  validation:{state:'no_evidence' as const,label:'Sem evidência de validação disponível'},
 };
}
export type ReleaseReading=ReturnType<typeof releaseReading>;
