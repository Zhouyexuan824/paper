import assert from 'node:assert/strict';
const base='http://localhost:3000/api/';
const headers={'Cookie':'__sites_local_auth=1','Content-Type':'application/json'};
const id='arxiv:2505.23214';
const before=await (await fetch(base+'graph',{headers})).json();
const note=before.nodes.find(n=>n.id===id).notes;
const response=await fetch(base+'explore',{method:'POST',headers,body:JSON.stringify({id,goal:'理解 SAMamba 的技术来源，找同样用于红外小目标检测的替代方法，优先考虑可替换的模块。'})});
const data=await response.json();
assert.equal(response.status,200,data.error);
const graph=await (await fetch(base+'graph',{headers})).json();
const root=graph.nodes.find(n=>n.id===id);
assert(root.research.reading.length>=2,'must produce useful validated recommendations');
assert.equal(root.research.reading.length,data.relatedPapers,'save the latest analysis, not an older cached brief');
assert.equal(root.notes,note,'manual notes remain unchanged');
const norm=s=>s.toLowerCase().replace(/\s+/g,' ').trim();
for(const r of root.research.reading){
 const target=graph.nodes.find(n=>n.id===r.id);assert(target,'canonical target exists');
 assert(norm(root.abstract).includes(norm(r.centerEvidence)),'center quote verified');
 assert(norm(target.abstract).includes(norm(r.targetEvidence)),'candidate quote verified');
 assert(graph.edges.some(e=>e.source===id&&e.target===r.id),'linked reading target');
}
assert(root.research.reading.some(r=>r.id==='arxiv:2408.00714'),'SAM2 foundation recognized');
assert(root.research.reading.some(r=>r.id==='arxiv:2312.00752'),'Mamba foundation recognized');
console.log(JSON.stringify({passed:true,recommendations:root.research.reading.map(r=>({title:r.title,role:r.role})),compared:root.research.abstractsRead,goal:root.research.goal,warnings:data.warnings},null,2));
