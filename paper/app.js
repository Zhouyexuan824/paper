const form = document.querySelector('#search-form');
const titleInput = document.querySelector('#paper-title');
const searchButton = document.querySelector('#search-button');
const progress = document.querySelector('#progress');
const progressText = document.querySelector('#progress-text');
const results = document.querySelector('#results');
const toast = document.querySelector('#toast');

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function paperCard(paper, index, kind) {
  const title = escapeHTML(paper.title || 'Untitled');
  const authors = escapeHTML((paper.authors || []).slice(0, 3).join(', '));
  const venue = escapeHTML([paper.year, paper.venue].filter(Boolean).join(' · '));
  const relation = escapeHTML(paper.relation || '相关论文');
  const evidence = escapeHTML(paper.evidence || '');
  const reason = escapeHTML(paper.reason || paper.abstractSnippet || '');
  const url = /^https?:\/\//i.test(paper.url || '') ? paper.url : '#';
  return `<article class="paper-card"><div class="paper-index">${String(index + 1).padStart(2, '0')}</div><div class="paper-main"><div class="paper-meta"><span class="tag ${kind}">${relation}</span><span>${venue}</span>${paper.citedBy ? `<span>被引 ${paper.citedBy} 次</span>` : ''}${evidence ? `<span class="evidence-label">${evidence}</span>` : ''}</div><h3><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${title} <span class="external">↗</span></a></h3>${authors ? `<div class="paper-authors">${authors}</div>` : ''}<p>${reason}</p><div class="paper-foot"><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(paper.sourceLabel || '查看论文来源')} ↗</a>${paper.doi ? `<span>DOI ${escapeHTML(paper.doi.replace(/^https?:\/\/doi.org\//i, ''))}</span>` : ''}</div></div></article>`;
}
function wrapSvgText(text, maxChars, maxLines = 2) {
  const chars = Array.from(String(text || ''));
  const lines = [];
  while (chars.length && lines.length < maxLines) lines.push(chars.splice(0, maxChars).join(''));
  if (chars.length && lines.length) lines[lines.length - 1] = lines[lines.length - 1].slice(0, Math.max(1, maxChars - 1)) + '…';
  return lines;
}
function graphMarkup(data) {
  const target = data.target;
  const items = [...(data.graphNodes || [])];
  const seen = new Set(items.map(item => item.id));
  for (const paper of data.baselines || []) if (!seen.has(paper.openAlexId)) items.push({ id: paper.openAlexId, kind: 'baseline', relation: 'Baseline', paper });
  for (const paper of data.followups || []) if (!seen.has(paper.openAlexId)) items.push({ id: paper.openAlexId, kind: 'followup', relation: paper.relation, paper });
  const groups = {
    baseline: items.filter(item => item.kind === 'baseline').slice(0, 5),
    same_problem: items.filter(item => item.kind === 'same_problem').slice(0, 4),
    followup: items.filter(item => item.kind === 'followup').slice(0, 4)
  };
  const width = 1120, boxW = 220, boxH = 102, targetX = (width - boxW) / 2, targetY = 260;
  const positions = new Map([['target', { x: targetX, y: targetY }]]);
  const rowInfo = [
    ['baseline', groups.baseline, 46, '架构来源 / 实验对比'],
    ['same_problem', groups.same_problem, 445, '同一问题 / 相近方向'],
    ['followup', groups.followup, 610, '引用 / 后续工作']
  ];
  for (const [kind, nodes, y] of rowInfo) {
    const gap = (width - nodes.length * boxW) / (nodes.length + 1);
    nodes.forEach((node, index) => positions.set(node.id, { x: gap + index * (boxW + gap), y }));
  }
  const paths = [];
  for (const [kind, nodes] of Object.entries(groups)) for (const node of nodes) {
    const pos = positions.get(node.id);
    const sx = kind === 'baseline' ? pos.x + boxW / 2 : targetX + boxW / 2;
    const sy = kind === 'baseline' ? pos.y + boxH : targetY + boxH;
    const ex = kind === 'baseline' ? targetX + boxW / 2 : pos.x + boxW / 2;
    const ey = kind === 'baseline' ? targetY : pos.y;
    const color = kind === 'baseline' ? '#376fc1' : kind === 'same_problem' ? '#98a8be' : '#5b8bd0';
    const dash = kind === 'same_problem' ? ' stroke-dasharray="6 6"' : '';
    const marker = kind === 'same_problem' ? '' : ` marker-end="url(#arrow-${kind})"`;
    paths.push(`<path d="M ${sx} ${sy} C ${sx} ${(sy + ey) / 2}, ${ex} ${(sy + ey) / 2}, ${ex} ${ey}" fill="none" stroke="${color}" stroke-width="2"${dash}${marker}/>`);
  }
  function card(node, isTarget = false) {
    const p = isTarget ? target : node.paper;
    const pos = isTarget ? { x: targetX, y: targetY } : positions.get(node.id);
    const fill = isTarget ? '#eaf2ff' : node.kind === 'baseline' ? '#f1f6ff' : node.kind === 'same_problem' ? '#f6f8fc' : '#edf5ff';
    const stroke = isTarget ? '#79a2e1' : node.kind === 'baseline' ? '#a9c3eb' : node.kind === 'same_problem' ? '#c9d3e2' : '#a9c8eb';
    const badge = isTarget ? '目标论文' : escapeHTML(node.relation || ({ baseline: 'Baseline', same_problem: '同一问题', followup: '后续引用' }[node.kind]));
    const title = wrapSvgText(p.title, 24, 2);
    const meta = [p.year, p.venue].filter(Boolean).join(' · ');
    const url = /^https?:\/\//i.test(p.url || '') ? p.url : '#';
    const titleSvg = title.map((line, i) => `<text class="graph-title" x="${pos.x + 14}" y="${pos.y + 47 + i * 18}">${escapeHTML(line)}</text>`).join('');
    return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer"><rect x="${pos.x}" y="${pos.y}" width="${boxW}" height="${boxH}" rx="11" fill="${fill}" stroke="${stroke}" stroke-width="${isTarget ? 2 : 1.4}"/><text class="graph-badge" x="${pos.x + 14}" y="${pos.y + 21}">${badge}</text>${titleSvg}<text class="graph-meta" x="${pos.x + 14}" y="${pos.y + 87}">${escapeHTML(meta.slice(0, 34))}</text></a>`;
  }
  const rowLabels = rowInfo.filter(([, nodes]) => nodes.length).map(([, , y, label]) => `<text class="graph-row-label" x="18" y="${y - 12}">${label}</text>`).join('');
  return `<div class="graph-frame"><svg class="paper-graph" viewBox="0 0 ${width} 744" role="img" aria-label="论文关系脉络图"><defs><marker id="arrow-baseline" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#376fc1"/></marker><marker id="arrow-followup" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#5b8bd0"/></marker></defs>${rowLabels}<text class="graph-row-label" x="18" y="${targetY - 13}">研究对象</text>${paths.join('')}${rowInfo.flatMap(([, nodes]) => nodes.map(node => card(node))).join('')}${card(null, true)}</svg></div>`;
}
function render(data) {
  const target = data.target;
  const baseline = data.baselines || [];
  const followups = data.followups || [];
  const relatedWorks = data.relatedWorks || [];
  const codes = data.code || [];
  const title = escapeHTML(target.title);
  const targetUrl = /^https?:\/\//i.test(target.url || '') ? target.url : '#';
  const targetMeta = escapeHTML(target.citedBy ? `被引 ${target.citedBy} 次` : '');
  const rankings = target.venueRankings || [];
  const casDivision = target.casJournalDivision || {};
  const sjrUrl = target.venue ? `https://www.scimagojr.com/journalsearch.php?q=${encodeURIComponent(target.venue)}` : '';
  results.innerHTML = `
    <div class="result-heading"><div><h2>检索结果</h2></div><button class="new-search" id="new-search">新搜索</button></div>
    <article class="target-card"><div class="target-label"><span>目标论文</span><span class="target-chip">已匹配</span></div><h2><a href="${escapeHTML(targetUrl)}" target="_blank" rel="noopener noreferrer">${title} ↗</a></h2>${targetMeta ? `<p>${targetMeta}</p>` : ''}${target.authors?.length ? `<div class="target-authors">${escapeHTML(target.authors.join(', '))}</div>` : ''}</article>
    <div class="section-heading"><div><span class="section-no">01</span><h3>核心 Baseline 与前置方法</h3></div><span class="section-caption">架构来源、同题前作和实验对比分别标注</span></div>
    ${baseline.length ? `<div class="paper-list">${baseline.map((p, i) => paperCard(p, i, 'baseline')).join('')}</div>` : `<div class="empty-state">目前没有足够证据确认具体 baseline。请从原文实验表进一步核对。</div>`}
    <div class="section-heading followup-head"><div><span class="section-no">02</span><h3>重要后续与相关工作</h3></div><span class="section-caption">直接引用、系列演进、同任务方法或对比</span></div>
    ${followups.length ? `<div class="paper-list">${followups.map((p, i) => paperCard(p, i, 'followup')).join('')}</div>` : `<div class="empty-state">暂未找到合适的后续或相关工作候选；可尝试论文全名、方法简称或核心关键词。</div>`}
    <div class="section-heading followup-head"><div><span class="section-no">03</span><h3>同期 / 同任务方法</h3></div><span class="section-caption">相似目标或不同技术路线；不代表目标论文直接引用</span></div>
    ${relatedWorks.length ? `<div class="paper-list">${relatedWorks.map((p, i) => paperCard(p, i, 'followup')).join('')}</div>` : `<div class="empty-state">暂未找到可核实的同期或同任务方法。</div>`}
    <div class="section-heading followup-head"><div><span class="section-no">04</span><h3>代码仓库</h3></div><span class="section-caption">作者实现优先</span></div>
    ${codes.length ? `<div class="code-grid">${codes.map(code => { const url = /^https?:\/\//i.test(code.url || '') ? code.url : '#'; return `<a class="code-card" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer"><div><span class="code-badge ${code.type === 'official' ? 'official' : ''}">${escapeHTML(code.type === 'official' ? 'OFFICIAL' : 'REPRODUCTION')}</span><span class="github-mark">⌘</span></div><strong>${escapeHTML(code.name)}</strong><p>${escapeHTML(code.description || '')}</p><span class="code-open">打开 GitHub ↗</span></a>`; }).join('')}</div>` : `<div class="empty-state">未检索到可验证的相关 GitHub 仓库。</div>`}
    <div class="section-heading followup-head"><div><span class="section-no">05</span><h3>刊会信息与级别</h3></div><span class="section-caption">级别注明体系和版本</span></div>
    <div class="venue-card"><div class="venue-year">${escapeHTML(target.year || '年份未收录')}</div><div class="venue-details"><strong>${escapeHTML(target.venue || '刊会名称未收录')}</strong><div class="rank-list">${rankings.length ? rankings.map(rank => `<a class="rank-chip" href="${escapeHTML(rank.url)}" target="_blank" rel="noopener noreferrer"><b>${escapeHTML(rank.tier)}</b><span>${escapeHTML(rank.edition)} ↗</span></a>`).join('') : `<span class="rank-unverified">CCF 等级暂未匹配</span>`}${target.venue && sjrUrl ? `<a class="rank-link" href="${escapeHTML(sjrUrl)}" target="_blank" rel="noopener noreferrer">查询 SCImago 分区 ↗</a>` : ''}</div><p>${escapeHTML(target.venueRankingNote || '级别适用于刊会，不代表单篇论文质量。')}</p><div class="cas-ranking"><div><b>中科院期刊分区</b>${casDivision.applicable === false ? `<span class="cas-not-applicable">${escapeHTML(casDivision.label || '不适用')}</span>${casDivision.sourceUrl ? `<a class="rank-link" href="${escapeHTML(casDivision.sourceUrl)}" target="_blank" rel="noopener noreferrer">核对出版物类型 ↗</a>` : ''}` : casDivision.url ? `<a class="rank-link" href="${escapeHTML(casDivision.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(casDivision.edition ? `${casDivision.edition} · 官方平台查询` : '官方平台查询')} ↗</a>` : `<span class="rank-unverified">${escapeHTML(casDivision.label || '暂未核验')}</span>`}</div><p>${escapeHTML(casDivision.note || '中科院分区仅适用于期刊；请使用官方期刊分区表核验。')}</p></div></div></div>
    <div class="section-heading followup-head"><div><span class="section-no">06</span><h3>论文关系图</h3></div><span class="section-caption">基线 · 同题工作 · 后续引用</span></div>
    ${data.graphNodes?.length || baseline.length || followups.length ? graphMarkup(data) : `<div class="empty-state">当前引用数据不足，暂时无法生成关系图。</div>`}
    <div class="graph-legend"><span><i class="legend-baseline"></i>架构来源 / 实验对比</span><span><i class="legend-peer"></i>同题 / 相近问题</span><span><i class="legend-followup"></i>引用目标论文的后续工作</span></div>
    <div class="source-note"><span>ⓘ</span><p>${escapeHTML(data.caveat || '引用关系来自 OpenAlex；AI 对 baseline/后续关系的归纳需要对照论文全文确认。')}</p></div>
  `;
  results.classList.remove('hidden'); progress.classList.add('hidden');
  document.querySelector('#new-search').addEventListener('click', () => { titleInput.focus(); titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function showError(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 7000);
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  searchButton.disabled = true;
  searchButton.innerHTML = '<span>整理中</span><span class="button-arrow">…</span>';
  progress.classList.remove('hidden'); results.classList.add('hidden');
  progressText.textContent = '搜索论文元数据与引用关系…';
  try {
    const response = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '检索失败，请稍后重试。');
    progressText.textContent = 'DeepSeek 正在整理研究脉络…';
    render(payload);
  } catch (error) {
    progress.classList.add('hidden'); showError(error.message || '请求失败，请检查网络和服务端配置。');
  } finally {
    searchButton.disabled = false;
    searchButton.innerHTML = '<span>开始整理</span><span class="button-arrow">↗</span>';
  }
});
document.querySelector('.example').addEventListener('click', () => { titleInput.value = 'SpikYOLO'; titleInput.focus(); });
document.querySelector('.help-button').addEventListener('click', () => showError('后续工作候选来自 OpenAlex 引用、相关论文和关键词检索；卡片会注明候选来源，关键词命中不代表直接引用。Baseline 关系请查看来源论文确认。'));
fetch('/api/status').then(response => response.json()).then(status => {
  const label = document.querySelector('.status');
  const message = !status.configured ? 'DeepSeek 需配置 Key' : status.openAlexConfigured ? '检索服务已配置' : 'OpenAlex 匿名额度';
  label.innerHTML = `<i></i> ${message}`;
  if (!status.configured) label.classList.add('needs-key');
}).catch(() => {});
