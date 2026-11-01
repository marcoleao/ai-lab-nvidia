import type {Metadata} from 'next';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import Portal from '../portal';

export const dynamic='force-static';
export const metadata:Metadata={title:'HELP · Fluxo de execução do SDLC',description:'Percurso implementado, desvios, retomadas e limites do Portal SDLC.'};

export default function HelpPage(){
 const file=[join(process.cwd(),'public/help/fluxo-execucao.html'),join(process.cwd(),'apps/web/public/help/fluxo-execucao.html')].find(existsSync);
 if(!file)throw Error('O documento HTML da ajuda não foi encontrado.');
 const document=readFileSync(file,'utf8');
 function section(name:string){const marker=(position:string)=>name==='CSS'?`/* HELP:${name}:${position} */`:`<!-- HELP:${name}:${position} -->`;const start=marker('START'),end=marker('END'),from=document.indexOf(start),to=document.indexOf(end);if(from<0||to<=from)throw Error(`Seção da ajuda ausente: ${name}`);return document.slice(from+start.length,to).trim();}
 return <><style>{section('CSS')}</style><Portal helpDocument={section('CONTENT')}/></>;
}
