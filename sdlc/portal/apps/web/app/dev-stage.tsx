'use client';

import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {StoryDevStep} from '../../../packages/shared/src/story-dev-progress';
import './dev-stage.css';

const ignore=(_value:boolean)=>{};
const StageContext=createContext({guided:false,secondary:false,attention:false,onAttention:ignore});

export function useDevStage(){const {guided,secondary}=useContext(StageContext);return {guided,secondary};}
export function useDevStageAttention(value:boolean){const {onAttention}=useContext(StageContext);useEffect(()=>{onAttention(value);return()=>onAttention(false);},[value,onAttention]);}

export function DevStageActions({children,refresh,description}:{children:ReactNode;refresh:ReactNode;description?:string}){
 const {guided,secondary}=useDevStage();
 const {attention}=useContext(StageContext),otherActions=useRef<HTMLDetailsElement>(null);
 if(!guided)return <div className="actions">{children}{refresh}</div>;
 return <div className="dev-stage-actions">
  {secondary?<details ref={otherActions} className="dev-stage-other-actions"><summary aria-disabled={attention&&otherActions.current?.open||undefined} onClick={event=>{if(attention&&otherActions.current?.open)event.preventDefault();}}>Outras ações</summary>{description&&<p className="hint">{description}</p>}<div className="actions">{children}</div></details>:<><div className="actions">{children}</div>{description&&<p className="hint">{description}</p>}</>}
  <div className="dev-stage-refresh">{refresh}<small>Consulta a situação; não inicia outra execução.</small></div>
 </div>;
}

export default function DevStage({step,title,status,guided,current,secondary,preferred,standalone=false,children}:{step:StoryDevStep;title:string;status:string;guided:boolean;current:boolean;secondary:boolean;preferred:boolean;standalone?:boolean;children:ReactNode}){
 const [open,setOpen]=useState(!guided||preferred),[attention,setAttention]=useState(false);
 const onAttention=useCallback((value:boolean)=>setAttention(value),[]);
 const context=useMemo(()=>({guided,secondary,attention,onAttention}),[guided,secondary,attention,onAttention]);
 useLayoutEffect(()=>{setOpen(!guided||preferred);},[guided]);
 useLayoutEffect(()=>{if(preferred)setOpen(true);},[preferred]);
 const expanded=standalone||!guided||open||attention;
 return <StageContext.Provider value={context}><details className="dev-stage" data-guided={guided} data-current={current} data-standalone={standalone||undefined} data-testid={`dev-stage-${step}`} open={expanded} onToggle={event=>{const node=event.currentTarget;if((standalone||attention)&&!node.open){node.open=true;return;}if(guided&&node.open!==expanded)setOpen(node.open);}}>
  <summary hidden={!guided||standalone} aria-disabled={attention||undefined} onClick={event=>{if(attention||standalone)event.preventDefault();}}><span className="dev-stage-name">{title}</span>{' '}<span className="dev-stage-status">{status}</span><span className="dev-stage-consult">{expanded?'Detalhes da etapa':'Consultar resultado'}</span></summary>
  <div className="dev-stage-content">{guided&&!standalone&&attention&&<p className="hint dev-stage-attention">Este quadro fica aberto enquanto há revisão, solicitação ou situação que exige acompanhamento. Para fechar uma revisão, use Voltar ao acompanhamento.</p>}{children}</div>
 </details></StageContext.Provider>;
}
