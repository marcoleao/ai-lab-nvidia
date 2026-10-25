'use client';

import Link from 'next/link';

export default function PlanningAssistant({systemId, projectId, contextName, withinProject = false}: {systemId: string; projectId?: string; contextName?: string; withinProject?: boolean}) {
  return <section className="panel"><h2>Excecução com Assistente de I.A.</h2><p>A assistente trabalha no contexto de <strong>{contextName}</strong>. Acesse o menu Assistente para conversar, detalhar os requisitos e revisar uma proposta antes da criação.</p><p><Link href={`/assistant?system=${encodeURIComponent(systemId)}${projectId ? `&project=${encodeURIComponent(projectId)}` : '&scope=system'}`}>Abrir Assistente neste contexto →</Link></p>{projectId && <p><Link href={`/projects/${encodeURIComponent(projectId)}?tab=conversations`}>Consultar conversas e referências do Projeto →</Link></p>}{withinProject && <p className="hint">A entrevista será aberta no Projeto deste item. A execução e as decisões da História permanecem em Processo e decisões; revisar o planejamento não inicia código nem aprova G1.</p>}<p className="hint">Você pode criar os itens manualmente. A assistente preserva a conversa, as propostas e o Projeto de destino escolhido.</p></section>;
}
