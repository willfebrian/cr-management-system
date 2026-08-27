import { pool } from "../db/pool.js";
import { getIssueDetail } from "../db/issueRepository.js";
import { recordActivityLog } from "../db/auditRepository.js";
import { sendConfiguredMcpEmail } from "./outlookService.js";
import type { AuthUser } from "../auth/authService.js";

const GROUP_NAME = "SAP ABAP Group";

export async function previewIssueReminder(issueId: number, actor: AuthUser) {
  if (!actor.isReminder) throw new Error("Reminder permission is required.");
  const detail: any = await getIssueDetail(issueId);
  if (!detail?.issue) throw new Error("Issue not found.");
  const issue = detail.issue;
  const primary = (detail.crLinks || []).find((row: any) => row.is_primary) || (detail.crLinks || [])[0];
  if (issue.issue_status === "cancelled" || primary?.lifecycle_status === "in_prd") throw new Error("Reminder is unavailable because this Issue is cancelled or already in PRD.");
  const { rows: people } = await pool.query(`SELECT DISTINCT p.full_name, p.nickname, p.email FROM issue_participants ip JOIN issue_people p ON p.id = ip.person_id WHERE ip.issue_id = $1 AND p.is_active = true AND ((ip.role = 'requester' AND upper(coalesce(p.department, '')) = 'IT') OR ip.role = 'abaper')`, [issueId]);
  const recipients = [...new Map(people.filter((p) => String(p.email || "").trim()).map((p) => [String(p.email).trim().toLowerCase(), String(p.email).trim()])).values()];
  const skippedRecipients = people.filter((p) => !String(p.email || "").trim()).map((p) => p.full_name || p.nickname || "Unnamed person");
  const group = await pool.query(`SELECT email_address FROM issue_group_emails WHERE is_active = true AND lower(trim(name)) = lower($1) LIMIT 1`, [GROUP_NAME]);
  const groupEmail = String(group.rows[0]?.email_address || "").trim();
  if (!recipients.length && !groupEmail) throw new Error("No valid reminder recipient or active SAP ABAP Group email is configured.");
  const to = recipients.length ? recipients : [groupEmail];
  const cc = recipients.length && groupEmail ? groupEmail : undefined;
  const glpi = (detail.glpi || []).map((g: any) => `GLPI #${g.ticket_number}`).join(", ") || "-";
  const crs = (detail.crLinks || []).map((c: any) => `${c.trkorr} (${c.lifecycle_status || "unknown"})`).join(", ") || "-";
  const helpdesk = (detail.crHelpdeskNumbers || []).map((c: any) => c.cr_helpdesk_no).join(", ") || "-";
  const notesDraft = primary?.lifecycle_status === "in_prd" ? "" : `CR Transport ${primary?.trkorr || "-"} has not reached PRD.`;
  return { eligible: true, to, cc, skippedRecipients, subject: `[Reminder] Issue ${issue.issue_key}: ${issue.issue_name}`, notesDraft, body: `Issue No.: ${issue.issue_key}\nIssue Description: ${issue.issue_name}\nCR Transport: ${crs}\nGLPI: ${glpi}\nCR Helpdesk: ${helpdesk}\n\nNotes / Outstanding:\n${notesDraft}`, lastSentAt: null, primaryCr: primary?.trkorr || null, primaryCrStatus: primary?.lifecycle_status || null };
}

export async function sendIssueReminder(issueId: number, input: { notes: string }, actor: AuthUser) {
  if (!input.notes?.trim()) throw new Error("Notes / Outstanding is required.");
  const preview = await previewIssueReminder(issueId, actor);
  const recent = await pool.query(`SELECT sent_at FROM issue_reminder_emails WHERE issue_id = $1 AND mcp_status = 'sent' AND sent_at > now() - interval '24 hours' ORDER BY sent_at DESC LIMIT 1`, [issueId]);
  if (recent.rows[0]) throw new Error("A reminder was already sent within the last 24 hours.");
  const body = preview.body.replace(preview.notesDraft, input.notes.trim());
  const result = await sendConfiguredMcpEmail({ to: preview.to.join(","), cc: preview.cc, subject: preview.subject, body });
  await pool.query(`INSERT INTO issue_reminder_emails (issue_id, sender_user_id, to_recipients, cc_recipients, subject, body, notes, primary_cr, primary_cr_status, mcp_message_id, mcp_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [issueId, actor.id, preview.to.join(","), preview.cc || null, preview.subject, body, input.notes.trim(), preview.primaryCr, preview.primaryCrStatus, result.messageId || null, result.status]);
  await recordActivityLog({ activityType: "issue", action: "send_reminder_email", username: actor.username, userId: actor.id, description: `Sent Issue reminder email for Issue ${issueId}.`, metadata: { toCount: preview.to.length, hasCc: Boolean(preview.cc), status: result.status } });
  return { ...preview, body, messageId: result.messageId, sentAt: new Date().toISOString() };
}
