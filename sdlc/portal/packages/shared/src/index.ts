import { z } from 'zod';
export const kinds = ['system','project','epic','story','task'] as const;
export type ItemKind = typeof kinds[number];
export const parentKinds: Record<ItemKind, ItemKind|null> = {system:null,project:'system',epic:'project',story:'epic',task:'story'};
export const statuses = {
  system: ['active'], project:['awaiting_approval','approved'], epic:['todo','approved','doing','done'],
  story:['specification','approved','coding','code_review','security_scan','testing','uat','production','completed'], task:['todo','doing','done']
} as const;
export const statusLabels: Record<string,string> = {active:'ACTIVE',awaiting_approval:'AWAITING APPROVAL',approved:'APPROVED',todo:'TO DO',doing:'DOING',done:'DONE',specification:'SPECIFICATION',coding:'CODING',code_review:'CODE REVIEW',security_scan:'SECURITY SCAN',testing:'TESTING',uat:'UAT',production:'PRODUCTION',completed:'COMPLETED'};
export const personas = [
  {id:'ana',name:'Ana',role:'product_owner'}, {id:'bruno',name:'Bruno',role:'architect'},
  {id:'carla',name:'Carla',role:'qa_lead'}, {id:'diego',name:'Diego',role:'security_lead'},
  {id:'elisa',name:'Elisa',role:'release_manager'}, {id:'admin',name:'Admin',role:'admin'}
] as const;
export type Persona = typeof personas[number];
const name = z.string().trim().min(1,'Informe um nome ou título.').max(120);
export const createItemSchema = z.object({kind:z.enum(kinds),parentId:z.string().min(1).optional(),name,description:z.string().trim().max(4000).default(''),key:z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,11}$/,'Use de 2 a 12 letras/números, começando por letra.').optional(),repositoryIds:z.array(z.string().min(1)).max(100).optional()}).strict();
export const editItemSchema = z.object({name,description:z.string().trim().max(4000),expectedVersion:z.number().int().positive()}).strict();
export const versionSchema = z.object({expectedVersion:z.number().int().positive()}).strict();
export const statusSchema = versionSchema.extend({status:z.string().min(1),comment:z.string().trim().max(2000).optional()});
export interface WorkItem {id:string;kind:ItemKind;key:string;name:string;description:string;status:string;version:number;archived:boolean;parentId:string|null;data:Record<string,unknown>;createdAt:string;updatedAt:string}
export interface IntegrationCheck {id:string;label:string;status:'ready'|'unavailable'|'not_configured';message:string}
