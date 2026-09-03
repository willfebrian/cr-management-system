import { pool } from "../db/pool.js";
import { getIssueDetail } from "../db/issueRepository.js";
import { recordActivityLog } from "../db/auditRepository.js";
import { sendConfiguredMcpEmail } from "./outlookService.js";
import type { AuthUser } from "../auth/authService.js";
import { formatReminderCrTransports } from "./issueReminderTemplate.js";
import { composeReminderEmail, normalizeReminderRecipients, type ReminderAction, type ReminderRecipientsInput } from "./issueReminderComposer.js";
import { generateAnalysisFromEmail } from "./aiService.js";
import { getCrDetailForSystem } from "../db/crRepository.js";
import { buildReminderAiContext } from "./issueReminderAiContext.js";

const GROUP_NAME = "SAP ABAP Group";
const DEFAULT_ACTIONS: ReminderAction[] = ["cr_not_prd"];

export type IssueReminderInput = ReminderRecipientsInput & {
  notes?: string;
  actions?: ReminderAction[];
  otherAction?: string;
};

function normalizeActions(actions?: ReminderAction[]) {
  const allowed: ReminderAction[] = ["cr_not_prd", "progress_update", "information_or_documents", "other"];
  const selected = Array.isArray(actions) ? actions.filter((action): action is ReminderAction => allowed.includes(action)) : DEFAULT_ACTIONS;
  return [...new Set(selected)];
}

function emailsToText(addresses: string[]) { return addresses.join(", "); }

export async function previewIssueReminder(issueId: number, actor: AuthUser, input: IssueReminderInput = {}) {
  if (!actor.isReminder) throw new Error("Reminder permission is required.");
  const detail: any = await getIssueDetail(issueId);
  if (!detail?.issue) throw new Error("Issue not found.");
  const issue = detail.issue;
  const primary = (detail.crLinks || []).find((row: any) => row.is_primary) || (detail.crLinks || [])[0];
  if (issue.issue_status === "cancelled" || primary?.lifecycle_status === "in_prd") throw new Error("Reminder is unavailable because this Issue is cancelled or already in PRD.");

  const { rows: people } = await pool.query(`SELECT DISTINCT p.full_name, p.nickname, p.email FROM issue_participants ip JOIN issue_people p ON p.id = ip.person_id WHERE ip.issue_id = $1 AND p.is_active = true AND ((ip.role = 'requester' AND upper(coalesce(p.department, '')) = 'IT') OR ip.role = 'abaper')`, [issueId]);
  const defaultTo = [...new Map(people.filter((person: any) => String(person.email || "").trim()).map((person: any) => { const email = String(person.email).trim(); return [email.toLowerCase(), email]; })).values()];
  const greetingNames = [...new Set(people.map((person: any) => String(person.full_name || person.nickname || "").trim()).filter(Boolean))];
  const skippedRecipients = people.filter((person: any) => !String(person.email || "").trim()).map((person: any) => person.full_name || person.nickname || "Unnamed person");
  const group = await pool.query(`SELECT email_address FROM issue_group_emails WHERE is_active = true AND lower(trim(name)) = lower($1) LIMIT 1`, [GROUP_NAME]);
  const groupEmail = String(group.rows[0]?.email_address || "").trim();
  if (!defaultTo.length && !groupEmail && !String(input.to || "").trim()) throw new Error("No valid reminder recipient or active SAP ABAP Group email is configured.");
  const defaults = { to: emailsToText(defaultTo.length ? defaultTo : groupEmail ? [groupEmail] : []), cc: defaultTo.length && groupEmail ? groupEmail : "", bcc: "" };
  const recipients = normalizeReminderRecipients({ to: input.to === undefined ? defaults.to : input.to, cc: input.cc === undefined ? defaults.cc : input.cc, bcc: input.bcc === undefined ? defaults.bcc : input.bcc });
  const glpiTickets = (detail.glpi || []).map((ticket: any) => ({ number: String(ticket.ticket_number), url: `https://itsm.trst.co.id/front/ticket.form.php?id=${encodeURIComponent(String(ticket.ticket_number))}` }));
  const actions = normalizeActions(input.actions);
  const rendered = composeReminderEmail({
    greeting: greetingNames.length ? `Dear ${greetingNames.join(" dan ")},` : "Dear All,",
    issueKey: issue.issue_key || "-", issueName: issue.issue_name || "-", crTransport: formatReminderCrTransports(detail.crLinks || []),
    crHelpdesk: (detail.crHelpdeskNumbers || []).map((row: any) => row.cr_helpdesk_no).filter(Boolean).join(", ") || "-", glpiTickets,
    actions, otherAction: input.otherAction, notes: input.notes
  });
  const last = await pool.query(`SELECT sent_at FROM issue_reminder_emails WHERE issue_id = $1 AND mcp_status = 'sent' ORDER BY sent_at DESC LIMIT 1`, [issueId]);
  return { eligible: true, to: recipients.to, cc: emailsToText(recipients.cc) || undefined, bcc: emailsToText(recipients.bcc) || undefined, defaultRecipients: defaults, actions, otherAction: input.otherAction || "", skippedRecipients, subject: `[Reminder] Issue ${issue.issue_key}: ${issue.issue_name}`, notesDraft: "", body: rendered.emailText, emailText: rendered.emailText, previewHtml: rendered.previewHtml, lastSentAt: last.rows[0]?.sent_at || null, primaryCr: primary?.trkorr || null, primaryCrStatus: primary?.lifecycle_status || null };
}

export async function sendIssueReminder(issueId: number, input: IssueReminderInput, actor: AuthUser) {
  const preview = await previewIssueReminder(issueId, actor, input);
  const result = await sendConfiguredMcpEmail({ to: preview.to.join(","), cc: preview.cc, bcc: preview.bcc, subject: preview.subject, body: preview.emailText, bodyHtml: preview.previewHtml });
  await pool.query(`INSERT INTO issue_reminder_emails (issue_id, sender_user_id, to_recipients, cc_recipients, subject, body, notes, primary_cr, primary_cr_status, mcp_message_id, mcp_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [issueId, actor.id, preview.to.join(","), preview.cc || null, preview.subject, preview.emailText, String(input.notes || "").trim() || null, preview.primaryCr, preview.primaryCrStatus, result.messageId || null, result.status]);
  await recordActivityLog({ activityType: "issue", action: "send_reminder_email", username: actor.username, userId: actor.id, description: `Sent Issue reminder email for Issue ${issueId}.`, metadata: { toCount: preview.to.length, ccCount: preview.cc ? preview.cc.split(",").length : 0, bccCount: preview.bcc ? preview.bcc.split(",").length : 0, status: result.status } });
  return { ...preview, messageId: result.messageId, sentAt: new Date().toISOString() };
}

export async function draftIssueReminderWithAi(issueId: number, input: IssueReminderInput, actor: AuthUser) {
  const preview = await previewIssueReminder(issueId, actor, input);
  const detail: any = await getIssueDetail(issueId);
  const crDetails = (await Promise.all((detail.crLinks || []).map(async (link: any) => {
    try {
      return await getCrDetailForSystem(String(link.trkorr), String(link.sap_system_code || "DEV"));
    } catch {
      return null;
    }
  }))).filter(Boolean) as any[];
  const facts = buildReminderAiContext(detail, crDetails, preview.actions.map((action) => reminderActionLabel(action, input.otherAction)), String(input.notes || ""));
  const context = `Write the problemAnalysis value as a concise Bahasa Indonesia summary for the optional Notes / Outstanding section of an Issue reminder email. Explain the available Issue information, including relevant CR transport detail and other recorded Issue facts. Use only the KNOWN ISSUE FACTS below. Do not invent a blocker, root cause, owner, date, target, commitment, or completion status. Prefer one clear paragraph of two to five sentences; omit facts that add no useful context. Do not add a greeting, heading, bullet list, signature, or request that is not supported by the facts.\n\n${facts}`;
  const result = await generateAnalysisFromEmail(context, preview.subject, "Issue reminder draft");
  return { notes: String(result.problemAnalysis || "").trim(), providerUsed: result.providerUsed };
}

function reminderActionLabel(action: ReminderAction, otherAction?: string) {
  if (action === "cr_not_prd") return "CR has not reached PRD";
  if (action === "progress_update") return "Request a progress update";
  if (action === "information_or_documents") return "Waiting for information or documents";
  return String(otherAction || "Other follow-up").trim();
}
