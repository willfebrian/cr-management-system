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

  if (reqUrl.pathname === "/" || reqUrl.pathname === "/health") {
    const isHtml = (req.headers.accept || "").includes("text/html");
    if (isHtml) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CR Outlook Agent</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 2rem; border-radius: 12px; border: 1px solid #334155; box-shadow: 0 4px 20px rgba(0,0,0,0.5); max-width: 460px; text-align: center; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981; padding: 4px 14px; border-radius: 9999px; font-weight: bold; font-size: 0.85rem; margin-bottom: 1rem; }
    h2 { margin: 0 0 0.5rem 0; color: #ffffff; }
    p { color: #94a3b8; font-size: 0.9rem; margin: 0 0 1rem 0; }
    code { background: #0f172a; padding: 3px 8px; border-radius: 4px; color: #38bdf8; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">&#9679; Running Active</div>
    <h2>CR Outlook Agent</h2>
    <p>The agent is running and ready on port <code>18888</code> for passwordless Outlook email extraction.</p>
    <p style="font-size: 0.8rem; color: #64748b; margin-top: 1.5rem;">You can now close this tab and return to CR Management System.</p>
  </div>
</body>
</html>`);
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      message: "CR Outlook Agent is active and running.",
      agent: "cr-outlook-agent",
      platform: process.platform,
      port: PORT,
      endpoints: {
        health: "/health",
        fetchOutlook: "/api/fetch-outlook?q=<subject>&limit=5&maxChars=15000"
      }
    }));
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

    // Limits: 30 days lookback, max 3 results, body capped at 10.000 chars
    const script = `
      $ErrorActionPreference = 'Stop'
      try {
        $outlook = New-Object -ComObject Outlook.Application
        $namespace = $outlook.GetNamespace("MAPI")
        $inbox = $namespace.GetDefaultFolder(6)
        $items = $inbox.Items
        
        try { $items.Sort("[ReceivedTime]", $true) } catch {}

<<<<<<< HEAD
        # Only scan emails from the last 30 days
        $cutoffDate = (Get-Date).AddDays(-30)
=======
        $maxCount = [int]$env:MAX_EMAILS
        if ($maxCount -le 0) { $maxCount = 5 }

        $maxCharsLimit = [int]$env:MAX_BODY_CHARS
        if ($maxCharsLimit -le 0) { $maxCharsLimit = 15000 }
>>>>>>> fe9fa9e02d9c9d07958062b6e651aa014cf55069

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
<<<<<<< HEAD
          if ($s.Length -gt 10000) { $s = $s.Substring(0, 10000) }
=======
          if ($s.Length -gt $maxCharsLimit) { $s = $s.Substring(0, $maxCharsLimit) }
>>>>>>> fe9fa9e02d9c9d07958062b6e651aa014cf55069
          $bytes = [System.Text.Encoding]::UTF8.GetBytes($s)
          return [System.Convert]::ToBase64String($bytes)
        }

        $rawQuery = $env:SEARCH_SUBJECT.Trim().ToLower()
        $cleanQuery = Clean-Subject $env:SEARCH_SUBJECT
        $matches = @()
        $scanCount = 0
        $maxScan = 250

        foreach ($item in $items) {
<<<<<<< HEAD
          if ($matches.Count -ge 3) { break }
=======
          $scanCount++
          if ($scanCount -gt $maxScan -or $matches.Count -ge $maxCount) { break }
>>>>>>> fe9fa9e02d9c9d07958062b6e651aa014cf55069
          try {
            # Stop scanning if email is older than 30 days (items sorted newest first)
            $recTime = $null
            try { $recTime = $item.ReceivedTime } catch {}
            if ($recTime -and $recTime -lt $cutoffDate) { break }

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
              $recTimeStr = ""
              try { $recTimeStr = $item.ReceivedTime.ToString("yyyy-MM-dd HH:mm:ss") } catch { $recTimeStr = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") }

              $matches += [PSCustomObject]@{
                receivedAt = $recTimeStr
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
