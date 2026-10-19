'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {Lab}=require('../client');
(async()=>{const request=JSON.parse((await fs.readFile(process.argv[2],'utf8')).replace(/^\uFEFF/,''));const started=Date.now();const result=await new Lab(path.resolve(__dirname,'..')).infer(request);console.log(JSON.stringify({...result,duration_ms:Date.now()-started}));})().catch(error=>{console.error(error.message);process.exitCode=1;});
