'use client';
import type { PaperNode, Graph } from '@/lib/model';
import { cleanUrl } from '@/lib/model';
import { Button } from '@/components/ui/button';
export default function ResearchBriefPanel({
  node,
  graph,
  onVisit,
}: {
  node: PaperNode;
  graph: Graph;
  onVisit: (id: string) => void;
}) {
  const brief = node.research;
  if (!brief) return null;
  return (
    <section className="research-brief" aria-label="AI 研究解读">
      <div className="brief-heading">
        <strong>研究解读</strong>
        <span>AI · 基于摘要</span>
      </div>
      {brief.goal && <p className="research-goal">研究目标：{brief.goal}</p>}
      <dl>
        <dt>解决什么问题</dt>
        <dd>{brief.problem}</dd>
        <dt>方法如何工作</dt>
        <dd>{brief.approach}</dd>
        <dt>作者声称的改进</dt>
        <dd>{brief.contribution || '摘要未明确说明。'}</dd>
      </dl>
      <div className="reading-heading">
        <strong>建议阅读顺序</strong>
        <span>对照了 {brief.abstractsRead} 篇候选摘要</span>
      </div>
      {brief.reading.map((r, i) => {
        const target = graph.nodes.find((n) => n.id === r.id);
        return (
          <article className="reading-card" key={r.id}>
            <div className="reading-rank">
              <b>{String(i + 1).padStart(2, '0')}</b>
              <span>{r.role} · 待核验</span>
            </div>
            <h3>{target?.label || r.title}</h3>
            <p>{r.reason}</p>
            <p className="reading-difference">
              <strong>区别</strong>
              {r.difference}
            </p>
            <p className="reading-question">
              <strong>带着这个问题读</strong>
              {r.question}
            </p>
            <details className="reading-evidence">
              <summary>核对两篇摘要的依据</summary>
              <small>中心论文</small>
              <blockquote>{r.centerEvidence}</blockquote>
              {cleanUrl(node.url) && (
                <a href={cleanUrl(node.url)} target="_blank" rel="noreferrer">
                  中心论文来源 ↗
                </a>
              )}
              <small>关联论文</small>
              <blockquote>{r.targetEvidence}</blockquote>
              {cleanUrl(target?.url) && (
                <a
                  href={cleanUrl(target?.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  关联论文来源 ↗
                </a>
              )}
            </details>
            <Button
              size="sm"
              variant="outline"
              disabled={!target}
              onClick={() => onVisit(r.id)}
            >
              围绕这篇继续研究 →
            </Button>
          </article>
        );
      })}
      {!brief.reading.length && (
        <p className="muted">
          暂未找到摘要证据足够的推荐。可调整研究目标后重新分析。
        </p>
      )}
      {brief.unknowns.length > 0 && (
        <div className="research-questions">
          <strong>仍需核验</strong>
          <ul>
            {brief.unknowns.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {brief.nextSteps.length > 0 && (
        <div className="research-next">
          <strong>下一步怎么做 · AI 建议</strong>
          <ol>
            {brief.nextSteps.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </div>
      )}
      <p className="brief-footnote">
        依据题名与摘要形成的比较，不等于已核验的全文结论。已保存到此节点。
      </p>
    </section>
  );
}
