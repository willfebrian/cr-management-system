$ErrorActionPreference = 'Stop'
try {
  $outlook = New-Object -ComObject Outlook.Application
  $namespace = $outlook.GetNamespace("MAPI")
  $inbox = $namespace.GetDefaultFolder(6)
  $items = $inbox.Items
  $items.Sort("[ReceivedTime]", $true)
  
  $scanned = 0
  $matches = @()
  foreach ($item in $items) {
    $scanned++
    if ($scanned -gt 100) { break }
    try {
      if ($item.Subject) {
        $matches += $item.Subject
      }
    } catch {}
  }
  Write-Host "Success! Scanned: $scanned items in Inbox. Found $($matches.Count) subjects."
} catch {
  Write-Host "Error: $_"
}
