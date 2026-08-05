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

  // On Linux Server, if local agent was not running, return informative instruction for the client
  if (process.platform !== "win32") {
    throw new Error(
      "Outlook Agent is not running on your laptop. " +
      "Please double-click 'Install_Outlook_Agent.bat' in the project scripts folder to start the passwordless Outlook agent."
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
