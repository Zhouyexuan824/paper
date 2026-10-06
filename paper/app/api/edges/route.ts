import {api,owner,jsonBody,text,node,db,graph,ApiError} from '@/lib/server';
import {cleanUrl,type GraphEdge} from '@/lib/model';
export async function POST(req:Request){return api(async()=>{const user=owner(req),b=await jsonBody(req);const source=text(b.source,500),target=text(b.target,500);await node(user,source);await node(user,target);if(source===target)throw new ApiError('请选择两个不同节点。');
 let id=text(b.id,1000);if(id){const found=await db().prepare('SELECT id FROM graph_edges WHERE owner=? AND id=? AND deleted=0').bind(user,id).first();if(!found)throw new ApiError('关系不存在。',404);}else id='manual:'+crypto.randomUUID();
 const edge:GraphEdge={id,source,target,type:text(b.type,80)||'自定义',description:text(b.description,4000),evidence:text(b.evidence,4000),sourceUrl:cleanUrl(b.sourceUrl),status:'manual',origin:'manual'};
 await db().prepare('INSERT INTO graph_edges(owner,id,data) VALUES(?,?,?) ON CONFLICT(owner,id) DO UPDATE SET data=excluded.data,deleted=0').bind(user,id,JSON.stringify(edge)).run();return {graph:await graph(user)};});}
export async function DELETE(req:Request){return api(async()=>{const user=owner(req),b=await jsonBody(req);const result=await db().prepare('UPDATE graph_edges SET deleted=1 WHERE owner=? AND id=? AND deleted=0').bind(user,text(b.id,1000)).run();if(!result.meta.changes)throw new ApiError('关系不存在。',404);return {graph:await graph(user)};});}
