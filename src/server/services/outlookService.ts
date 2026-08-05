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

  // Server runs on Linux and has no access to Outlook COM — this path only
  // exists as a fallback when the user's local agent (port 18888) wasn't reachable.
  if (process.platform !== "win32") {
    throw new Error(
      "Gagal mengambil email: Agent lokal Outlook belum berjalan di laptop Anda. Silakan download & jalankan installer-nya di /api/outlook/download-agent, pastikan Outlook Desktop terbuka, lalu coba lagi."
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
        
        try { $items.Sort("[ReceivedTime]", $true) } catch {}

        function Clean-Subject($str) {
          if (-not $str) { return "" }
          $cleaned = $str -replace '(?i)^\\s*(re|fw|fwd|fe|tr|vs|sv)\\s*:\\s*', ''
          $cleaned = $cleaned -replace '(?i)^\\s*\\[(external|balas|forward)\\]\\s*', ''
          $cleaned = $cleaned -replace '(?i)^\\s*(re|fw|fwd|fe|tr|vs|sv)\\s*:\\s*', ''
          return $cleaned.Trim().ToLower()
        }

        function To-B64($str) {
          if (-not $str) { return "" }
          $s = [string]$str
          if ($s.Length -gt 15000) { $s = $s.Substring(0, 15000) }
          $bytes = [System.Text.Encoding]::UTF8.GetBytes($s)
          return [System.Convert]::ToBase64String($bytes)
        }

        $rawQuery = $env:SEARCH_SUBJECT.Trim().ToLower()
        $cleanQuery = Clean-Subject $env:SEARCH_SUBJECT
        $matches = @()

        foreach ($item in $items) {
          if ($matches.Count -ge 5) { break }
          try {
            $subject = ""
            try { $subject = $item.Subject } catch {}
            if (-not $subject) { continue }

            $subLower = $subject.ToLower()
            $cleanSub = Clean-Subject $subject

            $isMatch = $subLower.Contains($rawQuery) -or $cleanSub.Contains($cleanQuery) -or ($cleanQuery.Length -gt 3 -and $cleanQuery.Contains($cleanSub))

            if (-not $isMatch -and $cleanQuery.Length -gt 3) {
              $words = $cleanQuery -split '\\s+' | Where-Object { $_.Length -gt 2 }
              if ($words.Count -gt 0) {
                $allWordsFound = $true
                foreach ($w in $words) {
                  if (-not $cleanSub.Contains($w)) {
                    $allWordsFound = $false
                    break
                  }
                }
                if ($allWordsFound) { $isMatch = $true }
              }
            }

            if ($isMatch) {
              $to = ""
              try { $to = $item.To } catch {}
              $senderEmail = ""
              try { $senderEmail = $item.SenderEmailAddress } catch {}
              $senderName = ""
              try { $senderName = $item.SenderName } catch {}
              $body = ""
              try { $body = $item.Body } catch {}
              $recTime = ""
              try { $recTime = $item.ReceivedTime.ToString("yyyy-MM-dd HH:mm:ss") } catch { $recTime = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") }

              $matches += [PSCustomObject]@{
                receivedAt = $recTime
                senderName = To-B64 $senderName
                senderEmail = To-B64 $senderEmail
                to = To-B64 $to
                subject = To-B64 $subject
                body = To-B64 $body
              }
            }
          } catch {
            # Skip any item that throws COM exception
          }
        }
        $matches | ConvertTo-Json -Compress
      } catch {
        Write-Error $_.Exception.Message
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

    let results: OutlookEmailMatch[] = [];
    if (stdout && stdout.trim()) {
      const parsed = JSON.parse(stdout.trim());
      const list = Array.isArray(parsed) ? parsed : [parsed];
      results = list.map((r: any) => ({
        receivedAt: r.receivedAt || "",
        senderName: Buffer.from(r.senderName || "", "base64").toString("utf-8"),
        senderEmail: Buffer.from(r.senderEmail || "", "base64").toString("utf-8"),
        to: Buffer.from(r.to || "", "base64").toString("utf-8"),
        subject: Buffer.from(r.subject || "", "base64").toString("utf-8"),
        body: Buffer.from(r.body || "", "base64").toString("utf-8")
      }));
    }
    return results;
  } catch (error) {
    console.error("Error querying Outlook via PowerShell:", error);
    throw new Error(
      "Gagal mengambil email: Aplikasi Microsoft Outlook Desktop di laptop Anda belum dibuka. Silakan buka aplikasi Microsoft Outlook Desktop terlebih dahulu, lalu coba lagi."
    );
  }
}
