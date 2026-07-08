param(
  [string]$AuditWorkbook = "D:\Discovery AI\cr-management-system\outputs\issue-created-on-glpi-audit.xlsx",
  [string]$OutputWorkbook = "D:\Discovery AI\cr-management-system\outputs\issue-created-on-final-dry-run.xlsx"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Text([object]$value) {
  if ($null -eq $value) { return "" }
  return ([string]$value).Replace([char]160, " ").Replace("Â", "").Trim()
}

function Parse-Date-Text([string]$value) {
  $text = Normalize-Text $value
  if (-not $text) { return "" }
  $m = [regex]::Match($text, "^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$")
  if ($m.Success) { return $text }
  $m = [regex]::Match($text, "^Koreksi timestamp menjadi\s+(.+)$")
  if ($m.Success) { return (Normalize-Text $m.Groups[1].Value) }
  return $text
}

function Xml-Escape([object]$value) {
  if ($null -eq $value) { return "" }
  return [System.Security.SecurityElement]::Escape([string]$value)
}

function Row-Xml([object[]]$values, [int]$style = 0) {
  $cells = New-Object System.Text.StringBuilder
  foreach ($value in $values) {
    $styleAttr = if ($style -gt 0) { " s=`"$style`"" } else { "" }
    [void]$cells.Append("<c$styleAttr t=`"inlineStr`"><is><t>$(Xml-Escape $value)</t></is></c>")
  }
  return "<row>$cells</row>"
}

function Sheet-Xml([object[]]$headers, [object[]]$rows) {
  $body = New-Object System.Text.StringBuilder
  [void]$body.Append((Row-Xml $headers 1))
  foreach ($row in $rows) { [void]$body.Append((Row-Xml $row 0)) }
  return "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><worksheet xmlns=`"http://schemas.openxmlformats.org/spreadsheetml/2006/main`"><sheetViews><sheetView workbookViewId=`"0`"><pane ySplit=`"1`" topLeftCell=`"A2`" activePane=`"bottomLeft`" state=`"frozen`"/></sheetView></sheetViews><cols><col min=`"1`" max=`"1`" width=`"14`" customWidth=`"1`"/><col min=`"2`" max=`"2`" width=`"70`" customWidth=`"1`"/><col min=`"3`" max=`"4`" width=`"22`" customWidth=`"1`"/></cols><sheetData>$body</sheetData><autoFilter ref=`"A1:D1`"/></worksheet>"
}

function Add-Zip-Text($zip, [string]$path, [string]$text) {
  $entry = $zip.CreateEntry($path)
  $writer = New-Object System.IO.StreamWriter($entry.Open(), [System.Text.UTF8Encoding]::new($false))
  $writer.Write($text)
  $writer.Close()
}

$tempAudit = Join-Path ([System.IO.Path]::GetTempPath()) ("issue-created-on-glpi-audit-" + [guid]::NewGuid() + ".xlsx")
Copy-Item -Path $AuditWorkbook -Destination $tempAudit -Force

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$auditBook = $null
try {
  $auditBook = $excel.Workbooks.Open($tempAudit)
  $audit = $auditBook.Worksheets.Item("Issue GLPI Audit")
  $lastRow = $audit.UsedRange.Rows.Count

  $headers = @("Issue", "Issue Name", "AS-IS Create On", "Final TO-BE Create On")
  $rows = New-Object System.Collections.Generic.List[object]
  for ($r = 2; $r -le $lastRow; $r++) {
    $instruction = Normalize-Text $audit.Cells.Item($r, 17).Text
    $finalToBe = ""
    if ($instruction -eq "Sesuaikan dengan timestamp TO-BE Create On") {
      $finalToBe = Parse-Date-Text $audit.Cells.Item($r, 14).Text
    } elseif ($instruction -match "^Koreksi timestamp menjadi\s+") {
      $finalToBe = Parse-Date-Text $instruction
    } else {
      continue
    }

    if (-not $finalToBe) { continue }
    $rows.Add(@(
      (Normalize-Text $audit.Cells.Item($r, 2).Text),
      (Normalize-Text $audit.Cells.Item($r, 3).Text),
      (Parse-Date-Text $audit.Cells.Item($r, 7).Text),
      $finalToBe
    ))
  }
  $auditBook.Close($false)
  $auditBook = $null

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputWorkbook) | Out-Null
  if (Test-Path $OutputWorkbook) { Remove-Item $OutputWorkbook -Force }

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("issue-created-dry-run-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
  $zipPath = Join-Path $tmpDir "dry-run.xlsx"
  $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    Add-Zip-Text $zip "[Content_Types].xml" '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    Add-Zip-Text $zip "_rels/.rels" '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    Add-Zip-Text $zip "xl/_rels/workbook.xml.rels" '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
    Add-Zip-Text $zip "xl/workbook.xml" '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Final Dry Run" sheetId="1" r:id="rId1"/></sheets></workbook>'
    Add-Zip-Text $zip "xl/styles.xml" '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>'
    Add-Zip-Text $zip "xl/worksheets/sheet1.xml" (Sheet-Xml $headers $rows)
  } finally {
    $zip.Dispose()
  }
  Copy-Item -Path $zipPath -Destination $OutputWorkbook -Force
  Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

  Write-Output "Created $OutputWorkbook"
  Write-Output ("Rows=" + $rows.Count)
} finally {
  if ($auditBook) { $auditBook.Close($false) }
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  Remove-Item -Path $tempAudit -Force -ErrorAction SilentlyContinue
}
