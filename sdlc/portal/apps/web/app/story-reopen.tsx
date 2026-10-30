'use client';
import {useState} from 'react';
export default function StoryReopen({version,enabled,onChange}:{version:number;enabled:boolean;onChange:(body:{expectedVersion:number;comment:string})=>Promise<unknown>}){
 const [comment,setComment]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section aria-label="Reabrir História"><h3>Reabrir História cancelada</h3><p>Retorna à especificação e exige novo Gateway de Especificação. As Tarefas e os artefatos anteriores permanecem preservados; nenhuma Tarefa será reaberta automaticamente.</p><label>Justificativa<textarea value={comment} onChange={event=>setComment(event.target.value)} minLength={10} maxLength={2000} disabled={!enabled||busy}/></label>{error&&<p role="alert" className="alert">{error}</p>}<button type="button" disabled={!enabled||busy||comment.trim().length<10} onClick={()=>{setBusy(true);setError('');void onChange({expectedVersion:version,comment}).then(()=>setComment('')).catch(failure=>setError(failure instanceof Error?failure.message:'A reabertura não foi confirmada.')).finally(()=>setBusy(false));}}>Reabrir em SPECIFICATION</button></section>;
}
