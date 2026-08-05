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

      let rows = [];
      if (stdout && stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        rows = Array.isArray(parsed) ? parsed : [parsed];
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ rows, source: "local-outlook-agent" }));
    } catch (error) {
      console.error("Local Agent PowerShell Error:", error);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Gagal mengambil email: Aplikasi Microsoft Outlook Desktop belum dibuka di laptop Anda. Silakan buka aplikasi Microsoft Outlook Desktop terlebih dahulu, lalu coba lagi." }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[CR Outlook Agent] Running locally on port ${PORT}`);
});
