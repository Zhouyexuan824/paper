import {api,owner,rate,text,ApiError} from '@/lib/server';
import {search} from '@/lib/sources';
export async function GET(req:Request){return api(async()=>{const user=owner(req);await rate(user,'search',120);const q=text(new URL(req.url).searchParams.get('q'),300);if(q.length<2)throw new ApiError('请输入至少两个字符。');return search(q);});}
