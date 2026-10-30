// Registration is a reference, never evidence of infrastructure or deployment.
export const environmentCodes=['DEV','QA','HML','PRD'] as const;
export type EnvironmentCode=typeof environmentCodes[number];
export function orderEnvironments<T extends {code:string}>(rows:T[]):T[]{
  const rank=(code:string)=>{const index=environmentCodes.indexOf(code as EnvironmentCode);return index<0?environmentCodes.length:index;};
  return [...rows].sort((a,b)=>rank(a.code)-rank(b.code)||a.code.localeCompare(b.code));
}
