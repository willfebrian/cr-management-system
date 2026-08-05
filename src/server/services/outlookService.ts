import { execFile } from "child_process";
import { promisify } from "util";

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

  // Check OS
  if (process.platform !== "win32") {
    throw new Error(
      "Gagal mengambil email: Aplikasi Microsoft Outlook Desktop di laptop Anda belum dibuka atau Agent belum aktif. Silakan buka aplikasi Microsoft Outlook Desktop di laptop Anda, lalu coba lagi."
    );
  }

  // Windows Desktop MAPI COM Object Implementation
  const script = `
    $ErrorActionPreference = 'Stop'
    try {
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
    } catch {
      Write-Error "OUTLOOK_NOT_OPEN"
    }
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
    throw new Error(
      "Gagal mengambil email: Aplikasi Microsoft Outlook Desktop di laptop Anda belum dibuka. Silakan buka aplikasi Microsoft Outlook Desktop terlebih dahulu, lalu coba lagi."
    );
  }
}
