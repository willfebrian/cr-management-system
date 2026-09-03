export type ReminderAction = "cr_not_prd" | "progress_update" | "information_or_documents" | "other";

export type ReminderRecipientsInput = { to?: string; cc?: string; bcc?: string };

export type ReminderRecipients = { to: string[]; cc: string[]; bcc: string[] };

export type ReminderGlpiTicket = { number: string; url: string };

export type ReminderEmailInput = {
  greeting: string;
  issueKey: string;
  issueName: string;
  crTransport: string;
  crHelpdesk: string;
  glpiTickets: ReminderGlpiTicket[];
  actions: ReminderAction[];
  otherAction?: string;
  notes?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACTION_TEXT: Record<Exclude<ReminderAction, "other">, string> = {
  cr_not_prd: "Mohon informasikan rencana import ke PRD atau kendala yang sedang dihadapi.",
  progress_update: "Mohon sampaikan progres terbaru dan perkiraan waktu penyelesaian.",
  information_or_documents: "Mohon lengkapi informasi atau dokumen yang masih diperlukan."
};

function splitAddresses(value?: string) {
  return String(value || "").split(/[;,\n]+/).map((email) => email.trim()).filter(Boolean);
}

function uniqueValidAddresses(value: string | undefined, seen: Set<string>) {
  const emails: string[] = [];
  for (const email of splitAddresses(value)) {
    if (!EMAIL_PATTERN.test(email)) throw new Error(`Invalid email address: ${email}`);
    const key = email.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      emails.push(email);
    }
  }
  return emails;
}

export function normalizeReminderRecipients(input: ReminderRecipientsInput): ReminderRecipients {
  const seen = new Set<string>();
  const to = uniqueValidAddresses(input.to, seen);
  if (!to.length) throw new Error("At least one valid To recipient is required.");
  return {
    to,
    cc: uniqueValidAddresses(input.cc, seen),
    bcc: uniqueValidAddresses(input.bcc, seen)
  };
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function actionLines(actions: ReminderAction[], otherAction?: string) {
  return actions.map((action) => action === "other" ? String(otherAction || "").trim() : ACTION_TEXT[action]).filter(Boolean);
}

const EMAIL_FONT = "font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;mso-line-height-rule:exactly;";
const EMAIL_TABLE = "border-collapse:collapse;border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt;";

function emailCellStyle(extra = "") {
  return `${EMAIL_FONT}${extra}`;
}

function emailTableAttributes(width: string, extraStyle = "") {
  return `role="presentation" width="${width}" cellspacing="0" cellpadding="0" border="0" style="${EMAIL_TABLE}${extraStyle}"`;
}

function notesToHtml(notes: string) {
  return escapeHtml(notes).replace(/\r?\n/g, "<br>");
}

export function composeReminderEmail(input: ReminderEmailInput) {
  const actions = actionLines(input.actions, input.otherAction);
  if (!actions.length) throw new Error("Select at least one follow-up action.");
  if (input.actions.includes("other") && !String(input.otherAction || "").trim()) throw new Error("Provide the other follow-up action.");

  const issueLabel = `${input.issueKey} — ${input.issueName}`;
  const glpiHtml = input.glpiTickets.length
    ? input.glpiTickets.map((ticket) => `<a href="${escapeHtml(ticket.url)}" style="${EMAIL_FONT}color:#0f766e;text-decoration:underline;font-weight:700;">GLPI #${escapeHtml(ticket.number)}</a>`).join("<br>")
    : "-";
  const glpiText = input.glpiTickets.length ? input.glpiTickets.map((ticket) => `GLPI #${ticket.number}: ${ticket.url}`).join("; ") : "-";
  const notes = String(input.notes || "").trim();
  const htmlActions = actions.map((action, index) => `<tr><td width="20" valign="top" style="${emailCellStyle(`width:20px;padding:${index ? "5px" : "0"} 0 0 0;color:#9a4d00;font-weight:700;`)}">&#8226;</td><td valign="top" style="${emailCellStyle(`padding:${index ? "5px" : "0"} 0 0 0;color:#5f430f;`)}">${escapeHtml(action)}</td></tr>`).join("");
  const textActions = actions.map((action) => `- ${action}`).join("\n");
  const notesHtml = notes ? `<tr><td style="${emailCellStyle("padding:20px 24px 0 24px;color:#172033;font-weight:700;")}">Notes / Outstanding</td></tr>
    <tr><td style="${emailCellStyle("padding:8px 24px 0 24px;")}"><table ${emailTableAttributes("100%", "width:100%;border:1px solid #dce5ee;background:#f8fafc;")}><tr><td style="${emailCellStyle("padding:13px 14px;color:#26364a;")}">${notesToHtml(notes)}</td></tr></table></td></tr>` : "";
  const notesText = notes ? `\n\nNotes / Outstanding\n${notes}` : "";
  const detailRows = [
    ["Issue No.", escapeHtml(issueLabel)],
    ["CR Transport", escapeHtml(input.crTransport)],
    ["GLPI Ticket", glpiHtml],
    ["CR Helpdesk", escapeHtml(input.crHelpdesk)]
  ].map(([label, value], index) => {
    const divider = index < 3 ? "border-bottom:1px solid #dce5ee;" : "";
    return `<tr><td width="190" valign="top" style="${emailCellStyle(`width:190px;padding:10px 12px;background:#f1f5f9;border-right:1px solid #dce5ee;${divider}color:#475569;font-weight:700;`)}">${label}</td><td valign="top" style="${emailCellStyle(`padding:10px 12px;${divider}color:#172033;`)}">${value}</td></tr>`;
  }).join("");

  const previewHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;">
<table ${emailTableAttributes("100%", "width:100%;background:#eef2f7;")}>
  <tr><td align="center" style="${emailCellStyle("padding:24px 12px;")}">
    <table ${emailTableAttributes("680", "width:680px;max-width:680px;background:#ffffff;border:1px solid #dce5ee;")}>
      <tr><td style="${emailCellStyle("padding:18px 24px;background:#0f766e;color:#ffffff;")}"><span style="font-family:Calibri,Arial,sans-serif;font-size:18pt;line-height:1.2;font-weight:700;color:#ffffff;">Issue Reminder</span><br><span style="font-family:Calibri,Arial,sans-serif;font-size:10.5pt;line-height:1.4;color:#e6fffb;">Follow-up is required for an outstanding issue.</span></td></tr>
      <tr><td style="${emailCellStyle("padding:22px 24px 0 24px;color:#172033;")}">${escapeHtml(input.greeting)}</td></tr>
      <tr><td style="${emailCellStyle("padding:16px 24px 0 24px;color:#172033;")}">Berikut adalah pengingat tindak lanjut untuk Issue yang masih outstanding.</td></tr>
      <tr><td style="${emailCellStyle("padding:18px 24px 0 24px;")}">
        <table ${emailTableAttributes("100%", "width:100%;border-left:4px solid #f59e0b;background:#fff7e6;")}>
          <tr><td style="${emailCellStyle("padding:13px 15px 5px 15px;color:#9a4d00;font-weight:700;")}">Perlu Ditindaklanjuti</td></tr>
          <tr><td style="${emailCellStyle("padding:4px 15px 13px 15px;color:#5f430f;")}"><table ${emailTableAttributes("100%", "width:100%;")}>${htmlActions}</table></td></tr>
        </table>
      </td></tr>
      <tr><td style="${emailCellStyle("padding:20px 24px 8px 24px;color:#172033;font-weight:700;")}">Issue Details</td></tr>
      <tr><td style="${emailCellStyle("padding:0 24px;")}"><table ${emailTableAttributes("100%", "width:100%;border:1px solid #dce5ee;")}>${detailRows}</table></td></tr>
      ${notesHtml}
      <tr><td style="${emailCellStyle("padding:20px 24px 24px 24px;color:#475569;")}">Mohon berikan pembaruan melalui ticket GLPI terkait.</td></tr>
      <tr><td style="${emailCellStyle("padding:14px 24px 18px 24px;border-top:1px solid #dce5ee;color:#64748b;font-size:9.5pt;")}">This email was sent automatically by the CR Management System. Please do not reply directly to this message.</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
  const emailText = `Issue Reminder\n\n${input.greeting}\n\nBerikut adalah pengingat tindak lanjut untuk Issue yang masih outstanding.\n\nPerlu Ditindaklanjuti\n${textActions}\n\nIssue Details\nIssue No.: ${issueLabel}\nCR Transport: ${input.crTransport}\nGLPI Ticket: ${glpiText}\nCR Helpdesk: ${input.crHelpdesk}${notesText}\n\nMohon berikan pembaruan melalui ticket GLPI terkait.\n\nThis email was sent automatically by the CR Management System. Please do not reply directly to this message.`;
  return { previewHtml, emailText, actionLines: actions };
}
