import React from "react";
import { ChevronRight, ClipboardList, Database, FolderKanban } from "lucide-react";
import type { CrDetail } from "../../../shared/types";
import { transportObjectLabel } from "../../../shared/transportObjectLabels";
import { summarizeTransportObjects } from "./crDetailObjects";
import { SummaryStrip } from "../SummaryStrip";

type Props = {
  detail: CrDetail | null;
  metadata: Array<{ label: string; value: string }>;
  lifecycle: Array<{ label: string; value: string; filled: boolean }>;
  renderStatus: (value: string) => React.ReactNode;
  issueStatus: (link: CrDetail["issueLinks"][number]) => string;
  taskStatus: (task: CrDetail["tasks"][number]) => string;
  onOpenIssue: (link: CrDetail["issueLinks"][number]) => void;
};

export function CrDetailContent({ detail, metadata, lifecycle, renderStatus, issueStatus, taskStatus, onOpenIssue }: Props) {
  const summary = summarizeTransportObjects(detail?.objects || []);
  return <div className="cr-detail-content">
    <SummaryStrip className="cr-summary-strip cr-detail-metadata" items={metadata} />
    <section className="cr-detail-lifecycle"><h3>Transport lifecycle</h3><ol>{lifecycle.map(event => <li className={event.filled ? "complete" : "pending"} key={event.label}><span className="cr-detail-step" aria-hidden="true">{event.filled ? "✓" : "○"}</span><strong>{event.label}</strong><small>{event.value}</small></li>)}</ol></section>
    <div className="cr-detail-related">
      <section><h3><FolderKanban size={16} />Linked issues <span>{detail?.issueLinks.length || 0}</span></h3>
        {(detail?.issueLinks || []).map(link => {
          const content = <><span><strong>{link.issue_no ? `${link.issue_no}-${link.sub_issue_no || "01"}` : "Issue removed"}</strong><small>{link.issue_name || "Issue removed"}</small></span>{renderStatus(issueStatus(link))}{link.issue_id ? <ChevronRight className="cr-related-issue-chevron" size={16} /> : null}</>;
          return link.issue_id ? <button type="button" className="cr-detail-related-row" key={link.id} onClick={() => onOpenIssue(link)}>{content}</button> : <div className="cr-detail-related-row" key={link.id}>{content}</div>;
        })}
        {detail?.issueLinks.length === 0 && <p className="cr-detail-empty">No issues linked to this CR.</p>}
      </section>
      <section><h3><ClipboardList size={16} />Child tasks <span>{detail?.tasks.length || 0}</span></h3>{(detail?.tasks || []).map(task => <div className="cr-detail-related-row" key={task.trkorr}><strong>{task.trkorr}</strong>{renderStatus(taskStatus(task))}</div>)}{detail?.tasks.length === 0 && <p className="cr-detail-empty">No child tasks cached.</p>}</section>
    </div>
    <section><div className="cr-detail-object-heading"><h3><Database size={16} />Transport objects <span>{summary.objects.length} unique</span></h3><small>{summary.sourceCount} source records · request + task</small></div>
      <div className="cr-detail-objects"><div className="cr-detail-object-columns"><span>Object / description</span><span>Type</span><span>Sources</span></div>
        {summary.objects.map((object, index) => <details className="cr-detail-object" key={index}><summary><span><strong>{object.object_name || "Unnamed object"}</strong><small>{transportObjectLabel(object.pgmid, object.object_type, object.object_label || object.object_type_description)}</small></span><code>{object.pgmid || "-"} {object.object_type || "-"}</code><span className="cr-detail-source-toggle">{object.sources.length} {object.sources.length === 1 ? "source" : "sources"}<ChevronRight size={14} /></span></summary><div className="cr-detail-sources">{object.sources.map((source, sourceIndex) => {
          const keys = (detail?.keys || []).filter(key => key.trkorr === source.trkorr && key.position === source.position);
          return <div className="cr-detail-source" key={sourceIndex}><div><span>{source.trkorr} · <strong>{source.trkorr === detail?.request?.trkorr ? "Request" : "Task"}</strong></span><span>Position {source.position}</span></div>{keys.map((key, keyIndex) => <code className="cr-detail-table-key" key={keyIndex}>Table key: {key.table_key || "-"}</code>)}</div>;
        })}</div></details>)}
        {summary.objects.length === 0 && <p className="cr-detail-empty">No transport objects cached for this CR.</p>}
      </div>
    </section>
    {summary.releaseEntries.length > 0 && <details className="cr-detail-release"><summary><span>Release entries · {summary.releaseEntries.length} {summary.releaseEntries.length === 1 ? "record" : "records"}</span><code>CORR RELE</code><ChevronRight size={14} /></summary>{summary.releaseEntries.map((entry, index) => <div className="cr-detail-source" key={index}><strong>{entry.object_name || "Release entry"}</strong><small>{entry.trkorr} · Position {entry.position}</small></div>)}</details>}
  </div>;
}
