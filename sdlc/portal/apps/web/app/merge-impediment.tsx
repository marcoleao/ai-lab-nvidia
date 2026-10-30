import {ErrorState} from './experience-ui';

export type MergeBlock = {category:string;message:string};
const resolution:Record<string,string>={
  draft:'Uma pessoa responsável pela revisão deve abrir o Merge Request no GitLab, revisar a proposta e retirar a marcação Draft (rascunho) quando estiver pronta para integração.',
  pipeline:'Consulte os jobs pendentes ou reprovados na aba Pipelines do Merge Request. Confira CODE REVIEW e SECURITY SCAN para o mesmo commit no portal. A conta de merge não configura CI nem executa jobs.',
  conflict:'Encaminhe os conflitos para correção no fluxo de codificação e execute novamente as verificações da revisão corrigida. O agente de merge não altera os arquivos.',
  changed:'Revise a entrega: o commit ou as branches mudaram. As verificações e a confirmação precisam corresponder à revisão atual.',
  discussion:'Trate e resolva as discussões obrigatórias na revisão do Merge Request no GitLab.',
  closed:'Revise o Merge Request encerrado no GitLab e confirme qual entrega deve continuar.',
  access:'Solicite a um administrador a revisão das permissões, da configuração e do escopo da conta de merge.',
  checks:'Consulte no GitLab quais aprovações ou verificações obrigatórias ainda estão pendentes.',
};

export default function MergeImpediment({state,message,blocks=[],url,onDiscuss,id,releaseAvailable=false}:{state:string;message?:string|null;blocks?:MergeBlock[];url?:string|null;onDiscuss?:()=>void;id?:string;releaseAvailable?:boolean}){
  const known=state==='blocked';
  const categories=[...new Set(blocks.map(block=>block.category))];
  const guidance=known?categories.filter(category=>category!=='checks'||!categories.some(value=>['draft','pipeline','discussion'].includes(value))).map(category=>category==='draft'&&releaseAvailable?'Use Liberar para integração neste portal e confirme a revisão. A operação retira Draft sem executar merge ou dispensar verificações.':resolution[category]).filter(Boolean):[];
  const safeUrl=url&&/^https?:\/\//i.test(url)?url:null;
  return <div id={id} data-testid="merge-impediment"><ErrorState>
    <h3>{known?'Merge impedido':'Resultado do merge precisa ser verificado'}</h3>
    {blocks.length?<ul>{blocks.map((block,index)=><li key={`${block.category}:${index}`}>{block.message}</li>)}</ul>:<p>{message||'O resultado da integração ainda não foi confirmado.'}</p>}
    <strong>Como resolver</strong>
    {guidance.length?<ul>{guidance.map(text=><li key={text}>{text}</li>)}</ul>:<p>{known?'Consulte o diagnóstico no GitLab ou converse com a assistente para identificar a pendência.':'Consulte o resultado no GitLab antes de reenviar. Reconciliar a solicitação verifica o efeito já ocorrido e evita repetir a integração.'}</p>}
    {known&&<p>{releaseAvailable?'Após a liberação, confira as condições e confirme o merge separadamente.':'Depois de resolver a pendência, use “Reavaliar e solicitar merge” e confirme a revisão. Reenviar ou conversar não remove os bloqueios do GitLab.'}</p>}
    <div className="actions">{safeUrl&&<a href={safeUrl} target="_blank" rel="noreferrer">Revisar impedimento no GitLab ↗</a>}{onDiscuss&&<button type="button" onClick={onDiscuss}>Conversar sobre impedimento do merge</button>}</div>
  </ErrorState></div>;
}
