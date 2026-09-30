const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
loadEnv(path.join(ROOT, '.env.local'));
loadEnv(path.join(ROOT, '.env'));
const PORT = Number(process.env.PORT || 3000);
const OPENALEX = 'https://api.openalex.org';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const sourceCache = new Map();
const CCF_AI_URL = 'https://www.ccf.org.cn/Academic_Evaluation/AI/';
const CCF_AI_VENUES = [
  { tier: 'A', aliases: ['AAAI Conference on Artificial Intelligence', 'AAAI'], conference: true },
  { tier: 'A', aliases: ['Conference on Neural Information Processing Systems', 'NeurIPS', 'NIPS'], conference: true },
  { tier: 'A', aliases: ['Annual Meeting of the Association for Computational Linguistics', 'ACL'], conference: true },
  { tier: 'A', aliases: ['IEEE/CVF Computer Vision and Pattern Recognition', 'Computer Vision and Pattern Recognition', 'CVPR'], conference: true },
  { tier: 'A', aliases: ['International Conference on Computer Vision', 'ICCV'], conference: true },
  { tier: 'A', aliases: ['International Conference on Machine Learning', 'ICML'], conference: true },
  { tier: 'A', aliases: ['International Joint Conference on Artificial Intelligence', 'IJCAI'], conference: true },
  { tier: 'A', aliases: ['IEEE Transactions on Pattern Analysis and Machine Intelligence', 'TPAMI'], conference: false },
  { tier: 'A', aliases: ['International Journal of Computer Vision', 'IJCV'], conference: false },
  { tier: 'A', aliases: ['Journal of Machine Learning Research', 'JMLR'], conference: false },
  { tier: 'B', aliases: ['Empirical Methods in Natural Language Processing', 'EMNLP'], conference: true },
  { tier: 'B', aliases: ['European Conference on Computer Vision', 'ECCV'], conference: true },
  { tier: 'B', aliases: ['European Conference on Artificial Intelligence', 'ECAI'], conference: true },
  { tier: 'B', aliases: ['Conference on Learning Theory', 'COLT'], conference: true },
  { tier: 'B', aliases: ['International Conference on Robotics and Automation', 'ICRA'], conference: true },
  { tier: 'B', aliases: ['International Conference on Automated Planning and Scheduling', 'ICAPS'], conference: true },
  { tier: 'B', aliases: ['Journal of Artificial Intelligence Research', 'JAIR'], conference: false },
  { tier: 'B', aliases: ['Machine Learning'], conference: false },
  { tier: 'B', aliases: ['Neural Computation'], conference: false },
  { tier: 'B', aliases: ['Neural Networks'], conference: false },
  { tier: 'B', aliases: ['IEEE Transactions on Neural Networks and Learning Systems', 'TNNLS'], conference: false },
  { tier: 'B', aliases: ['Pattern Recognition'], conference: false },
  { tier: 'C', aliases: ['Artificial Intelligence and Statistics', 'AISTATS'], conference: true },
  { tier: 'C', aliases: ['Asian Conference on Computer Vision', 'ACCV'], conference: true },
  { tier: 'C', aliases: ['Asian Conference on Machine Learning', 'ACML'], conference: true },
  { tier: 'C', aliases: ['British Machine Vision Conference', 'BMVC'], conference: true },
  { tier: 'C', aliases: ['Conference on Computational Natural Language Learning', 'CoNLL'], conference: true },
  { tier: 'C', aliases: ['Knowledge-Based Systems', 'KBS'], conference: false },
  { tier: 'C', aliases: ['Neurocomputing'], conference: false },
  { tier: 'C', aliases: ['Pattern Recognition Letters', 'PRL'], conference: false },
  { tier: 'C', aliases: ['Expert Systems with Applications', 'ESWA'], conference: false }
];

class SourceError extends Error {
  constructor(host, status, retryAfter, cause) {
    super(status ? `${host} returned ${status}` : `${host} connection failed`, { cause });
    this.host = host;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function loadEnv(file) {
  try {
    const contents = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* optional local env file */ }
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function abstractFrom(index) {
  if (!index) return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) for (const pos of positions) words[pos] = word;
  return words.join(' ').replace(/\s+([,.;:!?])/g, '$1');
}
function normalizeWork(work) {
  const sourceInfo = work.primary_location?.source;
  const source = sourceInfo?.display_name;
  return {
    id: String(work.id || '').split('/').pop(),
    openAlexId: String(work.id || '').split('/').pop(),
    title: work.display_name || '',
    year: work.publication_year || null,
    venue: source || '',
    venueType: sourceInfo?.type || '',
    venueIssn: sourceInfo?.issn_l || sourceInfo?.issn?.[0] || '',
    doi: work.doi || '',
    url: work.doi || work.primary_location?.landing_page_url || work.id || '',
    authors: (work.authorships || []).map(a => a.author?.display_name).filter(Boolean),
    citedBy: work.cited_by_count || 0,
    abstract: abstractFrom(work.abstract_inverted_index).slice(0, 1400),
    referenceIds: work.referenced_works || [],
    relatedWorkIds: work.related_works || []
  };
}
function getVenueRanking(venue) {
  const value = String(venue || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!value) return [];
  const matches = CCF_AI_VENUES.flatMap(entry => entry.aliases.filter(alias => {
    const needle = alias.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (needle.length <= 5) return (` ${value} `).includes(` ${needle} `);
    return value.includes(needle);
  }).map(alias => ({ entry, alias }))).sort((a, b) => b.alias.length - a.alias.length);
  const match = matches[0]?.entry;
  return match ? [{ scheme: 'CCF 推荐目录', tier: `CCF-${match.tier}`, edition: '第七版（2026），人工智能领域', url: CCF_AI_URL, note: match.conference ? '会议类别；以正式长文收录为准' : '期刊类别' }] : [];
}
function getCasJournalDivision(paper) {
  const venue = String(paper.venue || '').trim();
  const normalized = venue.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const sourceType = String(paper.venueType || '').toLowerCase();
  const officialUrl = 'https://www.fenqubiao.com/';
  const bookOrProceedings = /algorithms for intelligent systems|book series|conference proceedings|proceedings of/.test(normalized)
    || sourceType.includes('book') || sourceType.includes('conference');
  if (bookOrProceedings) {
    const sourceUrl = normalized.includes('algorithms for intelligent systems') ? 'https://link.springer.com/series/16171' : paper.url;
    return { applicable: false, label: '不适用（图书系列 / 会议论文集）', edition: '', url: '', sourceUrl, note: '中科院分区表是期刊分区；该出版物属于图书系列或会议论文集，不应标为一区/二区。' };
  }
  if (!venue || (sourceType && !sourceType.includes('journal'))) {
    return { applicable: null, label: '刊物类型未确认', edition: '', url: officialUrl, note: '当前元数据不足以确认它是期刊。请先核对正式出版页，再判断是否适用中科院期刊分区。' };
  }
  return {
    applicable: true,
    label: '请在官方平台按刊名或 ISSN 核对',
    edition: '最新可查 2025 版',
    url: officialUrl,
    note: `中科院文献情报中心自 2026 年起停止更新期刊分区表；当前最新年度为 2025。${paper.venueIssn ? ` ISSN：${paper.venueIssn}。` : ''}系统不伪填未核实的一区/二区。`
  };
}
async function fetchJSON(url, options = {}) {
  const key = String(url);
  const cached = sourceCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const host = new URL(url).host;
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(18000), headers: { 'User-Agent': 'Paperline/1.0 (academic paper discovery app)', ...(options.headers || {}) } });
      break;
    } catch (error) {
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      throw new SourceError(host, 0, null, error);
    }
  }
  if (!response.ok) throw new SourceError(host, response.status, response.headers.get('retry-after'));
  const data = await response.json();
  sourceCache.set(key, { data, expires: Date.now() + 6 * 60 * 60 * 1000 });
  return data;
}
async function openAlexWorks(params) {
  const url = new URL(`${OPENALEX}/works`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (process.env.OPENALEX_API_KEY) url.searchParams.set('api_key', process.env.OPENALEX_API_KEY);
  const data = await fetchJSON(url);
  return (data.results || []).map(normalizeWork);
}
function tokenSimilarity(a, b) {
  const tokens = value => new Set(value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(x => x.length > 1));
  const left = tokens(a), right = tokens(b);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.max(left.size, right.size, 1);
}
async function findTarget(title) {
  const candidates = await openAlexWorks({ search: title, 'per-page': '10', select: 'id,doi,display_name,publication_year,authorships,primary_location,referenced_works,related_works,cited_by_count,abstract_inverted_index' });
  if (!candidates.length) return null;
  return candidates.map(p => ({ paper: p, score: tokenSimilarity(title, p.title) })).sort((a, b) => b.score - a.score || b.paper.citedBy - a.paper.citedBy)[0].paper;
}
async function getGithubRepos(title, target) {
  const terms = [title, target.title].filter(Boolean).map(s => `"${s}"`).slice(0, 2);
  const searches = await Promise.allSettled(terms.map(q => fetchJSON(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=6`, { headers: { Accept: 'application/vnd.github+json' } })));
  const seen = new Set();
  const repos = [];
  for (const result of searches) {
    if (result.status !== 'fulfilled') continue;
    for (const repo of result.value.items || []) {
      if (!repo.html_url || seen.has(repo.html_url)) continue;
      seen.add(repo.html_url);
      repos.push({ id: repo.full_name, name: repo.full_name, url: repo.html_url, description: repo.description || '', stars: repo.stargazers_count || 0, language: repo.language || '' });
    }
  }
  return repos.sort((a, b) => b.stars - a.stars).slice(0, 10);
}
function clipPaper(p) {
  return { id: p.id, title: p.title, year: p.year, venue: p.venue, doi: p.doi, url: p.url, authors: p.authors.slice(0, 4), citedBy: p.citedBy, abstract: p.abstract.slice(0, 600), evidence: p.evidence || '' };
}
async function callDeepSeek(title, target, references, followCandidates, relatedCandidates, repositories) {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('服务端尚未配置 DeepSeek API Key。请在项目目录创建 .env.local 并设置 DEEPSEEK_API_KEY。');
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
  const systemPrompt = '你是严谨但不苛求直接引用证据的学术文献整理助手。请根据输入候选输出有效 JSON，不能编造论文、年份、关系或链接。followCandidates 可能来自直接引用记录、OpenAlex 相关论文或标题关键词检索；relatedCandidates 还可能包含同一研究任务的经典/同期方法。请积极挑选有帮助的后续、同任务或可比较方法，即使候选没有被目标论文直接引用，也要纳入并标注为“同任务方法”“同期方法”“系列演进”等；绝不能把相似任务说成目标论文的引用或实验基线。关键词命中本身不等于直接引用，关系待核时在 reason 中直说。优先考虑任务接近、方法有代表性、年份较新或被引较多的候选。followups 最多5项；graphNodes 最多10项，尽量包含最多2个 baseline、4个 same_problem、4个 followup。字段：baselineIds（最多2个，只能来自 references），baselineReasons（id到原因），followups（每项 id/relation/reason，只能来自 followCandidates），graphNodes（每项 id/kind/relation/reason；kind 只能 baseline、same_problem、followup；baseline 只能来自 references，same_problem 只能来自 relatedCandidates，followup 只能来自 followCandidates），code（最多4项，只能来自 repositories；type 只能 official 或 reproduction），caveat。代码仓库缺少作者/论文归属证据时标为 reproduction，并注明归属待核。没有相关候选时才返回空数组。格式示例：{"baselineIds":[],"baselineReasons":{},"followups":[],"graphNodes":[],"code":[],"caveat":""}。只返回 JSON，不要 Markdown 或解释。';
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify({ requestedTitle: title, target: clipPaper(target), references: references.slice(0, 24).map(clipPaper), followCandidates: followCandidates.slice(0, 36).map(clipPaper), relatedCandidates: relatedCandidates.slice(0, 12).map(clipPaper), repositories: repositories.slice(0, 8) }) }
  ];
  let lastIssue = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await fetch(DEEPSEEK_URL, {
        method: 'POST', signal: AbortSignal.timeout(90000),
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, thinking: { type: 'disabled' }, ...(attempt === 0 ? { response_format: { type: 'json_object' } } : {}), temperature: 0.1, max_tokens: 6000 })
      });
    } catch (error) {
      throw new Error(`无法连接 DeepSeek API（${error.cause?.code || error.message}）。请检查运行网页的电脑网络、代理设置，或稍后重试。`);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || `DeepSeek API 返回 ${response.status}`);
    const choice = body.choices?.[0];
    const content = String(choice?.message?.content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    if (content) {
      try { return JSON.parse(content); }
      catch { lastIssue = '返回内容不是有效 JSON'; }
    } else {
      lastIssue = choice?.finish_reason === 'length' ? '输出达到 token 上限' : '返回了空内容';
    }
    if (attempt === 0) messages.push({ role: 'user', content: '上一次输出无法解析。请现在直接按给定字段重新输出完整 JSON；允许缩短说明文字，但保持字段和候选 ID 有效。' });
  }
  throw new Error(`DeepSeek ${lastIssue}，重试后仍未返回整理结果。请稍后重试。`);
}
function publicPaper(p, reason, relation) {
  return { id: p.id, openAlexId: p.openAlexId || p.id, title: p.title, year: p.year, venue: p.venue, venueType: p.venueType || '', venueIssn: p.venueIssn || '', doi: p.doi, url: p.url, authors: p.authors.slice(0, 4), citedBy: p.citedBy, reason: reason || '', relation: relation || '', evidence: p.evidence || '', sourceLabel: p.sourceLabel || '' };
}
function curatedSpikeYoloRelations(query, target) {
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const requested = normalize(query);
  const resolved = normalize(target.title);
  const isSpikeYolo = requested.includes('spikeyolo') || resolved.includes('integervaluedtrainingandspikedriveninferencespikingneuralnetworkforhighperformanceandenergyefficientobjectdetection');
  if (!isSpikeYolo) return [];
  const source = 'https://www.ecva.net/papers/eccv_2024/papers_ECCV/papers/04704.pdf';
  return [
    { id: 'curated:spikeyolo:yolov8', title: 'YOLOv8', year: 2023, venue: 'Ultralytics', url: 'https://docs.ultralytics.com/models/yolov8/', authors: [], citedBy: 0, relation: '宏观架构来源', reason: 'SpikeYOLO 原文说明保留 YOLOv8 的 Backbone/Neck/Head 宏观架构；表 2 还将 YOLOv8 与 Spiking YOLOv8 用于架构消融对照。来源：' + source },
    { id: 'curated:spikeyolo:meta-spikeformer', title: 'Meta-SpikeFormer（Spike-driven Transformer V2）', year: 2024, venue: 'ICLR', url: 'https://proceedings.iclr.cc/paper_files/paper/2024/hash/e9882f7f7c44a10acc01132302bac9d8-Abstract-Conference.html', authors: ['Man Yao', 'Jiakui Hu', 'Tianxiang Hu', 'Yifan Xu'], citedBy: 0, relation: '微观模块来源 / 对比方法', reason: 'SpikeYOLO 原文明确将其 meta SNN block 用于微观设计，并在 COCO 表 1 中列出 Meta-SpikeFormer（YOLO）作为对比方法。来源：' + source },
    { id: 'curated:spikeyolo:spiking-yolo', title: 'Spiking-YOLO: Spiking Neural Network for Energy-Efficient Object Detection', year: 2020, venue: 'AAAI', url: 'https://ojs.aaai.org/index.php/AAAI/article/view/6787', authors: ['Seijoon Kim', 'Seongsik Park', 'Byunggook Na', 'Sungroh Yoon'], citedBy: 0, relation: '早期 SNN 检测基线', reason: 'SpikeYOLO 原文将其作为早期深度 SNN 目标检测工作介绍，并在 COCO 与 Gen1 结果表中进行对比。来源：' + source },
    { id: 'curated:spikeyolo:ems-yolo', title: 'Deep Directly-Trained Spiking Neural Networks for Object Detection（EMS-YOLO）', year: 2023, venue: 'ICCV', url: 'https://openaccess.thecvf.com/content/ICCV2023/html/Su_Deep_Directly-Trained_Spiking_Neural_Networks_for_Object_Detection_ICCV_2023_paper.html', authors: ['Qiaoyi Su', 'Yuhong Chou', 'Yifan Hu', 'Jianing Li'], citedBy: 0, relation: '直接训练 SNN 对比方法', reason: 'SpikeYOLO 原文将 EMS-YOLO 列为直接训练的 SNN 目标检测前作，并在 COCO 与 Gen1 表格中进行性能对比。来源：' + source },
    { id: 'curated:spikeyolo:yolov5', title: 'YOLOv5', year: null, venue: 'Ultralytics', url: 'https://github.com/ultralytics/yolov5', authors: [], citedBy: 0, relation: 'ANN 性能参照', reason: 'SpikeYOLO 原文的 COCO 表 1 和结果讨论将 YOLOv5 作为 ANN 目标检测性能参照；它不是 SpikeYOLO 的 SNN 架构来源。来源：' + source }
  ];
}
function curatedYolo5VersionRelations(query, target) {
  const searchable = `${query || ''} ${target.title || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!searchable.includes('yolov5')) return [];
  return [
    { id: 'curated:yolo5:yolov8', title: 'YOLOv8', year: 2023, venue: 'Ultralytics', url: 'https://docs.ultralytics.com/models/yolov8/', authors: [], citedBy: 0, relation: '同项目后续版本（非本文直接引用）', reason: 'Ultralytics 官方文档将 YOLOv8 作为较新的 YOLO 版本介绍；可作为 YOLOv5 方法演进的后续参考。它不表示目标安全帽论文直接引用了 YOLOv8。', evidence: 'Ultralytics 官方模型文档', sourceLabel: '查看官方模型说明' },
    { id: 'curated:yolo5:yolo11', title: 'YOLO11', year: 2024, venue: 'Ultralytics', url: 'https://docs.ultralytics.com/models/yolo11/', authors: [], citedBy: 0, relation: '同项目后续版本（非本文直接引用）', reason: 'Ultralytics 将 YOLO11 列入后续模型系列；这里作为方法版本脉络展示，不代表目标论文引用或使用了 YOLO11。', evidence: 'Ultralytics 官方模型文档', sourceLabel: '查看官方模型说明' },
    { id: 'curated:yolo5:yolo26', title: 'YOLO26', year: 2026, venue: 'Ultralytics', url: 'https://docs.ultralytics.com/models/yolo26/', authors: [], citedBy: 0, relation: '同项目后续版本（非本文直接引用）', reason: 'Ultralytics 官方文档列出 YOLO26 作为更新的模型系列；作为方法脉络参考，不表示目标论文引用或采用了该版本。', evidence: 'Ultralytics 官方模型文档', sourceLabel: '查看官方模型说明' }
  ];
}
function curatedObjectDetectionWorks(query, target) {
  const searchable = `${query || ''} ${target.title || ''} ${target.abstract || ''}`.toLowerCase();
  const isObjectDetection = /yolo|object detection|object detector|helmet detection|traffic sign detection|目标检测|物体检测/.test(searchable);
  if (!isObjectDetection) return [];
  const relation = '同任务目标检测方法（非目标论文引用）';
  return [
    { id: 'curated:det:deformable-detr', title: 'Deformable DETR: Deformable Transformers for End-to-End Object Detection', year: 2021, venue: 'ICLR', url: 'https://openreview.net/forum?id=gZ9hCDWe6ke', authors: ['Xizhou Zhu', 'Weijie Su', 'Lewei Lu', 'Bin Li'], citedBy: 0, relation, reason: '端到端 Transformer 检测器；论文针对 DETR 收敛慢和小目标表现等问题改进，适合与安全帽等小目标检测方法作同任务比较。此处是任务相近参考，不表示目标论文引用它。', evidence: 'ICLR 2021 原论文', sourceLabel: '查看论文来源' },
    { id: 'curated:det:detr', title: 'End-to-End Object Detection with Transformers (DETR)', year: 2020, venue: 'ECCV', url: 'https://arxiv.org/abs/2005.12872', authors: ['Nicolas Carion', 'Francisco Massa', 'Gabriel Synnaeve', 'Nicolas Usunier'], citedBy: 0, relation, reason: '代表性的端到端 Transformer 目标检测方法，可作为 YOLO 系列的不同技术路线参照；不表示目标论文引用或使用了 DETR。', evidence: 'ECCV 2020 原论文', sourceLabel: '查看论文来源' },
    { id: 'curated:det:rtdetr', title: 'DETRs Beat YOLOs on Real-time Object Detection (RT-DETR)', year: 2024, venue: 'CVPR', url: 'https://arxiv.org/abs/2304.08069', authors: ['Yian Zhao', 'Wenyu Lv', 'Shangliang Xu', 'Jinman Wei'], citedBy: 0, relation, reason: '实时端到端 DETR 检测器，论文直接比较了 DETR 与 YOLO 系列的速度和精度；可作为同任务、不同路线的对照参考，不代表目标论文引用它。', evidence: 'CVPR 2024 原论文', sourceLabel: '查看论文来源' },
    { id: 'curated:det:yolov10', title: 'YOLOv10: Real-Time End-to-End Object Detection', year: 2024, venue: 'NeurIPS', url: 'https://proceedings.neurips.cc/paper_files/paper/2024/file/c34ddd05eb089991f06f3c5dc36836e0-Paper-Conference.pdf', authors: ['Ao Wang', 'Hui Chen', 'Lihao Liu', 'Kai Chen'], citedBy: 0, relation: 'YOLO 系列后续方法（非目标论文引用）', reason: '较新的 YOLO 系列实时检测方法，可用于了解 YOLOv5 之后的检测器设计演进；不表示目标论文引用或采用 YOLOv10。', evidence: 'NeurIPS 2024 原论文', sourceLabel: '查看论文来源' },
    { id: 'curated:det:faster-rcnn', title: 'Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks', year: 2015, venue: 'NeurIPS', url: 'https://arxiv.org/abs/1506.01497', authors: ['Shaoqing Ren', 'Kaiming He', 'Ross Girshick', 'Jian Sun'], citedBy: 0, relation, reason: '经典两阶段目标检测方法，可作为 YOLO 单阶段检测路线的基础比较参照；不表示目标论文引用它。', evidence: 'NeurIPS 2015 原论文', sourceLabel: '查看论文来源' }
  ];
}
async function research(title) {
  let target;
  try {
    target = await findTarget(title);
  } catch (error) {
    if (error instanceof SourceError && error.host === 'api.openalex.org') {
      if (error.status === 429) throw new Error('OpenAlex 检索额度已用完或触发限流。请在 .env.local 中添加免费的 OPENALEX_API_KEY，然后重启网页服务；DeepSeek API Key 不能替代它。');
      if (!error.status) throw new Error(`无法连接 OpenAlex（${error.cause?.cause?.code || error.cause?.message || '网络连接失败'}）。请检查运行网页的电脑网络、代理或 DNS，然后重试。`);
    }
    throw error;
  }
  if (!target) throw new Error('没有在 OpenAlex 中匹配到论文。请检查标题或尝试论文的英文全名。');
  const refIds = target.referenceIds.slice(0, 36).map(id => id.split('/').pop());
  const relatedIds = target.relatedWorkIds.slice(0, 16).map(id => id.split('/').pop());
  const curatedRelated = curatedObjectDetectionWorks(title, target).map(p => ({ ...p, openAlexId: p.id }));
  const refPromise = refIds.length ? openAlexWorks({ filter: `openalex:${refIds.join('|')}`, 'per-page': String(refIds.length), select: 'id,doi,display_name,publication_year,authorships,primary_location,cited_by_count,abstract_inverted_index' }) : Promise.resolve([]);
  const citePromise = openAlexWorks({ filter: `cites:${target.id}`, sort: '-cited_by_count', 'per-page': '40', select: 'id,doi,display_name,publication_year,authorships,primary_location,cited_by_count,abstract_inverted_index' });
  const relatedPromise = relatedIds.length ? openAlexWorks({ filter: `openalex:${relatedIds.join('|')}`, 'per-page': String(relatedIds.length), select: 'id,doi,display_name,publication_year,authorships,primary_location,cited_by_count,abstract_inverted_index' }) : Promise.resolve([]);
  const discoveryQuery = title.length <= 100 ? title : target.title.slice(0, 100);
  const searchPromise = openAlexWorks({ search: discoveryQuery, sort: '-cited_by_count', 'per-page': '40', select: 'id,doi,display_name,publication_year,authorships,primary_location,cited_by_count,abstract_inverted_index' });
  const detectorSearchPromise = curatedRelated.length ? openAlexWorks({ search: 'object detection', sort: '-cited_by_count', 'per-page': '40', select: 'id,doi,display_name,publication_year,authorships,primary_location,cited_by_count,abstract_inverted_index' }) : Promise.resolve([]);
  const codePromise = getGithubRepos(title, target);
  const [refsResult, citesResult, relatedResult, searchResult, detectorResult, codeResult] = await Promise.allSettled([refPromise, citePromise, relatedPromise, searchPromise, detectorSearchPromise, codePromise]);
  const refs = refsResult.status === 'fulfilled' ? refsResult.value : [];
  const citing = citesResult.status === 'fulfilled' ? citesResult.value : [];
  const related = relatedResult.status === 'fulfilled' ? relatedResult.value : [];
  const searched = searchResult.status === 'fulfilled' ? searchResult.value : [];
  const detectorSearched = detectorResult.status === 'fulfilled' ? detectorResult.value : [];
  const repositories = codeResult.status === 'fulfilled' ? codeResult.value : [];
  const relatedById = new Map();
  for (const [papers, evidence] of [[related.slice(0, 8), 'OpenAlex 相关论文候选'], [detectorSearched.slice(0, 24), '目标检测方向关键词检索']]) {
    for (const paper of papers) {
      if (paper.id === target.id || relatedById.has(paper.id)) continue;
      relatedById.set(paper.id, { ...paper, evidence });
    }
  }
  const relatedCandidates = [...relatedById.values()];
  const followById = new Map();
  for (const [papers, evidence] of [[citing.slice(0, 12), 'OpenAlex 直接引用记录'], [related.slice(0, 8), 'OpenAlex 相关论文候选'], [searched.slice(0, 16), '标题关键词检索（未确认直接引用）']]) {
    for (const paper of papers) {
      if (paper.id === target.id || followById.has(paper.id)) continue;
      followById.set(paper.id, { ...paper, evidence });
    }
  }
  const followCandidates = [...followById.values()].sort((a, b) => {
    const sourceRank = p => p.evidence === 'OpenAlex 直接引用记录' ? 2 : p.evidence === 'OpenAlex 相关论文候选' ? 1 : 0;
    return sourceRank(b) - sourceRank(a) || b.citedBy - a.citedBy;
  });
  const analysis = await callDeepSeek(title, target, refs, followCandidates, relatedCandidates, repositories);
  const refsById = new Map(refs.map(p => [p.id, p]));
  const citesById = new Map(followCandidates.map(p => [p.id, p]));
  const reposById = new Map(repositories.map(r => [r.id, r]));
  const curatedBaselines = curatedSpikeYoloRelations(title, target).map(p => ({ ...p, openAlexId: p.id }));
  const inferredBaselines = curatedBaselines.length ? [] : (analysis.baselineIds || []).slice(0, 2).map(id => refsById.get(id)).filter(Boolean)
    .map(p => publicPaper(p, analysis.baselineReasons?.[p.id], '论文引用中的基线'));
  const baselines = [...curatedBaselines, ...inferredBaselines];
  let followups = (analysis.followups || []).slice(0, 5).map(item => {
    const paper = citesById.get(item.id);
    return paper ? { ...publicPaper(paper, item.reason, item.relation || '相关工作'), evidence: paper.evidence } : null;
  }).filter(Boolean);
  if (!followups.length) {
    const normalizedQuery = title.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (normalizedQuery.length >= 4) {
      followups = searched.filter(p => p.id !== target.id && (!target.year || !p.year || p.year > target.year))
        .filter(p => `${p.title} ${p.abstract}`.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(normalizedQuery))
        .sort((a, b) => (b.year || 0) - (a.year || 0) || b.citedBy - a.citedBy)
        .slice(0, 5)
        .map(p => ({ ...publicPaper(p, `标题或摘要提及“${title}”；可能是后续采用、扩展或对比工作，具体关系待核。`, '关键词提及（关系待核）'), evidence: 'OpenAlex 标题关键词检索' }));
    }
  }
  const yoloVersionFollowups = curatedYolo5VersionRelations(title, target).map(p => ({ ...p, openAlexId: p.id }));
  if (yoloVersionFollowups.length) {
    const curatedTitleKeys = new Set(yoloVersionFollowups.map(p => p.title.toLowerCase().replace(/[^a-z0-9]+/g, '')));
    const uniqueFollowups = followups.filter(p => !curatedTitleKeys.has(p.title.toLowerCase().replace(/[^a-z0-9]+/g, '')));
    followups = [...yoloVersionFollowups, ...uniqueFollowups].slice(0, 5);
  }
  const graphNodes = (analysis.graphNodes || []).slice(0, 10).map(item => {
    const group = item.kind === 'baseline' ? refsById : item.kind === 'same_problem' ? relatedById : item.kind === 'followup' ? citesById : null;
    const paper = group?.get(item.id);
    return paper ? { id: paper.id, kind: item.kind, relation: String(item.relation || '').slice(0, 40), reason: String(item.reason || '').slice(0, 220), paper: publicPaper(paper) } : null;
  }).filter(Boolean);
  const curatedRelatedCards = curatedRelated.map(p => publicPaper(p, p.reason, p.relation));
  const modelRelatedCards = graphNodes.filter(item => item.kind === 'same_problem').map(item => ({ ...publicPaper(item.paper, item.reason, item.relation), evidence: relatedById.get(item.id)?.evidence || 'OpenAlex 相关论文候选' }));
  const seenRelatedTitles = new Set();
  const relatedWorks = [...curatedRelatedCards, ...modelRelatedCards].filter(p => {
    const key = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (seenRelatedTitles.has(key)) return false;
    seenRelatedTitles.add(key);
    return true;
  }).slice(0, 8);
  const curatedGraphNodes = curatedRelatedCards.map(p => ({ id: p.id, kind: 'same_problem', relation: p.relation, reason: p.reason, paper: p }));
  const combinedGraphNodes = [...curatedGraphNodes, ...graphNodes].filter((item, index, array) => array.findIndex(other => other.id === item.id) === index).slice(0, 10);
  const code = (analysis.code || []).slice(0, 4).map(item => {
    const repo = reposById.get(item.id);
    return repo ? { name: repo.name, url: repo.url, description: item.description || repo.description, type: item.type === 'official' ? 'official' : 'reproduction', stars: repo.stars } : null;
  }).filter(Boolean);
  let caveat = analysis.caveat || '';
  if (refsResult.status === 'rejected' || citesResult.status === 'rejected' || relatedResult.status === 'rejected' || searchResult.status === 'rejected' || detectorResult.status === 'rejected') caveat += ' 部分 OpenAlex 引用/相关论文/关键词检索请求失败；当前结果可能不完整。';
  if (curatedBaselines.length) caveat += ' SpikeYOLO 的架构来源与实验对比方法依据 ECCV 原文及结果表整理，关系标签已分别标注。';
  if (yoloVersionFollowups.length) caveat += ' YOLO 系列的后续版本来自 Ultralytics 官方模型文档，表示方法版本脉络，不等同于目标论文直接引用。';
  caveat += ' OpenAlex 元数据和摘要不总包含实验对比原文；请点开论文核实 baseline 关系。GitHub 候选的官方归属尚需核对原文/作者主页。';
  const venueRankings = getVenueRanking(target.venue);
  return { target: { ...publicPaper(target), openAlexId: target.id, venueRankings, venueRankingNote: venueRankings.length ? '' : '未在当前核实的 CCF 人工智能目录中匹配到；这不代表该刊会没有其他分区或级别。', casJournalDivision: getCasJournalDivision(target) }, baselines, followups, relatedWorks, code, graphNodes: combinedGraphNodes, caveat };
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20000) throw new Error('请求内容过长。');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { configured: Boolean(process.env.DEEPSEEK_API_KEY), openAlexConfigured: Boolean(process.env.OPENALEX_API_KEY), model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro' });
  if (req.method === 'POST' && url.pathname === '/api/research') {
    try {
      const body = await readBody(req);
      const title = String(body.title || '').trim().slice(0, 300);
      if (title.length < 2) return json(res, 400, { error: '请输入有效的论文标题。' });
      const result = await research(title);
      return json(res, 200, result);
    } catch (error) {
      console.error('Research request failed:', error.message, error.host ? `(${error.host}, HTTP ${error.status || 'network'})` : '', error.cause?.cause?.code || error.cause?.message || '');
      const status = error.message.includes('尚未配置') ? 503 : 502;
      return json(res, status, { error: error.message || '检索服务暂时不可用。' });
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
  const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT + path.sep) || !['index.html', 'styles.css', 'app.js'].includes(path.basename(file))) return json(res, 404, { error: 'Not found' });
  fs.readFile(file, (error, contents) => {
    if (error) return json(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; img-src 'self' data:; connect-src 'self'" });
    res.end(contents);
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`Paperline running at http://localhost:${PORT}`));

