import assert from 'node:assert/strict';
const base='http://localhost:3000/api/';
async function call(path,body,method='POST'){const r=await fetch(base+path,{method:body===undefined?'GET':method,headers:{Cookie:'__sites_local_auth=1',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,200,d.error);return d;}
const search=await call('search?q=SAMamba');assert(search.papers.some(p=>p.arxiv==='2505.23214'&&p.abstract.length>100));
await call('papers',{id:'arxiv:2408.00714'});const before=(await call('graph')).nodes.length;await call('papers',{id:'arxiv:2408.00714'});assert.equal((await call('graph')).nodes.length,before,'adding a paper twice is idempotent');
const id='arxiv:2505.23214';const old=(await call('graph')).nodes.find(n=>n.id===id);const note=old.notes||'';
await call('nodes',{id,notes:'integration: preserve manual note'},'PATCH');
try{
 const analyzed=await call('analyze',{id});assert.equal(analyzed.model,'MiniMax-M2.5');const paper=analyzed.graph.nodes.find(n=>n.id===id);assert(paper.analyzed&&paper.summary.length>20);assert.equal(paper.notes,'integration: preserve manual note');
 const again=await call('analyze',{id});assert.equal(again.graph.nodes.length,analyzed.graph.nodes.length,'cached repeat analysis does not duplicate nodes');
 assert.equal(again.graph.edges.length,analyzed.graph.edges.length,'cached repeat analysis does not duplicate edges');
 const expanded=await call('expand',{id});assert(expanded.loadedReferences>0);assert(expanded.graph.edges.some(e=>e.origin==='index'&&e.type==='引用'));
 console.log(JSON.stringify({passed:true,searchResults:search.papers.length,model:analyzed.model,referenceCount:expanded.totalReferences,loadedReferences:expanded.loadedReferences,checks:['real source search','idempotent import','real MiniMax analysis','manual-note preservation','idempotent AI repeat','citation expansion']}));
}finally{await call('nodes',{id,notes:note},'PATCH');}
