import http from "http";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const PORT = process.env.AGENT_PORT || 18888;

const server = http.createServer(async (req, res) => {
  // CORS & Chrome Private Network Access (PNA) Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (reqUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", agent: "cr-outlook-agent", platform: process.platform }));
    return;
  }

  if (reqUrl.pathname === "/api/fetch-outlook") {
    const querySubject = reqUrl.searchParams.get("q") || "";
    const limit = parseInt(reqUrl.searchParams.get("limit") || "5", 10) || 5;
    const maxChars = parseInt(reqUrl.searchParams.get("maxChars") || "15000", 10) || 15000;

    if (!querySubject.trim()) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ rows: [] }));
      return;
    }

    if (process.platform !== "win32") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Gagal mengambil email: Sistem operasi laptop harus Windows" }));
      return;
    }

    const script = `
      $ErrorActionPreference = 'Stop'
      try {
        $outlook = New-Object -ComObject Outlook.Application
        $namespace = $outlook.GetNamespace("MAPI")
        $inbox = $namespace.GetDefaultFolder(6)
        $items = $inbox.Items
        
        try { $items.Sort("[ReceivedTime]", $true) } catch {}

        $maxCount = [int]$env:MAX_EMAILS
        if ($maxCount -le 0) { $maxCount = 5 }

        $maxCharsLimit = [int]$env:MAX_BODY_CHARS
        if ($maxCharsLimit -le 0) { $maxCharsLimit = 15000 }

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
          if ($s.Length -gt $maxCharsLimit) { $s = $s.Substring(0, $maxCharsLimit) }
          $bytes = [System.Text.Encoding]::UTF8.GetBytes($s)
          return [System.Convert]::ToBase64String($bytes)
        }

        $rawQuery = $env:SEARCH_SUBJECT.Trim().ToLower()
        $cleanQuery = Clean-Subject $env:SEARCH_SUBJECT
        $matches = @()

        foreach ($item in $items) {
          if ($matches.Count -ge $maxCount) { break }
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
        env: {
          ...process.env,
          SEARCH_SUBJECT: querySubject,
          MAX_EMAILS: String(limit),
          MAX_BODY_CHARS: String(maxChars)
        },
        maxBuffer: 10 * 1024 * 1024
      });

      let rows = [];
      if (stdout && stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        rows = list.map(r => ({
          receivedAt: r.receivedAt || "",
          senderName: Buffer.from(r.senderName || "", "base64").toString("utf-8"),
          senderEmail: Buffer.from(r.senderEmail || "", "base64").toString("utf-8"),
          to: Buffer.from(r.to || "", "base64").toString("utf-8"),
          subject: Buffer.from(r.subject || "", "base64").toString("utf-8"),
          body: Buffer.from(r.body || "", "base64").toString("utf-8")
        }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ rows, source: "local-outlook-agent" }));
    } catch (error) {
      console.error("Local Agent PowerShell Error:", error);
      const errMsg = (error && error.stderr) ? error.stderr.toString() : String(error);
      if (errMsg.includes("0x800401F3") || errMsg.includes("Invalid class string") || errMsg.includes("GetDefaultFolder")) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Gagal mengambil email: Aplikasi Microsoft Outlook Desktop belum dibuka di laptop Anda. Silakan buka aplikasi Microsoft Outlook Desktop terlebih dahulu, lalu coba lagi." }));
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Outlook Search Error: ${errMsg.slice(0, 300)}` }));
      }
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[CR Outlook Agent] Running locally on port ${PORT}`);
});
