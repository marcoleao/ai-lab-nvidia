// This browser-safe module owns the status vocabulary used by API and lists.
export const statuses={
 system:['active','inactive'],
 project:['active','inactive','completed','cancelled'],
 epic:['active','inactive','completed','cancelled'],
 story:['specification','approved','coding','code_review','security_scan','merge_request','testing','uat','production','completed','cancelled'],
 task:['todo','doing','done','cancelled'],
} as const;
export const statusLabels:Record<string,string>={active:'ACTIVE',inactive:'INACTIVE',awaiting_approval:'AWAITING APPROVAL',approved:'APPROVED',todo:'TO DO',doing:'DOING',done:'DONE',specification:'SPECIFICATION',coding:'CODING',code_review:'CODE REVIEW',security_scan:'SECURITY SCAN',merge_request:'MERGE REQUEST',testing:'TESTING',uat:'UAT',production:'PRODUCTION',completed:'COMPLETED',cancelled:'CANCELLED',paused:'PAUSED',cancel_pending:'CANCELLATION REQUESTED'};
