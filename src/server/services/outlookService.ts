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

  // If on Linux Server, check for Exchange EWS Server configuration
  if (process.platform !== "win32") {
    const { rows: settingRows } = await pool.query<{ setting_key: string; setting_value: string }>(
      `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('exchange_host', 'exchange_user', 'exchange_pass')`
    );
    const settingsMap = settingRows.reduce((acc, r) => {
      acc[r.setting_key] = r.setting_value;
      return acc;
    }, {} as Record<string, string>);

    const exchangeHost = settingsMap.exchange_host || process.env.EXCHANGE_HOST || "";
    const exchangeUser = settingsMap.exchange_user || process.env.EXCHANGE_USER || "";
    const exchangePass = settingsMap.exchange_pass || process.env.EXCHANGE_PASS || "";

    if (exchangeHost) {
      return searchExchangeEWS(exchangeHost, exchangeUser, exchangePass, querySubject);
    }

    throw new Error(
      "Reading emails directly on a Linux Server requires an Internal Exchange Host & Service Account. " +
      "Please set Internal Exchange Host, User, and Password in Master Data -> General Settings (or .env), or paste email content directly into Problem Analysis."
    );
  }

  // Windows Desktop MAPI COM Object Implementation (Passwordless via local Outlook Desktop)
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

async function searchExchangeEWS(
  exchangeHost: string,
  exchangeUser: string,
  exchangePass: string,
  querySubject: string
): Promise<OutlookEmailMatch[]> {
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

  let xml = "";
  const authUserPass = exchangeUser && exchangePass ? `${exchangeUser}:${exchangePass}` : ":";

  // Attempt 1: Try curl with NTLM authentication
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s",
      "-k",
      "--ntlm",
      "--user",
      authUserPass,
      "-H",
      "Content-Type: text/xml; charset=utf-8",
      "-H",
      "SOAPAction: http://schemas.microsoft.com/exchange/services/2006/messages/FindItem",
      "-d",
      soapBody,
      ewsUrl
    ]);
    if (stdout && stdout.includes("soap:Envelope")) {
      xml = stdout;
    }
  } catch {
    // Ignore curl failure and fallback
  }

  // Attempt 2: Standard fetch with Basic Auth header if credentials provided
  if (!xml) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://schemas.microsoft.com/exchange/services/2006/messages/FindItem"
      };

      if (exchangeUser && exchangePass) {
        const authBase64 = Buffer.from(`${exchangeUser}:${exchangePass}`).toString("base64");
        headers["Authorization"] = `Basic ${authBase64}`;
      }

      const res = await fetch(ewsUrl, {
        method: "POST",
        headers,
        body: soapBody
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Exchange EWS HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      xml = await res.text();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Exchange EWS Access Error (${ewsUrl}): ${msg}`);
    }
  }

  return parseEwsResponse(xml);
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
