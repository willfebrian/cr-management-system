param(
  [string]$DbJson = "D:\Discovery AI\cr-management-system\outputs\issue-created-on-db.json",
  [string]$GlpiWorkbook = "D:\Discovery AI\cr-management-system\GLPI ABAP.xlsx",
  [string]$OutputWorkbook = "D:\Discovery AI\cr-management-system\outputs\issue-created-on-glpi-audit.xlsx"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Normalize-Text([object]$value) {
  if ($null -eq $value) { return "" }
  return ([string]$value).Replace([char]160, " ").Replace("Â", "").Trim()
}

function Xml-Escape([object]$value) {
  if ($null -eq $value) { return "" }
  return [System.Security.SecurityElement]::Escape([string]$value)
}

function Column-Index([string]$ref) {
  $letters = ([regex]::Match($ref, "^[A-Z]+")).Value
  $index = 0
  foreach ($ch in $letters.ToCharArray()) {
    $index = ($index * 26) + ([int][char]$ch - [int][char]'A' + 1)
  }
  return $index
}

function Excel-Serial-To-Date([string]$value) {
  $number = 0.0
  if ([double]::TryParse($value, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return ([datetime]"1899-12-30").AddDays($number)
  }
  return $null
}

function Parse-Date([object]$value) {
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) { return $null }
  if ($value -is [datetime]) { return $value }
  $text = Normalize-Text $value
  $m = [regex]::Match($text, "^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$")
  if ($m.Success) {
    $second = if ($m.Groups[6].Success) { [int]$m.Groups[6].Value } else { 0 }
    return [datetime]::new([int]$m.Groups[3].Value, [int]$m.Groups[2].Value, [int]$m.Groups[1].Value, [int]$m.Groups[4].Value, [int]$m.Groups[5].Value, $second)
  }
  $formats = @("dd-MM-yyyy HH:mm", "dd-MM-yyyy HH:mm:ss", "yyyy-MM-dd HH:mm:ss", "dd/MM/yyyy HH:mm", "dd/MM/yyyy HH:mm:ss")
  $parsed = [datetime]::MinValue
  if ([datetime]::TryParseExact($text, $formats, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeLocal, [ref]$parsed)) { return $parsed }
  if ([datetime]::TryParse($text, [ref]$parsed)) { return $parsed }
  return $null
}

function Format-Date([object]$value) {
  $date = Parse-Date $value
  if ($null -eq $date) { return "" }
  return $date.ToString("yyyy-MM-dd HH:mm:ss")
}

function Read-Xlsx-First-Sheet([string]$path) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($path)
  try {
    $shared = @()
    $sharedEntry = $zip.GetEntry("xl/sharedStrings.xml")
    if ($sharedEntry) {
      $reader = New-Object System.IO.StreamReader($sharedEntry.Open())
      [xml]$sharedXml = $reader.ReadToEnd()
      $reader.Close()
      foreach ($si in $sharedXml.sst.si) {
        $shared += (($si.InnerText) -replace "`r?`n", "")
      }
    }
    $sheetEntry = $zip.GetEntry("xl/worksheets/sheet1.xml")
    if (-not $sheetEntry) { throw "Cannot find xl/worksheets/sheet1.xml in $path" }
    $reader = New-Object System.IO.StreamReader($sheetEntry.Open())
    [xml]$sheetXml = $reader.ReadToEnd()
    $reader.Close()

    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($row in $sheetXml.worksheet.sheetData.row) {
      $map = @{}
      foreach ($cell in $row.c) {
        $col = Column-Index $cell.r
        $valueNode = $cell.SelectSingleNode("*[local-name()='v']")
        $raw = if ($valueNode) { [string]$valueNode.InnerText } else { "" }
        $value = $raw
        $cellType = $cell.GetAttribute("t")
        if ($cellType -eq "s" -and $raw -ne "") { $value = $shared[[int]$raw] }
        elseif ($cellType -eq "inlineStr") {
          $inlineNode = $cell.SelectSingleNode("*[local-name()='is']")
          $value = if ($inlineNode) { $inlineNode.InnerText } else { "" }
        }
        $map[$col] = Normalize-Text $value
      }
      $rows.Add($map)
    }
    return $rows
  } finally {
    $zip.Dispose()
  }
}

function Row-Xml([object[]]$values, [int]$style = 0) {
  $cells = New-Object System.Text.StringBuilder
  for ($i = 0; $i -lt $values.Count; $i++) {
    $s = if ($style -gt 0) { " s=`"$style`"" } else { "" }
    [void]$cells.Append("<c$s t=`"inlineStr`"><is><t>$(Xml-Escape $values[$i])</t></is></c>")
  }
  return "<row>$cells</row>"
}

function Sheet-Xml([object[]]$headers, [object[]]$rows) {
  $body = New-Object System.Text.StringBuilder
  [void]$body.Append((Row-Xml $headers 1))
  foreach ($row in $rows) { [void]$body.Append((Row-Xml $row.Values $row.Style)) }
  return "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><worksheet xmlns=`"http://schemas.openxmlformats.org/spreadsheetml/2006/main`"><sheetViews><sheetView workbookViewId=`"0`"><pane ySplit=`"1`" topLeftCell=`"A2`" activePane=`"bottomLeft`" state=`"frozen`"/></sheetView></sheetViews><sheetData>$body</sheetData><autoFilter ref=`"A1:P1`"/></worksheet>"
}

function Add-Zip-Text($zip, [string]$path, [string]$text) {
  $entry = $zip.CreateEntry($path)
  $writer = New-Object System.IO.StreamWriter($entry.Open(), [System.Text.UTF8Encoding]::new($false))
  $writer.Write($text)
  $writer.Close()
}

$db = Get-Content -Path $DbJson -Raw | ConvertFrom-Json
$issues = @($db.rows)
$glpiRaw = Read-Xlsx-First-Sheet $GlpiWorkbook
$headersRaw = $glpiRaw[0]
$headerMap = @{}
foreach ($key in $headersRaw.Keys) {
  $headerMap[(Normalize-Text $headersRaw[$key]).ToUpperInvariant()] = $key
}
foreach ($required in @("ID", "TITLE", "OPENING DATE")) {
  if (-not $headerMap.ContainsKey($required)) { throw "Required GLPI column '$required' not found" }
}

$glpiRows = New-Object System.Collections.Generic.List[object]
$glpiById = @{}
for ($i = 1; $i -lt $glpiRaw.Count; $i++) {
  $r = $glpiRaw[$i]
  $idText = Normalize-Text $r[$headerMap["ID"]]
  $id = 0
  if (-not [int]::TryParse(($idText -replace "\D", ""), [ref]$id)) { continue }
  $openingRaw = $r[$headerMap["OPENING DATE"]]
  $opening = if ($openingRaw -match "^\d+(\.\d+)?$") { Excel-Serial-To-Date $openingRaw } else { Parse-Date $openingRaw }
  $item = [pscustomobject]@{
    ID = $id
    Title = Normalize-Text $r[$headerMap["TITLE"]]
    OpeningDate = $opening
    Status = if ($headerMap.ContainsKey("STATUS")) { Normalize-Text $r[$headerMap["STATUS"]] } else { "" }
    Requester = if ($headerMap.ContainsKey("REQUESTER - REQUESTER")) { Normalize-Text $r[$headerMap["REQUESTER - REQUESTER"]] } else { "" }
    UsedByIssue = ""
  }
  $glpiRows.Add($item)
  if (-not $glpiById.ContainsKey($id)) { $glpiById[$id] = New-Object System.Collections.Generic.List[object] }
  $glpiById[$id].Add($item)
}

$matchedIds = New-Object System.Collections.Generic.HashSet[int]
$auditRows = New-Object System.Collections.Generic.List[object]
$matched = 0; $notFound = 0; $conflict = 0; $defaultEight = 0
foreach ($issue in $issues) {
  $issueKey = [string]$issue.issue_key
  $allGlpiNumbers = @()
  if ($issue.all_glpi_tickets) {
    $allGlpiNumbers = ([string]$issue.all_glpi_tickets).Split(",") | ForEach-Object {
      $n = 0
      if ([int]::TryParse(($_ -replace "\D", "").Trim(), [ref]$n)) { $n }
    }
  }
  $glpiMatches = New-Object System.Collections.Generic.List[object]
  foreach ($ticket in $allGlpiNumbers) {
    if ($glpiById.ContainsKey($ticket)) { foreach ($m in $glpiById[$ticket]) { $glpiMatches.Add($m) } }
  }
  $titleMatches = @($glpiRows | Where-Object { $_.Title -match [regex]::Escape($issueKey) })
  $chosen = $null; $method = ""; $status = "Not Found"; $notes = ""
  if ($glpiMatches.Count -gt 0) {
    $chosen = $glpiMatches[0]; $method = "GLPI ID"; $status = "Matched"
    if ($titleMatches.Count -gt 0 -and $titleMatches[0].ID -eq $chosen.ID) { $method = "GLPI ID + Title" }
    elseif ($titleMatches.Count -gt 0 -and $titleMatches[0].ID -ne $chosen.ID) { $status = "Conflict"; $notes = "GLPI ID points to $($chosen.ID), title match points to $($titleMatches[0].ID)." }
  } elseif ($titleMatches.Count -gt 0) {
    $chosen = $titleMatches[0]; $method = "Title contains Issue"; $status = "Matched"
  }
  if ($chosen) {
    [void]$matchedIds.Add([int]$chosen.ID)
    if ($chosen.UsedByIssue) { $notes = (($notes, "GLPI row also matched by $($chosen.UsedByIssue).") | Where-Object { $_ }) -join " " }
    $chosen.UsedByIssue = if ($chosen.UsedByIssue) { "$($chosen.UsedByIssue), $issueKey" } else { $issueKey }
  }
  $asis = Parse-Date $issue.create_issue_date_jkt
  $toBe = if ($chosen) { $chosen.OpeningDate } else { $null }
  $isEight = $asis -and $asis.ToString("HH:mm:ss") -eq "08:00:00"
  if ($isEight) { $defaultEight++ }
  if ($status -eq "Matched") { $matched++ } elseif ($status -eq "Conflict") { $conflict++ } else { $notFound++ }
  $delta = if ($asis -and $toBe) { [math]::Round((New-TimeSpan -Start $asis -End $toBe).TotalMinutes, 0) } else { "" }
  $style = if ($status -eq "Conflict") { 4 } elseif ($status -eq "Not Found") { 2 } elseif ($isEight -and $toBe) { 3 } else { 0 }
  $auditRows.Add([pscustomobject]@{
    Style = $style
    Values = @(
      $issue.id, $issueKey, $issue.issue_name, $issue.issue_status,
      $issue.primary_glpi_ticket, $issue.all_glpi_tickets, (Format-Date $asis), $isEight,
      $status, $method, $(if ($chosen) { $chosen.ID } else { "" }),
      $(if ($chosen) { $chosen.Title } else { "" }), (Format-Date $toBe), (Format-Date $toBe), $delta, $notes
    )
  })
}

$glpiUnmatchedRows = @($glpiRows | Where-Object { -not $matchedIds.Contains([int]$_.ID) } | ForEach-Object {
  [pscustomobject]@{ Style = 0; Values = @($_.ID, $_.Title, (Format-Date $_.OpeningDate), $_.Status, $_.Requester) }
})
$glpiUnmatchedCount = $glpiRows.Count - $matchedIds.Count
$summaryRows = @(
  [pscustomobject]@{ Style = 0; Values = @("Generated At", (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")) },
  [pscustomobject]@{ Style = 0; Values = @("Issue Rows", $issues.Count) },
  [pscustomobject]@{ Style = 0; Values = @("Matched to GLPI ABAP", $matched) },
  [pscustomobject]@{ Style = 0; Values = @("Not Found in GLPI ABAP", $notFound) },
  [pscustomobject]@{ Style = 0; Values = @("Conflict", $conflict) },
  [pscustomobject]@{ Style = 0; Values = @("AS-IS time exactly 08:00:00", $defaultEight) },
  [pscustomobject]@{ Style = 0; Values = @("GLPI ABAP rows", $glpiRows.Count) },
  [pscustomobject]@{ Style = 0; Values = @("GLPI ABAP rows not mapped to Issue", $glpiUnmatchedCount) }
)

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("issue-glpi-audit-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  $zipPath = Join-Path $tmp "audit.xlsx"
  $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    Add-Zip-Text $zip "[Content_Types].xml" '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    Add-Zip-Text $zip "_rels/.rels" '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    Add-Zip-Text $zip "xl/_rels/workbook.xml.rels" '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
    Add-Zip-Text $zip "xl/workbook.xml" '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Issue GLPI Audit" sheetId="2" r:id="rId2"/><sheet name="GLPI Not In Issue" sheetId="3" r:id="rId3"/></sheets></workbook>'
    Add-Zip-Text $zip "xl/styles.xml" '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="5"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf fontId="0" fillId="4" borderId="0" applyFill="1"/><xf fontId="0" fillId="3" borderId="0" applyFill="1"/><xf fontId="0" fillId="4" borderId="0" applyFill="1"/></cellXfs></styleSheet>'
    Add-Zip-Text $zip "xl/worksheets/sheet1.xml" (Sheet-Xml @("Metric", "Value") $summaryRows)
    Add-Zip-Text $zip "xl/worksheets/sheet2.xml" (Sheet-Xml @("Issue ID", "Issue", "Issue Name", "Status", "DB GLPI Primary", "DB GLPI All", "AS-IS Create On", "Is 08:00:00", "Match Status", "Match Method", "GLPI Excel ID", "GLPI Title", "GLPI Opening Date", "TO-BE Create On", "Delta Minutes", "Notes") $auditRows)
    Add-Zip-Text $zip "xl/worksheets/sheet3.xml" (Sheet-Xml @("GLPI ID", "Title", "Opening Date", "Status", "Requester") $glpiUnmatchedRows)
  } finally {
    $zip.Dispose()
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputWorkbook) | Out-Null
  if (Test-Path $OutputWorkbook) { Remove-Item $OutputWorkbook -Force }
  Copy-Item -Path $zipPath -Destination $OutputWorkbook
  Write-Output "Created $OutputWorkbook"
  Write-Output "Matched=$matched NotFound=$notFound Conflict=$conflict Default0800=$defaultEight"
} finally {
  Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
