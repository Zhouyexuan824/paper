import type { Graph, GraphEdge } from './model';
const source='https://arxiv.org/abs/2505.23214';
const edge=(target:string,type:string,evidence:string):GraphEdge=>({id:`seed:samamba:${target}`,source:'arxiv:2505.23214',target,type,description:'',evidence,sourceUrl:source,status:'verified',origin:'seed'});
export const seed: Graph = {
 nodes:[
  {id:'arxiv:2505.23214',label:'SAMamba',title:'SAMamba: Adaptive State Space Modeling with Hierarchical Vision for Infrared Small Target Detection',kind:'paper',year:2025,arxiv:'2505.23214',doi:'10.1016/j.inffus.2025.103338',openalex:'W4410953851',url:source,x:500,y:350,summary:'结合 SAM2 的分层特征学习和 Mamba 的选择性序列建模，研究红外小目标检测。',code:'https://github.com/zhengshuchen/SAMamba',datasets:'SIRST（论文称 NUAA-SIRST）\nhttps://github.com/YimianDai/sirst\nIRSTD-1k\nhttps://github.com/RuiZhang97/ISNet\nNUDT-SIRST\nhttps://github.com/YeRen123455/Infrared-Small-Target-Detection',experiments:'摘要确认使用三个数据集。具体训练设置、对比方法和消融实验需补充实验章节证据。',provenance:source},
  {id:'arxiv:2408.00714',label:'SAM 2',title:'SAM 2: Segment Anything in Images and Videos',kind:'paper',year:2024,arxiv:'2408.00714',url:'https://arxiv.org/abs/2408.00714',x:260,y:185},
  {id:'arxiv:2312.00752',label:'Mamba',title:'Mamba: Linear-Time Sequence Modeling with Selective State Spaces',kind:'paper',year:2023,arxiv:'2312.00752',url:'https://arxiv.org/abs/2312.00752',x:730,y:195},
  {id:'field:istd',label:'ISTD',title:'红外小目标检测 · Infrared Small Target Detection',kind:'field',x:495,y:100},
  {id:'method:fs-adapter',label:'FS-Adapter',title:'Feature Selection Adapter',kind:'method',x:220,y:355},
  {id:'method:csi',label:'CSI',title:'Cross-Channel State-Space Interaction',kind:'method',x:785,y:350},
  {id:'method:dpcf',label:'DPCF',title:'Detail-Preserving Contextual Fusion',kind:'method',x:520,y:560},
  {id:'dataset:nuaa-sirst',label:'NUAA-SIRST',title:'NUAA-SIRST',kind:'dataset',url:'https://github.com/YimianDai/sirst',summary:'作者使用 SIRST 作为正式名称；部分论文称 NUAA-SIRST。',x:195,y:540},
  {id:'dataset:irstd-1k',label:'IRSTD-1k',title:'IRSTD-1k',kind:'dataset',url:'https://github.com/RuiZhang97/ISNet',x:335,y:650},
  {id:'dataset:nudt-sirst',label:'NUDT-SIRST',title:'NUDT-SIRST',kind:'dataset',url:'https://github.com/YeRen123455/Infrared-Small-Target-Detection',x:790,y:560},
 ],
 edges:[
  edge('arxiv:2408.00714','使用方法',"integrating SAM2's hierarchical feature learning with Mamba's selective sequence modeling"),
  edge('arxiv:2312.00752','使用方法',"integrating SAM2's hierarchical feature learning with Mamba's selective sequence modeling"),
  edge('field:istd','研究领域','Infrared small target detection (ISTD)'),
  edge('method:fs-adapter','提出模块','A Feature Selection Adapter (FS-Adapter)'),
  edge('method:csi','提出模块','A Cross-Channel State-Space Interaction (CSI) module'),
  edge('method:dpcf','提出模块','A Detail-Preserving Contextual Fusion (DPCF) module'),
  ...['nuaa-sirst','irstd-1k','nudt-sirst'].map(s=>edge('dataset:'+s,'实验数据集','Experiments on NUAA-SIRST, IRSTD-1k, and NUDT-SIRST datasets'))
 ]
};
