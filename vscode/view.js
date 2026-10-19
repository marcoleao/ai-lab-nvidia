'use strict';
const {randomBytes}=require('node:crypto');
function html(source,css,script){
  const nonce=randomBytes(18).toString('base64');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${source}; script-src 'nonce-${nonce}'; img-src ${source}; connect-src 'none'; base-uri 'none'; form-action 'none';"><link rel="stylesheet" href="${css}"><title>SDLC — Conversar com os agentes</title></head><body>
  <header><span class="eyebrow">SEU ASSISTENTE DE PROJETOS</span><h1 id="heading">Sua ideia começa aqui.</h1><p id="intro">Conte o que precisa melhorar no seu negócio. Vamos construir um plano juntos.</p></header>
  <section id="welcome" class="card"><h2>Primeiro, conecte seu ambiente</h2><p>Essa configuração é feita uma vez. Depois, você acompanha suas ideias e planos por aqui.</p><button id="connect" class="primary">Conectar ao meu ambiente</button><details><summary>Ajuda para conectar</summary><p>Use a chave de acesso pessoal fornecida pelo responsável pelo ambiente. Ela será guardada com segurança neste VS Code.</p><p>Se você também administra o ambiente, execute sdlc/bootstrap.ps1 access no terminal para copiar sua chave. Não a envie na conversa.</p></details></section>
  <p id="notice" role="status" aria-live="polite"></p>
  <section id="workspace" hidden>
  <details id="ideas"><summary>Minhas ideias e conversas</summary><label for="project">Ideia</label><select id="project"></select><button id="new-project">Começar outra ideia</button><label for="conversation">Conversa desta ideia</label><select id="conversation"></select><button id="new-conversation">Começar outra conversa</button></details>
  <ol class="steps" aria-label="Etapas do planejamento"><li id="step-1">1. Sua ideia</li><li id="step-2">2. Seu plano</li><li id="step-3">3. Sua decisão</li></ol>
  <section class="card next-step" aria-labelledby="phase-title"><span id="phase-label" class="eyebrow"></span><h2 id="phase-title"></h2><p id="phase-description"></p><div class="actions"><button id="start-idea" class="primary" hidden>Começar minha ideia</button><button id="start-conversation" class="primary" hidden>Continuar esta ideia</button><button id="propose" class="primary" hidden>Preparar meu plano</button><button id="publish-proposal" class="primary" hidden>Enviar para revisão</button><button id="portal" class="primary" hidden>Revisar e decidir</button></div></section>
  <details id="understanding" hidden><summary>O que entendemos até aqui</summary><p id="summary"></p></details>
  <details id="earlier" hidden><summary id="earlier-label">Ver conversa anterior</summary><div id="earlier-messages"></div></details>
  <div id="messages" aria-label="Histórico da entrevista"></div>
  <form id="send-form"><label id="message-label" for="message">Conte sua ideia</label><textarea id="message" maxlength="2000" rows="4" placeholder="Hoje faço… e gostaria de melhorar…" required></textarea><small id="message-help">Não precisa conhecer tecnologia. Explique o problema do seu jeito.</small><div class="actions"><button id="send" type="submit">Enviar</button><button id="retry" type="button" hidden>Tentar novamente</button><button id="cancel" type="button" hidden>Interromper espera</button></div></form>
  <p id="sent-note" hidden>Seu plano foi enviado. Faça a revisão e eventuais alterações na página de decisão.</p>
  <details class="settings"><summary>Configuração e detalhes técnicos</summary><p id="model"></p><p id="technical-notice"></p><div class="toolbar"><button id="change-access">Alterar conexão</button><button id="refresh">Atualizar informações</button></div></details>
  </section><footer>Você mantém o controle das decisões. Nesta versão, planejamos e encaminhamos para revisão; a construção automática do software ainda não está disponível. Não envie senhas ou dados pessoais reais.</footer><script nonce="${nonce}" src="${script}"></script></body></html>`;
}
module.exports={html};
