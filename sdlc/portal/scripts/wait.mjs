const endpoint=process.argv[2];
if(!endpoint)throw new Error('Endpoint required');
for(let attempt=0;attempt<60;attempt++){
  try{if((await fetch(endpoint,{signal:AbortSignal.timeout(1000)})).ok)process.exit(0);}catch{}
  await new Promise(resolve=>setTimeout(resolve,1000));
}
throw new Error('Local test service did not become ready');
