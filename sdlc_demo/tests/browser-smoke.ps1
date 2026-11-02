param(
    [string]$BrowserPath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    [string]$Filter = ''
)

$ErrorActionPreference = 'Stop'
$testRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$demoRoot = [IO.Path]::GetFullPath((Join-Path $testRoot '..'))
$entryPath = Join-Path $demoRoot 'index.html'
$artifactRoot = Join-Path $testRoot 'artifacts'
$profilePath = Join-Path $testRoot ('.browser-profile-' + [guid]::NewGuid().ToString('N'))
$results = [Collections.Generic.List[object]]::new()
$browserErrors = [Collections.Generic.List[object]]::new()
$networkRequests = [Collections.Generic.List[object]]::new()
$socket = $null
$browserProcess = $null
$script:requestId = 0

function Read-CdpMessage {
    $buffer = [byte[]]::new(65536)
    $stream = [IO.MemoryStream]::new()
    $timeout = [Threading.CancellationTokenSource]::new(40000)
    try {
        do {
            $segment = [ArraySegment[byte]]::new($buffer)
            $received = $script:socket.ReceiveAsync($segment, $timeout.Token).GetAwaiter().GetResult()
            if ($received.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'Browser CDP connection closed.' }
            $stream.Write($buffer, 0, $received.Count)
        } while (-not $received.EndOfMessage)
        [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
    } finally {
        $timeout.Dispose()
        $stream.Dispose()
    }
}

function Send-Cdp {
    param([string]$Method, [hashtable]$Parameters = @{})
    $script:requestId++
    $id = $script:requestId
    $request = @{id = $id; method = $Method; params = $Parameters} | ConvertTo-Json -Depth 30 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($request)
    $timeout = [Threading.CancellationTokenSource]::new(40000)
    try {
        [void]$script:socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, $timeout.Token).GetAwaiter().GetResult()
        do {
            $message = Read-CdpMessage
            if ($message.method -eq 'Runtime.exceptionThrown') {
                $browserErrors.Add(@{kind = 'exception'; detail = $message.params.exceptionDetails})
            } elseif ($message.method -eq 'Runtime.consoleAPICalled' -and $message.params.type -eq 'error') {
                $browserErrors.Add(@{kind = 'console'; detail = $message.params.args})
            } elseif ($message.method -eq 'Log.entryAdded' -and $message.params.entry.level -eq 'error') {
                $browserErrors.Add(@{kind = 'log'; detail = $message.params.entry.text})
            } elseif ($message.method -eq 'Network.requestWillBeSent') {
                $networkRequests.Add(@{url = $message.params.request.url; method = $message.params.request.method; type = $message.params.type})
            }
        } while ($message.id -ne $id)
        if ($message.error) { throw ($message.error | ConvertTo-Json -Compress) }
        return $message.result
    } finally { $timeout.Dispose() }
}

function Invoke-Js {
    param([string]$Expression)
    $response = Send-Cdp 'Runtime.evaluate' @{expression = $Expression; awaitPromise = $true; returnByValue = $true; userGesture = $true}
    if ($response.exceptionDetails) {
        throw ($response.exceptionDetails | ConvertTo-Json -Depth 8 -Compress)
    }
    return $response.result.value
}

function Test-Browser {
    param([string]$Name, [string]$Expression)
    if ($Filter -and $Name -notmatch $Filter) { return }
    try {
        $detail = Invoke-Js $Expression
        if ($detail -eq $false -or $null -eq $detail) { throw 'Browser assertion returned false or no result.' }
        $results.Add(@{name = $Name; passed = $true; detail = $detail})
        Write-Output ('PASS ' + $Name)
    } catch {
        $results.Add(@{name = $Name; passed = $false; error = $_.Exception.Message})
        Write-Output ('FAIL ' + $Name + ': ' + $_.Exception.Message)
    }
}

function Save-Screenshot {
    param([string]$Name, [switch]$ForFocal)
    if ($Filter -and -not $ForFocal) { return }
    $capture = Send-Cdp 'Page.captureScreenshot' @{format = 'png'; captureBeyondViewport = $false}
    [IO.File]::WriteAllBytes((Join-Path $artifactRoot $Name), [Convert]::FromBase64String($capture.data))
}

function Get-CdpTargets {
    param([string]$Url)
    $request = [Net.HttpWebRequest]::Create($Url)
    $request.Proxy = $null
    $request.Timeout = 500
    $request.ReadWriteTimeout = 500
    $response = $request.GetResponse()
    try {
        $reader = [IO.StreamReader]::new($response.GetResponseStream())
        try { $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    } finally { $response.Dispose() }
}

try {
    if (-not (Test-Path -LiteralPath $BrowserPath -PathType Leaf)) { throw ('Edge not found: ' + $BrowserPath) }
    if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) { throw 'Demo index.html is missing.' }
    New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $profilePath | Out-Null
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    $browserArguments = @('--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--disable-component-update', '--disable-sync', '--remote-debugging-address=127.0.0.1', ('--remote-debugging-port=' + $port), ('--user-data-dir="' + $profilePath + '"'), 'about:blank')
    Write-Output ('Starting isolated Edge on loopback port ' + $port)
    $browserProcess = Start-Process -FilePath $BrowserPath -ArgumentList $browserArguments -PassThru -WindowStyle Hidden
    $endpoint = 'http://127.0.0.1:' + $port
    $targets = $null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $targets = Get-CdpTargets ($endpoint + '/json/list')
            if ($targets | Where-Object type -eq 'page') { break }
        } catch { }
        Start-Sleep -Milliseconds 100
    }
    $target = @($targets | Where-Object type -eq 'page')[0]
    if (-not $target.webSocketDebuggerUrl) { throw 'Edge remote debugging did not become ready.' }
    Write-Output 'Edge CDP connected.'
    $script:socket = [Net.WebSockets.ClientWebSocket]::new()
    [void]$script:socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    Send-Cdp 'Runtime.enable' | Out-Null
    Send-Cdp 'Log.enable' | Out-Null
    Send-Cdp 'Network.enable' | Out-Null
    Send-Cdp 'Page.enable' | Out-Null
    Send-Cdp 'Emulation.setDeviceMetricsOverride' @{width = 1440; height = 1000; deviceScaleFactor = 1; mobile = $false} | Out-Null
    $entryUri = [Uri]::new($entryPath).AbsoluteUri
    Send-Cdp 'Page.navigate' @{url = $entryUri} | Out-Null
    $ready = Invoke-Js @'
new Promise((resolve,reject)=>{let remaining=100;const poll=()=>{if(window.DemoApp&&document.querySelector('main h1'))return resolve(true);if(--remaining===0)return reject(Error('DemoApp did not initialize'));setTimeout(poll,50)};poll()})
'@
    if (-not $ready) { throw 'DemoApp did not initialize.' }

    Test-Browser 'file:// entry and isolated local dataset' @'
(()=>{const data=DemoApp.getData();if(location.protocol!=='file:')throw Error('Expected direct file access');if(!data||typeof data!=='object')throw Error('Missing data');return {protocol:location.protocol,collections:Object.keys(data),title:document.title}})()
'@
    Test-Browser 'global navigation and initial collapsed filters' @'
(()=>{const labels=[...document.querySelectorAll('aside nav a')].map(a=>a.textContent.trim());for(const label of ['Visão geral','Assistente','Sistemas','Releases','Integrações'])if(!labels.includes(label))throw Error('Missing navigation '+label);if([...document.querySelectorAll('details')].some(d=>d.open&&/Filtr/i.test(d.textContent)))throw Error('Filters should start collapsed');return labels})()
'@
    Save-Screenshot 'desktop-dashboard.png'

    Test-Browser 'ten navigable dashboard sections' @'
(async()=>{const nav=document.querySelector('[aria-label="Seções dos indicadores"]');if(!nav)throw Error('Dashboard navigation missing');const links=[...nav.querySelectorAll('a')];if(links.length!==10)throw Error('Expected ten dashboard sections, got '+links.length);const visited=[];for(const link of links){DemoApp.navigate(link.getAttribute('href'));await new Promise(r=>setTimeout(r,30));if(!document.querySelector('main h2'))throw Error('Section content missing');visited.push(link.textContent.trim())}return visited})()
'@

    Test-Browser 'consultation views render Assistant contexts, integrations and HELP route' @'
(async()=>{
  const visit=async hash=>{DemoApp.navigate(hash);await new Promise(r=>setTimeout(r,40));if(!document.querySelector('main h1'))throw Error('View failed '+hash)};
  const contexts=['aurora','aurora-catalogo','aurora-busca'],topics=['business','proposal','history'];let views=0;
  for(const context of contexts)for(const topic of topics){
    await visit('#/assistant?context='+context+'&topic='+topic);
    const current=DemoApp.getData().items.find(i=>i.id===context),panel=document.querySelector('.demo-assistant-context,.analyst-context');
    if(!panel||!panel.textContent.includes(current.name))throw Error('Assistant context missing '+context);
    const tabs=document.querySelector('[aria-label="Assuntos do Assistente"]');
    if(!tabs||tabs.querySelectorAll('a').length!==3)throw Error('Assistant topics missing');
    for(const expected of ['Conversa','Proposta','Histórico'])if(!tabs.textContent.includes(expected))throw Error('Assistant topic label missing '+expected);
    if(!tabs.querySelector('[aria-current="page"]').getAttribute('href').includes('topic='+topic))throw Error('Assistant topic not active');
    if(!document.querySelectorAll('main .panel').length)throw Error('Assistant content missing');views++;
  }
  await visit('#/integrations');if(document.querySelectorAll('main .check-list li').length!==6)throw Error('Integration statuses missing');views++;
  await visit('#/help');const route=document.querySelector('.demo-help-route');if(!route)throw Error('HELP route missing');
  const links=[...route.querySelectorAll('a')],data=DemoApp.getData();
  for(const item of data.items.filter(i=>['aurora','aurora-catalogo','aurora-descoberta','aurora-busca'].includes(i.id))){
    const link=links.find(a=>a.getAttribute('href').split('?')[0].endsWith('/'+item.id));
    if(!link||link.textContent.trim()!==item.name)throw Error('HELP hierarchy label missing '+item.id);
  }
  const destinations=links.map(a=>a.getAttribute('href'));
  for(const hash of destinations){await visit(hash);if(/Página não encontrada/.test(document.querySelector('main h1').textContent))throw Error('HELP link broken '+hash)}
  return {assistantContexts:contexts.length,assistantTopics:topics.length,consultationViews:views+1,helpLinks:destinations.length};
})()
'@

    Test-Browser 'conversation journey Assistant sessions, proposals, history and pagination' @'
(async()=>{
  const visit=async hash=>{DemoApp.navigate(hash);await new Promise(r=>setTimeout(r,55));if(!document.querySelector('main h1'))throw Error('Conversation view failed '+hash)};
  const data=DemoApp.getData(),before=JSON.stringify(data),messagesById=new Map(data.conversations.map(message=>[message.id,message]));
  if(data.schemaVersion!==2)throw Error('Conversation schema version missing');
  await visit('#/assistant?context=aurora&topic=business&session=aurora-origem');
  if(document.querySelector('.demo-banner'))throw Error('Removed demonstration banner returned');
  const cards=[...document.querySelectorAll('.demo-conversation-message[data-message-id][data-speaker]')];
  if(!cards.length)throw Error('Origin conversation has no message cards');
  for(const speaker of ['user','assistant'])if(!cards.some(card=>card.dataset.speaker===speaker))throw Error('Missing differentiated '+speaker+' message');
  for(const card of cards){const message=messagesById.get(card.dataset.messageId);if(!message||message.itemId!=='aurora'||message.sessionId!=='aurora-origem')throw Error('Message escaped its owning session');if(card.dataset.speaker!==message.role)throw Error('Speaker differs from recorded author role');}
  const session=data.conversationSessions.find(session=>session.id==='aurora-catalogo-planejamento');
  if(!session)throw Error('Planning session missing');
  const messages=data.conversations.filter(message=>message.sessionId===session.id),pages=Math.ceil(messages.length/20),seen=new Set();
  if(pages<2)throw Error('Planning conversation must exercise older pages');
  for(let page=1;page<=pages;page++){
    await visit('#/assistant?context=aurora-catalogo&topic=business&session='+session.id+'&assistantPage='+page);
    const visible=[...document.querySelectorAll('.demo-conversation-message[data-message-id]')];
    if(visible.length>20||!visible.length)throw Error('Conversation page size invalid');
    for(const card of visible){if(seen.has(card.dataset.messageId))throw Error('Message duplicated across pages');seen.add(card.dataset.messageId);}
  }
  if(seen.size!==messages.length)throw Error('Conversation pagination truncated messages');
  await visit('#/assistant?context=aurora-catalogo&topic=proposal&session='+session.id);
  const proposal=document.querySelector('.demo-conversation-proposal,.demo-proposal-summary');
  if(!proposal)throw Error('Structured proposal missing');
  const proposedIds=data.conversations.filter(message=>message.sessionId===session.id&&message.proposal).flatMap(message=>message.proposal.items.map(item=>item.id));
  if(!proposedIds.length)throw Error('Planning session must explain created items');
  for(const id of proposedIds){const item=data.items.find(item=>item.id===id);const link=[...document.querySelectorAll('main a[href]')].find(link=>link.getAttribute('href').split('?')[0].endsWith('/'+id));if(!link||!link.textContent.includes(item.name))throw Error('Proposal has no navigable created item '+id);}
  await visit('#/assistant?context=aurora-catalogo&topic=history&session='+session.id);
  if(![...document.querySelectorAll('main a[href]')].some(link=>new URLSearchParams(link.getAttribute('href').split('?')[1]||'').get('session')===session.id))throw Error('History does not retain a navigable session');
  for(const [legacy,canonical] of [['specification','proposal'],['gates','history']]){
    await visit('#/assistant?context=aurora-catalogo&topic='+legacy+'&session='+session.id);
    const active=document.querySelector('[aria-label="Assuntos do Assistente"] [aria-current="page"]');
    if(!active||new URLSearchParams(active.getAttribute('href').split('?')[1]).get('topic')!==canonical)throw Error('Legacy Assistant topic failed '+legacy);
  }
  if(JSON.stringify(DemoApp.getData())!==before)throw Error('Reading a conversation changed source data or gates');
  await visit('#/assistant?context=aurora-catalogo&topic=business&session='+session.id);
  return {originCards:cards.length,planningPages:pages,totalMessages:seen.size,proposalLinks:proposedIds.length,legacyAliases:2};
})()
'@
    if (-not $Filter -or 'conversation journey Assistant sessions, proposals, history and pagination' -match $Filter) { Save-Screenshot 'assistant-desktop.png' -ForFocal }

    Test-Browser 'conversation journey entity history search, session ownership and read-only context' @'
(async()=>{
  const visit=async hash=>{DemoApp.navigate(hash);await new Promise(r=>setTimeout(r,55));if(!document.querySelector('main h1'))throw Error('Conversation view failed '+hash)};
  const data=DemoApp.getData(),before=JSON.stringify(data),byId=new Map(data.conversations.map(message=>[message.id,message]));
  await visit('#/stories/aurora-busca?tab=conversations&conversations.scope=self&conversations.session=aurora-busca-especificacao&conversationPage=1');
  const selected=[...document.querySelectorAll('.demo-conversation-message[data-message-id]')];
  if(!selected.length)throw Error('Story session has no messages');
  for(const node of selected){const message=byId.get(node.dataset.messageId);if(!message||message.itemId!=='aurora-busca'||message.sessionId!=='aurora-busca-especificacao')throw Error('Wrong session source in Story history');}
  const planned=data.conversations.filter(message=>message.sessionId==='aurora-catalogo-planejamento').slice().sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  const old=planned[Math.min(20,planned.length-1)],query=old.text.slice(0,70),session=data.conversationSessions.find(session=>session.id===old.sessionId);
  await visit('#/projects/aurora-catalogo?tab=conversations&conversations.scope=self&conversations.q='+encodeURIComponent(query));
  const main=document.querySelector('main');
  if(!main.textContent.includes(session.title)&&!main.textContent.includes(query))throw Error('Old conversation could not be found across message pages');
  if(/Nenhum resultado|0 resultados/.test(main.textContent)&&!main.querySelector('.demo-conversation-message'))throw Error('Old message search produced an empty collection');
  const sourceFilter=document.querySelector('select[name="conversations.source"]');
  if(!sourceFilter)throw Error('Conversation source filter missing');
  await visit('#/projects/aurora-catalogo?tab=conversations&conversations.scope=self&conversations.q=mensagem-inexistente-xyz-demo');
  if(!/Nenhum|nenhuma|0 resultados|0 conversas/i.test(document.querySelector('main').textContent))throw Error('Empty conversation search not explained');
  await visit('#/assistant?context=aurora&topic=business&session=aurora-busca-aceite');
  for(const node of document.querySelectorAll('.demo-conversation-message[data-message-id]'))if(byId.get(node.dataset.messageId)?.itemId!=='aurora')throw Error('Foreign session leaked into the selected System');
  await visit('#/assistant?context=contexto-inexistente&topic=business&session=sessao-inexistente');
  if(!document.querySelector('main h1')||/undefined|null/.test(document.querySelector('main h1').textContent))throw Error('Invalid context fallback failed');
  if(JSON.stringify(DemoApp.getData())!==before)throw Error('Conversation search or fallback changed source data or gates');
  await visit('#/stories/aurora-busca?tab=conversations&conversations.scope=self&conversations.session=aurora-busca-aceite');
  return {storyMessages:selected.length,oldMessage:old.id,sourceFilter:true,emptySearch:true,foreignSessionRejected:true};
})()
'@
    if (-not $Filter -or 'conversation journey entity history search, session ownership and read-only context' -match $Filter) { Save-Screenshot 'historico.png' -ForFocal }

    Test-Browser 'entity subjects render all System and Story tabs and execution steps' @'
(async()=>{
  const visit=async hash=>{DemoApp.navigate(hash);await new Promise(r=>setTimeout(r,35));if(!document.querySelector('main h1')||!document.querySelector('main h2'))throw Error('Subject failed '+hash)};
  const systemTabs=['overview','planning','conversations','components','environments','activity','manage'];
  const storyTabs=['tasks','planning','specification','conversations','activity','manage'];let subjects=0;
  for(const [path,tabs] of [['/systems/aurora',systemTabs],['/stories/aurora-busca',storyTabs]]){
    for(const tab of tabs){
      await visit('#'+path+'?tab='+tab);
      const active=document.querySelector('.context-tabs [aria-current="page"]');
      if(!active||new URLSearchParams(active.getAttribute('href').split('?')[1]).get('tab')!==tab)throw Error('Wrong active subject '+tab);
      if(tab==='environments'&&document.querySelectorAll('.environment-grid article').length!==4)throw Error('Four System environments missing');
      if(tab==='components'&&!/demonstracao\/aurora/.test(document.querySelector('main').textContent))throw Error('System repository reference missing');
      subjects++;
    }
  }
  await visit('#/stories/aurora-busca?tab=planning');const steps=[...document.querySelectorAll('.demo-stage-grid a')].map(a=>a.getAttribute('href'));
  if(steps.length!==9)throw Error('Execution step links missing');
  for(const hash of steps){await visit(hash);const title=new URLSearchParams(hash.split('?')[1]).get('step');if(document.querySelector('main h2').textContent!==title)throw Error('Execution step content mismatched '+title)}
  return {systemTabs:systemTabs.length,storyTabs:storyTabs.length,subjects,executionSteps:steps.length};
})()
'@

    Test-Browser 'query state retains tabs, checkbox drafts, normalized page and local audit dates' @'
(async()=>{
  const visit=async hash=>{DemoApp.navigate(hash);await new Promise(r=>setTimeout(r,45))};
  const tab=name=>[...document.querySelectorAll('.context-tabs a')].find(a=>new URLSearchParams(a.getAttribute('href').split('?')[1]).get('tab')===name);
  await visit('#/stories/aurora-busca?tab=tasks&q='+encodeURIComponent('Codificação')+'&sort=name&direction=asc&page=1');
  tab('specification').click();await new Promise(r=>setTimeout(r,40));tab('tasks').click();await new Promise(r=>setTimeout(r,40));
  let params=new URLSearchParams(location.hash.split('?')[1]);
  if(params.get('q')!=='Codificação'||params.get('sort')!=='name'||params.get('direction')!=='asc'||params.get('page')!=='1')throw Error('Tab switch lost applied collection query');
  if(document.querySelectorAll('main tbody tr').length!==1)throw Error('Tab switch changed filtered Tasks');
  await visit('#/systems');
  const checkbox=document.querySelector('input[name="includeInactive"]');checkbox.closest('details').open=true;checkbox.checked=true;checkbox.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('[data-sort="name"]').click();await new Promise(r=>setTimeout(r,60));
  if(!document.querySelector('input[name="includeInactive"]').checked)throw Error('Sort erased checkbox draft');
  if(new URLSearchParams(location.hash.split('?')[1]).has('includeInactive'))throw Error('Sort silently applied checkbox draft');
  if(!document.querySelector('details[data-filter-key]').open)throw Error('Sort collapsed explicitly opened filters');
  await visit('#/stories/aurora-busca?tab=activity&auditPage=999');
  params=new URLSearchParams(location.hash.split('?')[1]);
  const effective=document.querySelector('[aria-label="Paginação de auditoria"] [aria-current="page"]').textContent.trim();
  if(params.get('auditPage')==='999'||params.get('auditPage')!==effective)throw Error('Out of range audit page URL was not normalized');
  const data=DemoApp.getData(),fixture={id:'timezone-fixture',itemId:'aurora-busca',at:'2026-11-02T01:00:00Z',actor:'Teste isolado',action:'TIMEZONE_FIXTURE',description:'Somente fixture de teste no navegador isolado',outcome:'SUCCEEDED',phase:'COMPLETED',decision:'NOT_APPLICABLE'};
  data.events.push(fixture);
  try{
    await visit('#/stories/aurora-busca?tab=activity&q=TIMEZONE_FIXTURE&from=2026-11-01&to=2026-11-01');
    if(!/TIMEZONE_FIXTURE/.test(document.querySelector('main tbody').textContent))throw Error('Local November 1 event excluded');
    await visit('#/stories/aurora-busca?tab=activity&q=TIMEZONE_FIXTURE&from=2026-11-02&to=2026-11-02');
    if(/TIMEZONE_FIXTURE/.test(document.querySelector('main tbody').textContent))throw Error('Local November 1 event included on November 2');
  }finally{const index=data.events.indexOf(fixture);if(index>=0)data.events.splice(index,1)}
  return {tabQueryPreserved:true,checkboxDraftPreserved:true,effectiveAuditPage:Number(effective),localTimezone:'America/Sao_Paulo',fixtureRemoved:!data.events.includes(fixture)};
})()
'@

    Test-Browser 'all item and release details resolve with valid internal links' @'
(async()=>{
  const data=DemoApp.getData(),routes={system:'systems',project:'projects',epic:'epics',story:'stories',task:'tasks'};
  const destinations=data.items.map(i=>({hash:'#/'+routes[i.kind]+'/'+i.id,name:i.name})).concat(data.releases.map(r=>({hash:'#/releases/'+r.id,name:r.name})));
  const itemTargets=new Set(data.items.map(i=>'/'+routes[i.kind]+'/'+i.id));
  const releaseTargets=new Set(data.releases.map(r=>'/releases/'+r.id));let checkedLinks=0;
  for(const destination of destinations){
    DemoApp.navigate(destination.hash);await new Promise(r=>setTimeout(r,60));
    const heading=document.querySelector('main h1');
    if(!heading||heading.textContent.trim()!==destination.name)throw Error('Detail did not resolve: '+destination.hash);
    for(const link of document.querySelectorAll('a[href^="#/"]')){
      const path=link.getAttribute('href').slice(1).split('?')[0];
      if(!['/','/systems','/releases','/assistant','/integrations','/help'].includes(path)&&!itemTargets.has(path)&&!releaseTargets.has(path))throw Error('Broken internal link '+path+' in '+destination.hash);
      checkedLinks++;
    }
  }
  return {items:data.items.length,releases:data.releases.length,resolved:destinations.length,checkedLinks};
})()
'@

    Test-Browser 'unconfirmed production and rejected historical candidate stay distinct' @'
(async()=>{
  const visit=async hash=>{DemoApp.navigate(hash);await new Promise(r=>setTimeout(r,30))};
  await visit('#/releases/orion-resultado-incerto');
  if(/Entrega concluída em PROD/i.test(document.querySelector('main').textContent))throw Error('Unknown result claimed production completion');
  if(!/Produção ainda não confirmada/i.test(document.querySelector('main').textContent))throw Error('Unknown result explanation missing');
  const data=DemoApp.getData(),unknown=data.releases.find(r=>r.id==='orion-resultado-incerto');
  if(unknown.storyIds.some(id=>data.items.find(i=>i.id===id).status==='completed'))throw Error('Unconfirmed production completed Stories');
  await visit('#/releases/aurora-qa-reprovada');
  if(!/1\s*\/\s*2/.test(document.querySelector('main').textContent))throw Error('Fixed and current revisions are not distinguished');
  if(!/Outra revisão/.test(document.querySelector('main').textContent))throw Error('Current evidence was assigned to historical candidate');
  const button=document.querySelector('[data-action="promote"]');if(button&&!button.disabled)throw Error('Rejected candidate promotion is enabled');
  return {unknownStoryOpen:true,fixedRevision:1,currentRevision:2};
})()
'@

    Test-Browser 'archived hierarchy can be consulted down to a Task' @'
(async()=>{
  const paths=['#/systems/legado','#/projects/legado-migracao','#/epics/legado-importacao','#/stories/legado-importar'];
  for(let index=0;index<paths.length;index++){
    DemoApp.navigate(paths[index]);await new Promise(r=>setTimeout(r,25));
    if(!/ARCHIVED/.test(document.querySelector('main').textContent))throw Error('Archive marker missing at '+paths[index]);
    const next=index+1<paths.length?paths[index+1]:'#/tasks/';
    const link=[...document.querySelectorAll('main a')].find(a=>a.getAttribute('href').startsWith(next));
    if(!link)throw Error('Archived child link missing at '+paths[index]);
    if(index===paths.length-1){link.click();await new Promise(r=>setTimeout(r,30));if(!location.hash.startsWith('#/tasks/'))throw Error('Archived Task navigation failed');if(!/ARCHIVED/.test(document.querySelector('main').textContent))throw Error('Archived Task marker missing')}
  }
  return {levels:5,task:location.hash};
})()
'@

    Test-Browser 'filtered list return and sorting retain URL and keyboard focus' @'
(async()=>{
  const origin='#/systems?q=Aurora&sort=name&direction=asc&page=1';
  DemoApp.navigate(origin);await new Promise(r=>setTimeout(r,30));
  const first=document.querySelector('main .item-link');if(!first)throw Error('Filtered System result missing');
  first.click();await new Promise(r=>setTimeout(r,30));
  const back=document.querySelector('a.demo-back');if(!back)throw Error('Return to filtered list missing');
  back.click();await new Promise(r=>setTimeout(r,30));if(location.hash!==origin)throw Error('List query was not restored');
  const sort=document.querySelector('main [data-sort="name"]');sort.focus();sort.click();await new Promise(r=>setTimeout(r,60));
  if(document.activeElement.dataset.sort!=='name')throw Error('Sort lost keyboard focus');
  if(!/q=Aurora/.test(location.hash)||!/direction=desc/.test(location.hash))throw Error('Sort discarded applied search');
  return {url:location.hash,focus:document.activeElement.dataset.sort};
})()
'@
    Send-Cdp 'Page.reload' @{ignoreCache = $true} | Out-Null
    Invoke-Js 'new Promise((resolve,reject)=>{let n=100;const poll=()=>{if(window.DemoApp&&document.querySelector("main h1"))return resolve(true);if(--n===0)return reject(Error("Reload did not initialize"));setTimeout(poll,30)};poll()})' | Out-Null
    Test-Browser 'reload restores applied query' @'
(()=>{if(!/q=Aurora/.test(location.hash)||!/direction=desc/.test(location.hash))throw Error('Reload lost applied query');const input=document.querySelector('main input[name="q"]');if(!input||input.value!=='Aurora')throw Error('Reload lost filter value');if(document.querySelectorAll('main tbody tr').length!==1)throw Error('Reload changed filtered results');return {url:location.hash,value:input.value}})()
'@

    Test-Browser 'hierarchy from System to Story and Task' @'
(async()=>{const visit=async hash=>{DemoApp.navigate(hash);await new Promise(r=>setTimeout(r,25));if(!document.querySelector('main h1'))throw Error('Missing heading '+hash)};await visit('#/systems/aurora');const project=document.querySelector('main a[href^="#/projects/"]');if(!project)throw Error('No project link');await visit(project.getAttribute('href'));const epic=document.querySelector('main a[href^="#/epics/"]');if(!epic)throw Error('No epic link');await visit(epic.getAttribute('href'));const story=document.querySelector('main a[href^="#/stories/"]');if(!story)throw Error('No story link');await visit('#/stories/aurora-busca');const tabs=[...document.querySelectorAll('.context-tabs a')].map(a=>a.textContent.trim());for(const expected of ['Tarefas','Execução','Especificação','Conversas','Auditoria','Configurações'])if(!tabs.some(t=>t.startsWith(expected)))throw Error('Missing Story tab '+expected);const task=document.querySelector('main a[href^="#/tasks/"]');if(!task)throw Error('No Task link');await visit(task.getAttribute('href'));return {taskHeading:document.querySelector('main h1').textContent,tabs}})()
'@

    Test-Browser 'Story current state remains available in historical audit' @'
(async()=>{DemoApp.navigate('#/stories/aurora-busca?tab=activity');await new Promise(r=>setTimeout(r,30));const main=document.querySelector('main');if(!/Auditoria/i.test(main.textContent))throw Error('Missing audit');if(!main.querySelector('table'))throw Error('Audit table missing');const filters=main.querySelector('details');if(filters&&filters.open)throw Error('Audit filters must start collapsed');return {heading:main.querySelector('h1').textContent,rows:main.querySelectorAll('tbody tr').length,hasCurrentState:/Desenvolvimento|Ciclo da História|Situação/.test(main.textContent)}})()
'@

    Test-Browser 'audit filters, sorting and bottom pagination' @'
(async()=>{const main=document.querySelector('main');const form=main.querySelector('form[data-query]')||main.querySelector('details form')||main.querySelector('form');if(!form)throw Error('No audit filters form');const details=form.closest('details');if(details)details.open=true;const input=form.querySelector('input[type="search"]')||form.querySelector('input[name="q"]');if(!input)throw Error('Audit search field missing');input.value='registro-inexistente-demo';input.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit();await new Promise(r=>setTimeout(r,30));if(!/0 resultados|Nenhum/.test(document.querySelector('main').textContent))throw Error('No empty filtered result');const clear=[...document.querySelectorAll('main button')].find(b=>/Limpar filtros/.test(b.textContent));if(!clear)throw Error('No clear filters action');clear.click();await new Promise(r=>setTimeout(r,30));const sort=document.querySelector('main th button');if(!sort)throw Error('No sortable column');sort.click();await new Promise(r=>setTimeout(r,30));if(!document.querySelector('main th[aria-sort]'))throw Error('Missing aria-sort');const pager=[...document.querySelectorAll('main nav')].find(n=>/pagina/i.test(n.getAttribute('aria-label')||''));if(!pager)throw Error('Audit pagination missing');const table=document.querySelector('main table');if(!(table.compareDocumentPosition(pager)&Node.DOCUMENT_POSITION_FOLLOWING))throw Error('Pager should follow results');const next=[...pager.querySelectorAll('button,a')].find(b=>/Próxima/.test(b.textContent));if(next&&!next.disabled){next.click();await new Promise(r=>setTimeout(r,30));if(!/auditPage=2/.test(location.hash))throw Error('Page URL was not preserved')}return {url:location.hash,sorting:document.querySelector('main th[aria-sort]').getAttribute('aria-sort')}})()
'@

    Test-Browser 'cancelling promotion does not change demo data' @'
(async()=>{DemoApp.navigate('#/releases/aurora-demo');await new Promise(r=>setTimeout(r,30));const initial=JSON.stringify(DemoApp.getData());const promote=document.querySelector('[data-action="promote"][data-id="aurora-demo"]');if(!promote)throw Error('Promotion action missing');promote.click();await new Promise(r=>setTimeout(r,20));const dialog=document.querySelector('dialog[open]');if(!dialog)throw Error('Promotion dialog missing');const cancel=[...dialog.querySelectorAll('button')].find(b=>/Cancelar/.test(b.textContent));if(!cancel)throw Error('Cancel button missing');cancel.click();await new Promise(r=>setTimeout(r,20));if(JSON.stringify(DemoApp.getData())!==initial)throw Error('Cancellation changed dataset');return true})()
'@

    Test-Browser 'promotion dialog receives keyboard focus' @'
(async()=>{DemoApp.navigate('#/releases/aurora-demo');await new Promise(r=>setTimeout(r,25));window.__demoBeforeEscape=JSON.stringify(DemoApp.getData());const button=document.querySelector('[data-action="promote"][data-id="aurora-demo"]');button.focus();button.click();await new Promise(r=>setTimeout(r,25));const dialog=document.querySelector('dialog[open]');if(!dialog||!dialog.contains(document.activeElement))throw Error('Dialog did not receive focus');return true})()
'@
    Send-Cdp 'Input.dispatchKeyEvent' @{type = 'keyDown'; key = 'Escape'; code = 'Escape'; windowsVirtualKeyCode = 27} | Out-Null
    Send-Cdp 'Input.dispatchKeyEvent' @{type = 'keyUp'; key = 'Escape'; code = 'Escape'; windowsVirtualKeyCode = 27} | Out-Null
    Test-Browser 'Escape cancels promotion and restores focus' @'
(async()=>{await new Promise(r=>setTimeout(r,25));if(document.querySelector('dialog[open]'))throw Error('Escape did not close dialog');if(document.activeElement.dataset.action!=='promote')throw Error('Focus did not return to promotion action');if(JSON.stringify(DemoApp.getData())!==window.__demoBeforeEscape)throw Error('Escape changed demo state');delete window.__demoBeforeEscape;return true})()
'@

    Test-Browser 'three illustrative release promotions preserve candidate and artifact' @'
(async()=>{
  const transitions=[];let frozenDigest=null;let frozenCandidate=null;
  for(const [source,destination] of [['DEV','QA'],['QA','HML'],['HML','PROD']]){
    const button=document.querySelector('[data-action="promote"][data-id="aurora-demo"]');
    if(!button)throw Error('Promotion action missing at '+source);
    if(!button.textContent.includes(destination))throw Error('Wrong next environment '+button.textContent);
    button.click();await new Promise(r=>setTimeout(r,20));
    const dialog=document.querySelector('dialog[open]');if(!dialog)throw Error('Confirmation missing');
    const confirm=dialog.querySelector('[data-action="confirm-promotion"]');if(!confirm)throw Error('Confirmation button missing');
    confirm.click();await new Promise(r=>setTimeout(r,40));
    const data=DemoApp.getData(),release=data.releases.find(r=>r.id==='aurora-demo');
    if(release.environment!==destination)throw Error('Environment was not updated');
    if(destination==='QA'){
      if(release.status!=='CLOSED'||!release.candidate||!release.digest)throw Error('QA must freeze the composition and artifact');
      frozenDigest=release.digest;frozenCandidate=release.candidate;
    }else if(release.digest!==frozenDigest||release.candidate!==frozenCandidate)throw Error('Candidate or artifact changed during promotion');
    const stories=data.items.filter(i=>release.storyIds.includes(i.id));
    if(destination==='PROD'&&stories.some(s=>s.status!=='completed'))throw Error('Production must complete included Stories');
    if(destination!=='PROD'&&stories.some(s=>s.status==='completed'))throw Error('Stories completed before production');
    transitions.push(source+' → '+destination);
  }
  if(document.querySelector('[data-action="promote"][data-id="aurora-demo"]'))throw Error('Production must be terminal');
  return {transitions,digest:frozenDigest,candidate:frozenCandidate};
})()
'@
    Save-Screenshot 'desktop-release-production.png'

    Test-Browser 'reset restores original demonstration' @'
(async()=>{DemoApp.navigate('#/help');await new Promise(r=>setTimeout(r,30));const reset=document.querySelector('[data-action="reset"]');if(!reset)throw Error('Reset action missing from HELP');reset.click();await new Promise(r=>setTimeout(r,20));const confirm=document.querySelector('dialog[open] [data-action="confirm-reset"]');if(!confirm)throw Error('Reset confirmation missing');confirm.click();await new Promise(r=>setTimeout(r,30));DemoApp.navigate('#/releases/aurora-demo');await new Promise(r=>setTimeout(r,30));const promote=document.querySelector('[data-action="promote"][data-id="aurora-demo"]');if(!promote||!promote.textContent.includes('QA'))throw Error('Reset did not restore DEV');return true})()
'@

    Send-Cdp 'Emulation.setDeviceMetricsOverride' @{width = 390; height = 844; deviceScaleFactor = 1; mobile = $true} | Out-Null
    Test-Browser 'conversation journey mobile chat remains readable without page overflow' @'
(async()=>{
  DemoApp.navigate('#/assistant?context=aurora-catalogo&topic=business&session=aurora-catalogo-planejamento');await new Promise(resolve=>setTimeout(resolve,80));
  if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Conversation page overflows '+document.documentElement.scrollWidth+' / '+innerWidth);
  const cards=[...document.querySelectorAll('.demo-conversation-message[data-message-id][data-speaker]')];
  if(!cards.length)throw Error('Mobile conversation cards missing');
  for(const card of cards){const bounds=card.getBoundingClientRect();if(bounds.left<0||bounds.right>innerWidth+1)throw Error('Message extends outside the mobile page');}
  for(const role of ['user','assistant'])if(!cards.some(card=>card.dataset.speaker===role))throw Error('Mobile speaker distinction missing '+role);
  if(document.querySelector('.demo-banner'))throw Error('Removed banner reappeared in mobile chat');
  return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,messages:cards.length};
})()
'@
    if (-not $Filter -or 'conversation journey mobile chat remains readable without page overflow' -match $Filter) {
        Invoke-Js '(()=>{document.querySelector(".demo-assistant-conversation")?.scrollIntoView({block:"start"});return true})()' | Out-Null
        Save-Screenshot 'assistant-mobile.png' -ForFocal
    }
    Test-Browser 'mobile Story navigation and no page overflow' @'
(async()=>{DemoApp.navigate('#/stories/aurora-busca?tab=planning');await new Promise(r=>setTimeout(r,60));if(!document.querySelector('main h1'))throw Error('Mobile heading missing');if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Page overflows '+document.documentElement.scrollWidth+' / '+innerWidth);const current=document.querySelector('aside a[aria-current="page"]');if(!current)throw Error('Active global route missing');const track=document.querySelector('.demo-cycle'),step=track&&track.querySelector('[aria-current="step"]');if(!step)throw Error('Current Story phase missing');const a=step.getBoundingClientRect(),b=track.getBoundingClientRect();if(a.left<b.left-1||a.right>b.right+1)throw Error('Current Story phase is outside the visible cycle');return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,active:current.textContent.trim(),phase:step.textContent.trim()}})()
'@
    Save-Screenshot 'mobile-story-execution.png'
    Test-Browser 'all resources remain local with no API or internet calls' @'
(()=>{const resources=performance.getEntriesByType('resource').map(r=>r.name),remote=resources.filter(url=>!['file:','data:'].includes(new URL(url).protocol));if(remote.length)throw Error('Unexpected external resources: '+remote.join(', '));return {localResources:resources.length,remoteResources:remote.length}})()
'@
    Test-Browser 'no browser errors' @'
(()=>({readyState:document.readyState,dialogOpen:!!document.querySelector('dialog[open]')}))()
'@
    if ($browserErrors.Count -gt 0) { $results.Add(@{name = 'browser console and page errors'; passed = $false; errors = @($browserErrors.ToArray())}) }
    else { $results.Add(@{name = 'browser console and page errors'; passed = $true}) }
    $remoteRequests = @($networkRequests | Where-Object { $_.url -notmatch '^(file|data):' })
    $results.Add(@{name = 'CDP network requests remain local'; passed = $networkRequests.Count -gt 0 -and $remoteRequests.Count -eq 0; observedRequests = $networkRequests.Count; remoteRequests = $remoteRequests.Count})
} catch {
    $results.Add(@{name = 'browser test setup'; passed = $false; error = $_.Exception.Message})
    Write-Output ('FAIL setup: ' + $_.Exception.Message)
} finally {
    if ($script:socket -and $script:socket.State -eq [Net.WebSockets.WebSocketState]::Open) {
        try { Send-Cdp 'Browser.close' | Out-Null } catch { }
        $script:socket.Dispose()
    }
    if ($browserProcess) {
        try { if (-not $browserProcess.WaitForExit(5000)) { Stop-Process -Id $browserProcess.Id -Force -ErrorAction SilentlyContinue } } catch { }
    }
    $resolvedProfile = [IO.Path]::GetFullPath($profilePath)
    $expectedPrefix = $testRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedProfile.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolvedProfile) -notmatch '^\.browser-profile-[a-f0-9]{32}$') {
        throw 'Refusing to remove a browser profile outside the test directory.'
    }
    for ($attempt = 0; $attempt -lt 20 -and (Test-Path -LiteralPath $resolvedProfile); $attempt++) {
        try { Remove-Item -LiteralPath $resolvedProfile -Recurse -Force -ErrorAction Stop } catch { Start-Sleep -Milliseconds 200 }
    }
    if (-not (Test-Path -LiteralPath $artifactRoot)) { New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null }
    $failed = @($results | Where-Object { -not $_.passed }).Count
    $report = @{generatedAt = [DateTimeOffset]::UtcNow.ToString('o'); filter = $Filter; entry = 'file://sdlc_demo/index.html'; browser = 'Microsoft Edge headless'; viewport = @( @{width = 1440; height = 1000}, @{width = 390; height = 844} ); passed = $results.Count - $failed; failed = $failed; checks = @($results.ToArray()); browserErrors = @($browserErrors.ToArray()); networkRequests = @($networkRequests.ToArray())}
    $reportName = if ($Filter -match 'conversation journey') { 'validation-conversation.json' } elseif ($Filter) { 'validation-focal.json' } else { 'validation.json' }
    $report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $artifactRoot $reportName) -Encoding utf8
    Write-Output ("Browser checks: {0} passed, {1} failed." -f $report.passed, $report.failed)
}
if ($failed -gt 0) { exit 1 }


