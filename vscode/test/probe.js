'use strict';
const {Lab}=require('../client');
const path=require('node:path');
new Lab(path.resolve(__dirname,'..')).models().then(models=>console.log(JSON.stringify(models.map(model=>({name:model.name,digest:model.digest,size:model.size}))))).catch(error=>{console.error(error.message);process.exitCode=1;});
