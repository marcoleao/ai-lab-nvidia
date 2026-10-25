// Sinais visuais compartilhados; nunca representam progresso interno do provedor.
export const spinner=()=>'<span class="ui-spinner" aria-hidden="true"></span>';
export const failureIcon=()=>'<span class="ui-failure-icon" aria-hidden="true">!</span>';
export const isFailure=value=>{const status=String(value||'').toUpperCase().replaceAll(' ','_');return ['FAILED','FAILURE','ERROR','TIMEOUT','TIMED_OUT'].includes(status)||status.endsWith('_FAILED');};
