param(
  [Parameter(Mandatory = $true)]
  [string]$Workbook
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Text([object]$value) {
  if ($null -eq $value) { return "" }
  return ([string]$value).Replace([char]160, " ").Replace("Ã‚", "").Trim()
}

$tempWorkbook = Join-Path ([System.IO.Path]::GetTempPath()) ("issue-created-final-" + [guid]::NewGuid() + ".xlsx")
Copy-Item -Path $Workbook -Destination $tempWorkbook -Force

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$book = $null

try {
  $book = $excel.Workbooks.Open($tempWorkbook)
  $sheet = $book.Worksheets.Item("Final Dry Run")
  $lastRow = $sheet.UsedRange.Rows.Count
  $rows = New-Object System.Collections.Generic.List[object]

  for ($r = 2; $r -le $lastRow; $r++) {
    $issue = Normalize-Text $sheet.Cells.Item($r, 1).Text
    $issueName = Normalize-Text $sheet.Cells.Item($r, 2).Text
    $asIs = Normalize-Text $sheet.Cells.Item($r, 3).Text
    $finalToBe = Normalize-Text $sheet.Cells.Item($r, 4).Text
    if (-not $issue -or -not $finalToBe) { continue }
    $rows.Add([ordered]@{
      issue = $issue
      issueName = $issueName
      asIsCreateOn = $asIs
      finalToBeCreateOn = $finalToBe
    })
  }

  $book.Close($false)
  $book = $null
  $rows | ConvertTo-Json -Depth 4 -Compress
} finally {
  if ($book) { $book.Close($false) }
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  Remove-Item -Path $tempWorkbook -Force -ErrorAction SilentlyContinue
}
