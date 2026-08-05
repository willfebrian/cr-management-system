import { execFile } from "child_process";
import { promisify } from "util";
import { pool } from "../db/pool.js";

const execFileAsync = promisify(execFile);

export type OutlookEmailMatch = {
  receivedAt: string;
  senderName: string;
  senderEmail: string;
  to: string;
  subject: string;
  body: string;
};

export async function searchOutlookEmails(querySubject: string): Promise<OutlookEmailMatch[]> {
  if (!querySubject || !querySubject.trim()) return [];

  // Get active group emails from DB
  const { rows: groupRows } = await pool.query<{ email_address: string }>(
    `SELECT email_address FROM issue_group_emails WHERE is_active = TRUE`
  );

  // If on Linux Server, fallback to Internal Exchange EWS (Option A)
  if (process.platform !== "win32") {
    const { rows: settingRows } = await pool.query<{ setting_value: string }>(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'exchange_host'`
    );
    const exchangeHost = settingRows[0]?.setting_value || process.env.EXCHANGE_HOST || "";
    
    if (exchangeHost) {
      return searchExchangeEWS(exchangeHost, querySubject);
    }

    throw new Error(
      "Outlook Desktop MAPI integration is running on a Linux Server. " +
      "To enable automatic passwordless email fetching on Linux, please configure your Internal Exchange Host (e.g. mail.trst.co.id) in Master Data & Settings -> AI Instructions (or set EXCHANGE_HOST in .env)."
    );
  }

  // Windows Desktop MAPI COM Object Implementation
  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $inbox = $namespace.GetDefaultFolder(6)
    $items = $inbox.Items
    $items.Sort("[ReceivedTime]", $true)

    $query = $env:SEARCH_SUBJECT.Trim().ToLower()
    $matches = @()

    foreach ($item in $items) {
      if ($matches.Count -ge 5) { break }
      $subject = ""
      try { $subject = $item.Subject } catch {}
      if ($subject -and $subject.ToLower().Contains($query)) {
        $to = ""
        try { $to = $item.To } catch {}
        $senderEmail = ""
        try { $senderEmail = $item.SenderEmailAddress } catch {}
        $senderName = ""
        try { $senderName = $item.SenderName } catch {}
        $body = ""
        try { $body = $item.Body } catch {}

        $matches += [PSCustomObject]@{
          receivedAt = $item.ReceivedTime.ToString("yyyy-MM-dd HH:mm:ss")
          senderName = $senderName
          senderEmail = $senderEmail
          to = $to
          subject = $subject
          body = $body
        }
      }
    }
    $matches | ConvertTo-Json -Compress
  `;

  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ], {
      env: { ...process.env, SEARCH_SUBJECT: querySubject },
      maxBuffer: 10 * 1024 * 1024
    });

    if (!stdout || !stdout.trim()) return [];
    const parsed = JSON.parse(stdout.trim());
    const results = Array.isArray(parsed) ? parsed : [parsed];
    return results;
  } catch (error) {
    console.error("Error querying Outlook via PowerShell:", error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Outlook client error: ${msg}`);
  }
}

async function searchExchangeEWS(exchangeHost: string, querySubject: string): Promise<OutlookEmailMatch[]> {
  const ewsUrl = exchangeHost.startsWith("http") ? exchangeHost : `https://${exchangeHost}/EWS/Exchange.asmx`;

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
  <soap:Body>
    <FindItem xmlns="http://schemas.microsoft.com/exchange/services/2006/messages" Traversal="Shallow">
      <ItemShape>
        <t:BaseShape>AllProperties</t:BaseShape>
      </ItemShape>
      <IndexedPageItemView MaxEntriesReturned="5" Offset="0" BasePoint="Beginning" />
      <Restriction>
        <t:Contains ContainmentMode="Substring" ContainmentComparison="IgnoreCase">
          <t:FieldURI FieldURI="item:Subject" />
          <t:Constant Value="${escapeXml(querySubject)}" />
        </t:Contains>
      </Restriction>
      <ParentFolderIds>
        <t:DistinguishedFolderId Id="inbox" />
      </ParentFolderIds>
    </FindItem>
  </soap:Body>
</soap:Envelope>`;

  try {
    const res = await fetch(ewsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://schemas.microsoft.com/exchange/services/2006/messages/FindItem"
      },
      body: soapBody
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Exchange EWS HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    const xml = await res.text();
    return parseEwsResponse(xml);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Exchange EWS Internal Error (${ewsUrl}): ${msg}`);
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function parseEwsResponse(xml: string): OutlookEmailMatch[] {
  const matches: OutlookEmailMatch[] = [];
  const itemMatches = xml.match(/<t:Message>[\s\S]*?<\/t:Message>/g) || [];

  for (const itemXml of itemMatches) {
    const subject = (itemXml.match(/<t:Subject>([\s\S]*?)<\/t:Subject>/) || [])[1] || "";
    const receivedAt = (itemXml.match(/<t:DateTimeReceived>([\s\S]*?)<\/t:DateTimeReceived>/) || [])[1] || "";
    const senderName = (itemXml.match(/<t:Name>([\s\S]*?)<\/t:Name>/) || [])[1] || "";
    const senderEmail = (itemXml.match(/<t:EmailAddress>([\s\S]*?)<\/t:EmailAddress>/) || [])[1] || "";
    const bodyRaw = (itemXml.match(/<t:Body[\s\S]*?>([\s\S]*?)<\/t:Body>/) || [])[1] || "";

    const body = bodyRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    matches.push({
      subject,
      receivedAt: receivedAt ? receivedAt.replace("T", " ").replace("Z", "") : new Date().toISOString(),
      senderName: senderName || senderEmail || "Unknown Sender",
      senderEmail: senderEmail || "unknown@trst.co.id",
      to: "sap-abap@trst.co.id",
      body: body || subject
    });
  }

  return matches;
}
