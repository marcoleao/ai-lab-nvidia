import {afterEach,expect,test,vi} from 'vitest';
import {GitLabProvider} from '../apps/api/src/gitlab.ts';

afterEach(()=>vi.unstubAllGlobals());
const ref={projectId:2,iid:1,sha:'abc123',sourceBranch:'sdlc/story-check'};
const mr={sha:ref.sha,source_branch:ref.sourceBranch,state:'opened',head_pipeline:{id:4,sha:ref.sha}};
const job=(status:string,extra={})=>({id:10,sha:ref.sha,name:'sdlc-security-scan',ref:ref.sourceBranch,pipeline_id:4,status,...extra});
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const provider=()=>new GitLabProvider('http://gitlab','test-token');

test.each(['pending','running','success','failed'] as const)('repeated %s is read-only for the exact revision and pipeline',async state=>{
 const fetchMock=vi.fn().mockResolvedValueOnce(response(mr)).mockResolvedValueOnce(response([job(state)]));vi.stubGlobal('fetch',fetchMock);
 await provider().qualityStatus(ref,'security_scan',state);
 expect(fetchMock).toHaveBeenCalledTimes(2);
 expect(fetchMock.mock.calls.every(call=>call[1].method==='GET')).toBe(true);
 const query=new URL(fetchMock.mock.calls[1][0]).searchParams;
 expect(query.get('pipeline_id')).toBe('4');expect(query.get('sort')).toBe('desc');
});

test.each([{pipeline_id:3},{ref:'other-branch'},{name:'other-job'},{sha:'old-commit'}])('unrelated evidence cannot suppress publication: %j',async extra=>{
 const fetchMock=vi.fn().mockResolvedValueOnce(response(mr)).mockResolvedValueOnce(response([job('pending',extra)])).mockResolvedValueOnce(response(job('pending')));vi.stubGlobal('fetch',fetchMock);
 await provider().qualityStatus(ref,'security_scan','pending');
 expect(fetchMock).toHaveBeenCalledTimes(3);expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({pipeline_id:4,state:'pending'});
});

test('latest attempt wins over an earlier matching state',async()=>{
 const fetchMock=vi.fn().mockResolvedValueOnce(response(mr)).mockResolvedValueOnce(response([job('pending',{id:1}),job('failed',{id:2})])).mockResolvedValueOnce(response(job('pending')));vi.stubGlobal('fetch',fetchMock);
 await provider().qualityStatus(ref,'security_scan','pending');
 expect(JSON.parse(fetchMock.mock.calls[2][1].body).state).toBe('pending');
});

test.each([400,409,422])('HTTP %s only reconciles when GitLab confirms the requested state',async status=>{
 const fetchMock=vi.fn().mockResolvedValueOnce(response(mr)).mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({message:'state conflict'},status)).mockResolvedValueOnce(response([job('pending')]));vi.stubGlobal('fetch',fetchMock);
 await provider().qualityStatus(ref,'security_scan','pending');expect(fetchMock).toHaveBeenCalledTimes(4);
});

test('a genuine rejection reports operation and actual state without claiming credentials are wrong',async()=>{
 const fetchMock=vi.fn().mockResolvedValueOnce(response(mr)).mockResolvedValueOnce(response([job('pending')])).mockResolvedValueOnce(response({message:'private raw detail'},400)).mockResolvedValueOnce(response([job('pending')]));vi.stubGlobal('fetch',fetchMock);
 await expect(provider().qualityStatus(ref,'security_scan','running')).rejects.toMatchObject({code:'QUALITY_STATUS_REJECTED',message:expect.stringContaining('Estado confirmado: PENDING; pipeline #4')});
});

test('concurrent updates have bounded retries and never fabricate approval',async()=>{
 const fetchMock=vi.fn().mockImplementation(async(_url:string,options:RequestInit)=>response(options.method==='POST'?{message:'conflict'}:_url.includes('merge_requests')?mr:[],options.method==='POST'?409:200));vi.stubGlobal('fetch',fetchMock);
 await expect(provider().qualityStatus(ref,'security_scan','success')).rejects.toMatchObject({code:'QUALITY_STATUS_REJECTED'});
 expect(fetchMock.mock.calls.filter(call=>call[1].method==='POST')).toHaveLength(3);
});

test('authorization failures retain an accurate credential diagnostic',async()=>{
 const fetchMock=vi.fn().mockResolvedValueOnce(response(mr)).mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({message:'Forbidden'},403));vi.stubGlobal('fetch',fetchMock);
 await expect(provider().qualityStatus(ref,'security_scan','running')).rejects.toThrow('credencial e as permissões');expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('a changed MR cannot publish even when an old status matches',async()=>{
 const fetchMock=vi.fn().mockResolvedValueOnce(response({...mr,sha:'changed'}));vi.stubGlobal('fetch',fetchMock);
 await expect(provider().qualityStatus(ref,'security_scan','pending')).rejects.toMatchObject({code:'QUALITY_STALE'});expect(fetchMock).toHaveBeenCalledTimes(1);
});
