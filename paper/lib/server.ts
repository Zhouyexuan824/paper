import { env } from 'cloudflare:workers';
import type { Graph,GraphEdge,PaperNode } from './model';
import { seed } from './seed';
export function db(){return env.DB;}
export class ApiError extends Error{constructor(message:string,public status=400){super(message);}}
export function owner(req:Request){
 const user=req.headers.get('oai-authenticated-user-id');
 if(!user)throw new ApiError('请先登录，再保存和探索你的个人图谱。',401);
 if(req.method!=='GET'){
  const origin=req.headers.get('origin');
  const expected=new URL(req.url).origin;
  if((origin&&origin!==expected)||req.headers.get('sec-fetch-site')==='cross-site')throw new ApiError('请求来源不匹配。',403);
 }
 return user;
}
export async function jsonBody(req:Request){
 if(!req.headers.get('content-type')?.includes('application/json'))throw new ApiError('需要 JSON 请求。',415);
 const text=await req.text();if(text.length>100000)throw new ApiError('内容过长。',413);
 try{return JSON.parse(text);}catch{throw new ApiError('JSON 格式不正确。');}
}
export function text(value:unknown,max=2000){return typeof value==='string'?value.trim().slice(0,max):'';}
export async function api(fn:()=>Promise<unknown>){try{return Response.json(await fn(),{headers:{'Cache-Control':'private, no-store'}});}catch(e){if(!(e instanceof ApiError))console.error("Paper Atlas request failed:",e instanceof Error?e.message.replace(/sk-[^\s]+/g,"[redacted]"):"unknown error");return Response.json({error:e instanceof ApiError?e.message:'服务暂时不可用，请稍后重试。'},{status:e instanceof ApiError?e.status:500,headers:{'Cache-Control':'no-store'}});}}
export async function rate(user:string,action:string,max:number){
 const key=`${user}:${action}:${Math.floor(Date.now()/3600000)}`;
 const row=await db().prepare('INSERT INTO request_limits(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key).first<{count:number}>();
 if(row&&row.count>max)throw new ApiError('本小时操作较多，请稍后再试。已有内容已保留。',429);
}
export async function init(user:string){
 const r=await db().prepare('INSERT OR IGNORE INTO graph_users(id,created) VALUES(?,?)').bind(user,Date.now()).run();
 if(r.meta.changes){await db().batch([
  ...seed.nodes.map(n=>db().prepare('INSERT OR IGNORE INTO graph_nodes(owner,id,data) VALUES(?,?,?)').bind(user,n.id,JSON.stringify(n))),
  ...seed.edges.map(e=>db().prepare('INSERT OR IGNORE INTO graph_edges(owner,id,data) VALUES(?,?,?)').bind(user,e.id,JSON.stringify(e))),
 ]);}
}
export async function graph(user:string):Promise<Graph>{
 const [ns,es]=await Promise.all([db().prepare('SELECT data,overrides FROM graph_nodes WHERE owner=?').bind(user).all<{data:string,overrides:string}>(),db().prepare('SELECT data FROM graph_edges WHERE owner=? AND deleted=0').bind(user).all<{data:string}>()]);
 return {nodes:ns.results.map(r=>({...JSON.parse(r.data),...JSON.parse(r.overrides)})),edges:es.results.map(r=>JSON.parse(r.data))};
}
export async function node(user:string,id:string):Promise<PaperNode>{const r=await db().prepare('SELECT data,overrides FROM graph_nodes WHERE owner=? AND id=?').bind(user,id).first<{data:string,overrides:string}>();if(!r)throw new ApiError('该节点不存在。',404);return {...JSON.parse(r.data),...JSON.parse(r.overrides)};}
export async function updateNode(user:string,id:string,patch:Partial<PaperNode>,manual=false){
 const col=manual?'overrides':'data';await db().prepare(`UPDATE graph_nodes SET ${col}=json_patch(${col},?) WHERE owner=? AND id=?`).bind(JSON.stringify(patch),user,id).run();
}
const normalized=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export async function merge(user:string,incoming:Graph){
 const current=await graph(user);if(current.nodes.length+incoming.nodes.length>2000)throw new ApiError('图谱已达到第一版的 2000 节点上限。');
 const map=new Map<string,string>();const statements:D1PreparedStatement[]=[];
 for(const n of incoming.nodes){
  const old=current.nodes.find(x=>x.id===n.id || (x.kind===n.kind&&((n.doi&&x.doi?.toLowerCase()===n.doi.toLowerCase())||(n.arxiv&&x.arxiv===n.arxiv)||normalized(x.title)===normalized(n.title)||(n.kind!=='paper'&&normalized(x.label.replace(/module|模块/gi,''))===normalized(n.label.replace(/module|模块/gi,''))))));
  const id=old?.id||n.id;map.set(n.id,id);
  const value={...n,id,x:old?.x??n.x??150+(current.nodes.length%6)*170,y:old?.y??n.y??140+Math.floor(current.nodes.length/6)*155};
  statements.push(db().prepare('INSERT INTO graph_nodes(owner,id,data) VALUES(?,?,?) ON CONFLICT(owner,id) DO UPDATE SET data=json_patch(graph_nodes.data,excluded.data)').bind(user,id,JSON.stringify(value)));
  if(!old)current.nodes.push(value);
 }
 const all=await db().prepare('SELECT data FROM graph_edges WHERE owner=?').bind(user).all<{data:string}>();
 const existing=all.results.map(r=>JSON.parse(r.data) as GraphEdge);
 for(const e of incoming.edges){
  const value={...e,source:map.get(e.source)||e.source,target:map.get(e.target)||e.target};
  if(value.source===value.target||!current.nodes.some(n=>n.id===value.source)||!current.nodes.some(n=>n.id===value.target))continue;
  // Existing and deleted relations survive repeated automatic expansion.
  if(existing.some(x=>x.id===value.id||(x.source===value.source&&x.target===value.target&&(x.type===value.type||x.origin==='manual'))))continue;
  statements.push(db().prepare('INSERT OR IGNORE INTO graph_edges(owner,id,data) VALUES(?,?,?)').bind(user,value.id,JSON.stringify(value)));existing.push(value);
 }
 if(statements.length)await db().batch(statements);
 return {graph:await graph(user),ids:Object.fromEntries(map)};
}
export async function cached(key:string,fetcher:()=>Promise<unknown>,ttl=86400000){
 const old=await db().prepare('SELECT data FROM metadata_cache WHERE key=? AND expires>?').bind(key,Date.now()).first<{data:string}>();
 if(old)return JSON.parse(old.data);
 const value=await fetcher();await db().prepare('INSERT INTO metadata_cache(key,data,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,expires=excluded.expires').bind(key,JSON.stringify(value),Date.now()+ttl).run();return value;
}
