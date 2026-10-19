'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vscode=require('vscode');
exports.run=async()=>{
  const extension=vscode.extensions.getExtension('ai-local.sdlc-chat');
  assert(extension,'Local SDLC extension must be discoverable');
  await extension.activate();
  assert(extension.isActive);
  const commands=await vscode.commands.getCommands(true);
  assert(commands.includes('sdlc.chat.open')&&commands.includes('sdlc.chat.configure'));
  await vscode.commands.executeCommand('sdlc.chat.open');
  await new Promise(resolve=>setTimeout(resolve,1200));
  fs.writeFileSync(process.env.SDLC_EXTENSION_TEST_REPORT,JSON.stringify({status:'passed',checks:['discovery','activation','commands','webview_open'],vscode:vscode.version}));
};
