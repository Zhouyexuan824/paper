import assert from 'node:assert/strict';
const base='http://localhost:3000';
async function call(path,body,method='POST',auth=true){const r=await fetch(base+'/api/'+path,{method:body===undefined?'GET':method,headers:{...(auth?{Cookie:'__sites_local_auth=1'}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
assert.equal((await call('graph',undefined,'GET',false)).status,401,'anonymous graph access denied');
let g=(await call('graph')).data;assert(g.nodes.length>=10);const n=g.nodes.find(n=>n.id==='arxiv:2505.23214');assert(n);
const note=n.notes||'';
let r=await call('nodes',{id:n.id,notes:'test: durable personal note'},'PATCH');assert.equal(r.status,200);g=(await call('graph')).data;assert.equal(g.nodes.find(x=>x.id===n.id).notes,'test: durable personal note');
await call('nodes',{id:n.id,notes:note},'PATCH');
assert.equal((await call('nodes',{id:'missing',notes:'invalid'},'PATCH')).status,404);
assert.equal((await call('nodes',{id:n.id,code:'javascript:alert(1)'},'PATCH')).status,400);
assert.equal((await call('edges',{source:n.id,target:n.id})).status,400);
r=await call('edges',{source:n.id,target:'arxiv:2408.00714',type:'测试关系',description:'integration test',evidence:'manual test',sourceUrl:'https://arxiv.org/abs/2505.23214'});assert.equal(r.status,200);
const edge=r.data.graph.edges.find(e=>e.description==='integration test');assert(edge&&edge.status==='manual');
r=await call('edges',{...edge,description:'edited relation'});assert.equal(r.status,200);assert(r.data.graph.edges.some(e=>e.id===edge.id&&e.description==='edited relation'));
assert.equal((await call('edges',{id:edge.id},'DELETE')).status,200);assert(!(await call('graph')).data.edges.some(e=>e.id===edge.id));
assert.equal((await call('edges',{id:edge.id},'DELETE')).status,404);
const cross=await fetch(base+'/api/nodes',{method:'PATCH',headers:{'Cookie':'__sites_local_auth=1','Content-Type':'application/json',Origin:'https://wrong.example'},body:JSON.stringify({id:n.id,notes:'bad'})});assert.equal(cross.status,403);
console.log('PASS: authentication, persistence, node ownership, safe URLs, self-edge rejection, edge creation/edit/deletion, cross-origin protection');
