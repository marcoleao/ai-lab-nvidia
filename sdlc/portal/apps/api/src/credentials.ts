import {readFileSync} from 'node:fs';

export function gitlabToken(env:NodeJS.ProcessEnv=process.env):string|undefined {
  if(env.GITLAB_TOKEN_FILE&&env.GITLAB_TOKEN)throw new Error('Configure only one GitLab credential source');
  if(!env.GITLAB_TOKEN_FILE)return env.GITLAB_TOKEN?.trim()||undefined;
  let value:string;
  try{value=readFileSync(env.GITLAB_TOKEN_FILE,'utf8').trim();}
  catch{throw new Error('GitLab credential file cannot be read');}
  if(!value||value.includes('\n')||value.includes('\r'))throw new Error('Invalid GitLab credential file');
  return value;
}

export function llmToken(env:NodeJS.ProcessEnv=process.env):string|undefined {
  if(!env.LLM_TOKEN_FILE)return undefined;
  try{const token=readFileSync(env.LLM_TOKEN_FILE,'utf8').trim();if(!token||/[\r\n]/.test(token))throw Error();return token;}
  catch{throw new Error('Local LLM credential file cannot be read or is invalid');}
}
