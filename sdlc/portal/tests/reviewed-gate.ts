import type {FastifyInstance} from 'fastify';
// Test clients explicitly review the new G1 destination and preserve the same
// reviewed tuple for replay. This never relaxes the production API contract.
const reviews=new WeakMap<object,Map<string,unknown>>();
export async function reviewedGateBody(app:FastifyInstance,path:string,body:unknown,key:string){
 if(!/^\/(api\/)?executions\/[^/]+\/approve$/.test(path)||!body||typeof body!=='object'||'codeDestination' in body)return body;
 const cache=reviews.get(app)??new Map<string,unknown>();reviews.set(app,cache);
 if(cache.has(key))return {...body,codeDestination:cache.get(key)};
 const url=path.startsWith('/api/')?path:'/api'+path,response=await app.inject(url.replace(/approve$/,'code-destination'));
 if(response.statusCode!==200)return body;
 const value=response.json();if(!value.required)return body;
 const codeDestination={contextToken:value.contextToken,destination:value.destination};cache.set(key,codeDestination);return {...body,codeDestination};
}
