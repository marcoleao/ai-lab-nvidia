import {z} from 'zod';
import {executionContractSchema,contractFilePaths,unitPath,type ExecutionContract,type ExecutionContractObservation} from './execution-contract.ts';
export type ContractInventory={entries:{path:string;kind:'file'|'directory';regular:boolean}[];totalEntries:number;excludedEntries:number;complete:true;policy:'safe-path-metadata-v1'};
export type ContractProposalContext={observation:ExecutionContractObservation;inventory:ContractInventory};
export const contractProposalOutputSchema=z.object({summary:z.string().trim().min(10).max(1200),questions:z.array(z.string().trim().min(5).max(400)).max(8),contract:executionContractSchema.nullable()}).strict().refine(value=>!!value.contract||value.questions.length>0,'Incomplete proposal');
export type ContractProposalOutput=z.infer<typeof contractProposalOutputSchema>;
export type ContractPendingEntry={path:string;kind:'missing_file'|'missing_directory'|'unsupported'};
export function contractPendingEntries(contract:ExecutionContract|null,inventory:ContractInventory):ContractPendingEntry[]{
 if(!contract)return [];const byPath=new Map(inventory.entries.map(v=>[v.path,v])),pending:ContractPendingEntry[]=[];
 for(const path of contractFilePaths(contract.units)){const entry=byPath.get(path);if(!entry)pending.push({path,kind:'missing_file'});else if(entry.kind!=='file'||!entry.regular)pending.push({path,kind:'unsupported'});}
 const directories=new Set<string>();for(const unit of contract.units){const target=unitPath(unit.path,unit.artifact.context);for(let path=target;path!=='.';){directories.add(path);const slash=path.lastIndexOf('/');path=slash<0?'.':path.slice(0,slash);}}
 // Include every ancestor of file references, so a missing child cannot hide a symlink.
 for(const file of contractFilePaths(contract.units)){let path=file.includes('/')?file.slice(0,file.lastIndexOf('/')):'.';while(path!=='.'){directories.add(path);path=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'.';}}
 for(const path of directories){const entry=byPath.get(path);if(!entry)pending.push({path,kind:'missing_directory'});else if(entry.kind!=='directory'||!entry.regular)pending.push({path,kind:'unsupported'});}
 return pending;
}
export type ContractProposalReading=ContractProposalOutput&{id:string;number:number;systemId:string;repositoryId:string;repositoryVersion:number;projectId:number;baseSha:string;branch:string;contextDigest:string;digest:string;source:string;actorName:string;createdAt:string;parentId:string|null;pendingEntries:ContractPendingEntry[];review:{id:string;actorName:string;createdAt:string;reason:string}|null};
export type ContractRequestReading={id:string;turnId:string;state:string;actorName:string;createdAt:string;updatedAt:string;message:string|null;baseSha:string;proposalId:string|null};
