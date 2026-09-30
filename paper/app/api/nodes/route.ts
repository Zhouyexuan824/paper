import {api,owner,jsonBody,text,node,updateNode,graph,ApiError} from '@/lib/server';
import {cleanUrl,type PaperNode} from '@/lib/model';
export async function PATCH(req:Request){return api(async()=>{const user=owner(req);const body=await jsonBody(req);const id=text(body.id,500);await node(user,id);const patch:Partial<PaperNode>={};
 for(const k of ['label','abstract','notes','experiments','datasets','summary'] as const)if(k in body)patch[k]=text(body[k],k==='abstract'?20000:8000);
 if('label' in patch&&!patch.label)throw new ApiError('节点名称不能为空。');
 if('code' in body){patch.code=cleanUrl(body.code);if(body.code&&!patch.code)throw new ApiError('链接需要以 http:// 或 https:// 开头。');}
 for(const k of ['x','y'] as const)if(k in body){if(typeof body[k]!=='number'||!Number.isFinite(body[k])||Math.abs(body[k])>100000)throw new ApiError('节点坐标不正确。');patch[k]=body[k];}
 await updateNode(user,id,patch,true);return {graph:await graph(user)};});}
