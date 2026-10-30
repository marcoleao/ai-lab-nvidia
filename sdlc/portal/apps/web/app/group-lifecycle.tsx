'use client';
import {useState} from 'react';
import LifecyclePanel from './lifecycle-panel';
export default function GroupLifecycle({kind,value,version,enabled,onChange}:{kind:'Projeto'|'Épico';value:string;version:number;enabled:boolean;onChange:(body:{lifecycle:string;expectedVersion:number;comment?:string})=>Promise<unknown>}){
 const [comment,setComment]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const current=['todo','doing','approved'].includes(value)?'active':value==='done'?'completed':value;
 const next=current==='active'?['inactive','completed','cancelled']:['inactive','completed','cancelled'].includes(current)?['active']:[];
 const reasonRequired=(target:string)=>['completed','cancelled'].includes(target)||['completed','cancelled'].includes(current);
 async function change(lifecycle:string){if(!enabled||busy||reasonRequired(lifecycle)&&comment.trim().length<10)return;setBusy(true);setError('');try{await onChange({lifecycle,expectedVersion:version,...(comment.trim()?{comment:comment.trim()}:{})});setComment('');}catch(failure){setError(failure instanceof Error?failure.message:'A alteração não foi confirmada.');}finally{setBusy(false);}}
 return <LifecyclePanel title={`Ciclo do ${kind}`} description={`${kind} organiza o trabalho. INACTIVE é uma pausa; conclusão e cancelamento exigem ausência de filhos abertos.`} value={current} stages={['active','inactive','completed','cancelled']} busy={busy} error={error}>
  <label>Justificativa<textarea value={comment} onChange={event=>setComment(event.target.value)} maxLength={2000} disabled={!enabled||busy}/><small>Obrigatória, com ao menos 10 caracteres, para concluir, cancelar ou reabrir um encerrado.</small></label>
  <div className="actions">{next.map(target=><button key={target} type="button" disabled={!enabled||busy||reasonRequired(target)&&comment.trim().length<10} onClick={()=>void change(target)}>{({active:current==='inactive'?'Reativar · ACTIVE':'Reabrir · ACTIVE',inactive:'Inativar · INACTIVE',completed:'Concluir · COMPLETED',cancelled:'Cancelar · CANCELLED'} as Record<string,string>)[target]}</button>)}</div>
  <p className="hint">A inatividade bloqueia toda a árvore e novas conversas. Operações em andamento precisam terminar ou ser interrompidas antes. Reativar não retoma agentes automaticamente nem altera o Gateway de Especificação de conteúdo preservado.</p>
 </LifecyclePanel>;
}
