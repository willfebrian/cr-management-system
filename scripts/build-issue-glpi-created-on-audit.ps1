param(
  [string]$ProjectRoot = "D:\Discovery AI\cr-management-system",
  [string]$DbJson = "D:\Discovery AI\cr-management-system\outputs\issue-created-on-db.json",
  [string]$GlpiWorkbook = "D:\Discovery AI\cr-management-system\GLPI ABAP.xlsx",
  [string]$OutputWorkbook = "D:\Discovery AI\cr-management-system\outputs\issue-created-on-glpi-audit.xlsx"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Text([object]$value) {
  if ($null -eq $value) { return "" }
  return ([string]$value).Replace([char]160, " ").Replace("Â", "").Trim()
}

function Parse-Glpi-Date([object]$value) {
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) { return $null }
  if ($value -is [datetime]) { return $value }
  $text = Normalize-Text $value
  $formats = @(
    "dd-MM-yyyy HH:mm",
    "dd-MM-yyyy HH:mm:ss",
    "dd/MM/yyyy HH:mm",
    "dd/MM/yyyy HH:mm:ss",
    "yyyy-MM-dd HH:mm:ss"
  )
  $culture = [System.Globalization.CultureInfo]::InvariantCulture
  $styles = [System.Globalization.DateTimeStyles]::AssumeLocal
  $parsed = [datetime]::MinValue
  if ([datetime]::TryParseExact($text, $formats, $culture, $styles, [ref]$parsed)) { return $parsed }
  if ([datetime]::TryParse($text, [ref]$parsed)) { return $parsed }
  return $null
}

function To-Excel-Date([object]$value) {
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) { return $null }
  if ($value -is [datetime]) { return $value }
  $parsed = [datetime]::MinValue
  if ([datetime]::TryParse([string]$value, [ref]$parsed)) { return $parsed }
  return $null
}

function Set-Header($sheet, [string[]]$headers) {
  for ($i = 0; $i -lt $headers.Count; $i++) {
    $cell = $sheet.Cells.Item(1, $i + 1)
    $cell.Value2 = $headers[$i]
    $cell.Font.Bold = $true
    $cell.Interior.Color = 14277081
  }
  $sheet.Rows.Item(1).AutoFilter() | Out-Null
}

function Set-Cell($sheet, [int]$row, [int]$col, [object]$value) {
  if ($null -eq $value) {
    $sheet.Cells.Item($row, $col).Value2 = ""
  } elseif ($value -is [datetime]) {
    $sheet.Cells.Item($row, $col).Value2 = $value
  } else {
    $sheet.Cells.Item($row, $col).Value2 = [string]$value
  }
}

$db = Get-Content -Path $DbJson -Raw | ConvertFrom-Json
$issues = @($db.rows)

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$glpiBook = $null
$outBook = $null
try {
  $glpiBook = $excel.Workbooks.Open($GlpiWorkbook)
  $glpiSheet = $glpiBook.Worksheets.Item(1)
  $used = $glpiSheet.UsedRange
  $rowCount = $used.Rows.Count
  $colCount = $used.Columns.Count

  $headerMap = @{}
  for ($c = 1; $c -le $colCount; $c++) {
    $name = Normalize-Text $glpiSheet.Cells.Item(1, $c).Text
    if ($name) { $headerMap[$name.ToUpperInvariant()] = $c }
  }

  foreach ($required in @("ID", "TITLE", "OPENING DATE")) {
    if (-not $headerMap.ContainsKey($required)) {
      throw "Required GLPI column '$required' not found in $GlpiWorkbook"
    }
  }

  $glpiRows = New-Object System.Collections.Generic.List[object]
  $glpiById = @{}
  for ($r = 2; $r -le $rowCount; $r++) {
    $idText = Normalize-Text $glpiSheet.Cells.Item($r, $headerMap["ID"]).Text
    if (-not $idText) { continue }
    $idNumber = 0
    if (-not [int]::TryParse(($idText -replace "\D", ""), [ref]$idNumber)) { continue }
    $title = Normalize-Text $glpiSheet.Cells.Item($r, $headerMap["TITLE"]).Text
    $openingDate = Parse-Glpi-Date $glpiSheet.Cells.Item($r, $headerMap["OPENING DATE"]).Value2
    $item = [pscustomobject]@{
      Row = $r
      ID = $idNumber
      Title = $title
      OpeningDate = $openingDate
      Status = if ($headerMap.ContainsKey("STATUS")) { Normalize-Text $glpiSheet.Cells.Item($r, $headerMap["STATUS"]).Text } else { "" }
      Requester = if ($headerMap.ContainsKey("REQUESTER - REQUESTER")) { Normalize-Text $glpiSheet.Cells.Item($r, $headerMap["REQUESTER - REQUESTER"]).Text } else { "" }
      UsedByIssue = ""
    }
    $glpiRows.Add($item)
    if (-not $glpiById.ContainsKey($idNumber)) { $glpiById[$idNumber] = New-Object System.Collections.Generic.List[object] }
    $glpiById[$idNumber].Add($item)
  }

  $outBook = $excel.Workbooks.Add()
  while ($outBook.Worksheets.Count -gt 1) {
    $outBook.Worksheets.Item($outBook.Worksheets.Count).Delete()
  }

  $audit = $outBook.Worksheets.Item(1)
  $audit.Name = "Issue GLPI Audit"
  $headers = @(
    "Issue ID", "Issue", "Issue Name", "Status", "DB GLPI Primary", "DB GLPI All",
    "AS-IS Create On", "Is 08:00:00", "Match Status", "Match Method",
    "GLPI Excel ID", "GLPI Title", "GLPI Opening Date", "TO-BE Create On",
    "Delta Minutes", "Notes"
  )
  Set-Header $audit $headers

  $matchedIds = New-Object System.Collections.Generic.HashSet[int]
  $row = 2
  foreach ($issue in $issues) {
    $issueKey = [string]$issue.issue_key
    $primaryGlpi = if ($null -ne $issue.primary_glpi_ticket) { [int]$issue.primary_glpi_ticket } else { $null }
    $allGlpiNumbers = @()
    if ($issue.all_glpi_tickets) {
      $allGlpiNumbers = ([string]$issue.all_glpi_tickets).Split(",") | ForEach-Object {
        $n = 0
        if ([int]::TryParse(($_ -replace "\D", "").Trim(), [ref]$n)) { $n }
      }
    }

    $glpiMatches = New-Object System.Collections.Generic.List[object]
    foreach ($ticket in $allGlpiNumbers) {
      if ($glpiById.ContainsKey($ticket)) {
        foreach ($match in $glpiById[$ticket]) { $glpiMatches.Add($match) }
      }
    }
    $titleMatches = @($glpiRows | Where-Object { $_.Title -match [regex]::Escape($issueKey) })

    $chosen = $null
    $matchMethod = ""
    $matchStatus = "Not Found"
    $notes = ""

    if ($glpiMatches.Count -gt 0) {
      $chosen = $glpiMatches[0]
      $matchMethod = "GLPI ID"
      $matchStatus = "Matched"
      if ($titleMatches.Count -gt 0 -and ($titleMatches[0].ID -eq $chosen.ID)) {
        $matchMethod = "GLPI ID + Title"
      } elseif ($titleMatches.Count -gt 0 -and ($titleMatches[0].ID -ne $chosen.ID)) {
        $matchStatus = "Conflict"
        $notes = "GLPI ID points to $($chosen.ID), title match points to $($titleMatches[0].ID)."
      }
    } elseif ($titleMatches.Count -gt 0) {
      $chosen = $titleMatches[0]
      $matchMethod = "Title contains Issue"
      $matchStatus = "Matched"
    }

    if ($null -ne $chosen) {
      $matchedIds.Add([int]$chosen.ID) | Out-Null
      if ($chosen.UsedByIssue) {
        $notes = (($notes, "GLPI row also matched by $($chosen.UsedByIssue).") | Where-Object { $_ }) -join " "
      }
      $chosen.UsedByIssue = if ($chosen.UsedByIssue) { "$($chosen.UsedByIssue), $issueKey" } else { $issueKey }
    }

    $asisDate = To-Excel-Date $issue.create_issue_date_jkt
    $toBeDate = if ($null -ne $chosen) { $chosen.OpeningDate } else { $null }
    $delta = if ($asisDate -and $toBeDate) { [math]::Round((New-TimeSpan -Start $asisDate -End $toBeDate).TotalMinutes, 0) } else { $null }
    $isEight = if ($asisDate) { $asisDate.ToString("HH:mm:ss") -eq "08:00:00" } else { $false }

    $values = @(
      $issue.id, $issueKey, $issue.issue_name, $issue.issue_status,
      $(if ($null -ne $primaryGlpi) { $primaryGlpi } else { "" }),
      $issue.all_glpi_tickets, $asisDate, $isEight, $matchStatus, $matchMethod,
      $(if ($null -ne $chosen) { $chosen.ID } else { "" }),
      $(if ($null -ne $chosen) { $chosen.Title } else { "" }),
      $toBeDate, $toBeDate, $delta, $notes
    )
    for ($c = 0; $c -lt $values.Count; $c++) { Set-Cell $audit $row ($c + 1) $values[$c] }
    if ($matchStatus -eq "Not Found") { $audit.Rows.Item($row).Interior.Color = 10092543 }
    elseif ($matchStatus -eq "Conflict") { $audit.Rows.Item($row).Interior.Color = 49407 }
    elseif ($isEight -and $toBeDate) { $audit.Rows.Item($row).Interior.Color = 13434879 }
    $row++
  }

  $unmatched = $outBook.Worksheets.Add([System.Type]::Missing, $audit)
  $unmatched.Name = "GLPI Not In Issue"
  Set-Header $unmatched @("GLPI ID", "Title", "Opening Date", "Status", "Requester")
  $row = 2
  foreach ($g in $glpiRows | Where-Object { -not $matchedIds.Contains([int]$_.ID) }) {
    $values = @($g.ID, $g.Title, $g.OpeningDate, $g.Status, $g.Requester)
    for ($c = 0; $c -lt $values.Count; $c++) { Set-Cell $unmatched $row ($c + 1) $values[$c] }
    $row++
  }

  $summary = $outBook.Worksheets.Add([System.Type]::Missing, $unmatched)
  $summary.Name = "Summary"
  $totalIssues = $issues.Count
  $matchedIssues = ($audit.Range("I2:I$($issues.Count + 1)").Value2 | ForEach-Object { $_ } | Where-Object { $_ -eq "Matched" }).Count
  $notFoundIssues = ($audit.Range("I2:I$($issues.Count + 1)").Value2 | ForEach-Object { $_ } | Where-Object { $_ -eq "Not Found" }).Count
  $conflictIssues = ($audit.Range("I2:I$($issues.Count + 1)").Value2 | ForEach-Object { $_ } | Where-Object { $_ -eq "Conflict" }).Count
  $defaultEight = ($audit.Range("H2:H$($issues.Count + 1)").Value2 | ForEach-Object { $_ } | Where-Object { $_ -eq $true }).Count
  Set-Header $summary @("Metric", "Value")
  $summaryData = @(
    @("Generated At", (Get-Date)),
    @("Issue Rows", $totalIssues),
    @("Matched to GLPI ABAP", $matchedIssues),
    @("Not Found in GLPI ABAP", $notFoundIssues),
    @("Conflict", $conflictIssues),
    @("AS-IS time exactly 08:00:00", $defaultEight),
    @("GLPI ABAP rows", $glpiRows.Count),
    @("GLPI ABAP rows not mapped to Issue", ($glpiRows.Count - $matchedIds.Count))
  )
  $row = 2
  foreach ($item in $summaryData) {
    Set-Cell $summary $row 1 $item[0]
    Set-Cell $summary $row 2 $item[1]
    $row++
  }

  foreach ($sheet in @($summary, $audit, $unmatched)) {
    $sheet.Columns.AutoFit() | Out-Null
    $sheet.Columns.Item(3).ColumnWidth = [Math]::Min($sheet.Columns.Item(3).ColumnWidth, 55)
    $sheet.Columns.Item(12).ColumnWidth = [Math]::Min($sheet.Columns.Item(12).ColumnWidth, 75)
    $sheet.Columns.Item(16).ColumnWidth = [Math]::Min($sheet.Columns.Item(16).ColumnWidth, 65)
    $sheet.Rows.Item(1).Font.Bold = $true
    $sheet.Application.ActiveWindow.SplitRow = 1
    $sheet.Application.ActiveWindow.FreezePanes = $true
  }
  $audit.Columns.Item(7).NumberFormat = "yyyy-mm-dd hh:mm:ss"
  $audit.Columns.Item(13).NumberFormat = "yyyy-mm-dd hh:mm:ss"
  $audit.Columns.Item(14).NumberFormat = "yyyy-mm-dd hh:mm:ss"
  $unmatched.Columns.Item(3).NumberFormat = "yyyy-mm-dd hh:mm:ss"
  $summary.Columns.AutoFit() | Out-Null

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputWorkbook) | Out-Null
  if (Test-Path $OutputWorkbook) { Remove-Item $OutputWorkbook -Force }
  $outBook.SaveAs($OutputWorkbook, 51)
  Write-Output "Created $OutputWorkbook"
} finally {
  if ($glpiBook) { $glpiBook.Close($false) }
  if ($outBook) { $outBook.Close($true) }
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
