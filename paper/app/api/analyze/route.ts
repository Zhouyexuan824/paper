import {api,owner,rate,jsonBody,text,node,merge} from '@/lib/server';
import {analyze} from '@/lib/ai';
export async function POST(req:Request){return api(async()=>{const user=owner(req);await rate(user,'ai',30);const {id}=await jsonBody(req);const paper=await node(user,text(id,500));const result=await analyze(paper);return {...await merge(user,result.graph),suggestions:result.suggestions,model:result.model};});}
