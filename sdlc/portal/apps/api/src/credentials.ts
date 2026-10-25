import {readFileSync} from 'node:fs';

export function runtimeDatabaseUrl(env:NodeJS.ProcessEnv=process.env):string {
  if(!env.DATABASE_URL)throw new Error('DATABASE_URL is required');
  if(!env.DATABASE_PASSWORD_FILE)return env.DATABASE_URL;
  const url=new URL(env.DATABASE_URL);
  if(url.password)throw new Error('Configure only one database password source');
  const password=readFileSync(env.DATABASE_PASSWORD_FILE,'utf8').trim();
  if(!password||/[\r\n]/.test(password))throw new Error('Invalid runtime database credential');
  url.password=password;
  return url.toString();
}

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

export function mergeToken(env:NodeJS.ProcessEnv=process.env):string|undefined {
 if(!env.GITLAB_MERGE_TOKEN_FILE)return undefined;
 try{const token=readFileSync(env.GITLAB_MERGE_TOKEN_FILE,'utf8').trim();if(!token||/[\r\n]/.test(token))throw Error();return token;}
 catch{throw new Error('GitLab merge credential file cannot be read or is invalid');}
}
