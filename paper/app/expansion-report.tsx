'use client';
import { Button } from '@/components/ui/button';
import { cleanUrl } from '@/lib/model';
export type ExpansionReport = {
  mode: 'explore' | 'expand' | 'analyze';
  addedNodes?: number;
  addedEdges?: number;
  totalReferences?: number | null;
  sections?: Record<string, { state: string; count: number; source?: string }>;
  warnings: string[];
  error?: string;
};
const labels: Record<string, string> = {
  references: '参考文献',
  citations: '被引用',
  related: '相关候选',
};
export default function ExpansionResult({
  report,
  busy,
  onRetry,
}: {
  report: ExpansionReport;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <details
      className={'expansion-report ' + (report.error ? 'failed' : '')}
      open
    >
      <summary>
        {report.error ? '此次扩展未完成' : '本次探索结果'}
        <span>
          {report.error
            ? '原图谱已保留'
            : report.addedEdges == null
              ? '分析已保存'
              : `新增 ${report.addedEdges} 条关系`}
        </span>
      </summary>
      {report.addedNodes != null && (
        <p>新增 {report.addedNodes} 个节点。已存在的内容自动合并。</p>
      )}
      {report.sections && (
        <div className="source-results">
          {Object.entries(report.sections).map(([key, value]) => (
            <div key={key}>
              <span>{labels[key] || key}</span>
              <strong className={value.state === 'ok' ? '' : 'muted'}>
                {value.state === 'ok'
                  ? `${value.count} 篇`
                  : value.state === 'unavailable'
                    ? '索引未提供'
                    : '暂时失败'}
              </strong>
              {cleanUrl(value.source) && (
                <a
                  href={cleanUrl(value.source)}
                  target="_blank"
                  rel="noreferrer"
                >
                  来源 ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      {report.totalReferences != null && (
        <p className="report-note">
          索引共 {report.totalReferences}{' '}
          条参考文献，本次载入可获取的一批，不代表全部文献。
        </p>
      )}
      {report.error && <p className="report-warning">{report.error}</p>}
      {report.warnings.length > 0 && (
        <p className="report-warning">{report.warnings.join('；')}</p>
      )}
      {(report.error || report.warnings.length > 0) && (
        <Button size="sm" variant="outline" disabled={busy} onClick={onRetry}>
          重试此次操作
        </Button>
      )}
    </details>
  );
}
