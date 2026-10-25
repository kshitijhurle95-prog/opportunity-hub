# Start OpportunityHub GUI & Backend Server
param(
    [int]$Port = 5050,
    [switch]$NoBrowser
)

$serverScript = Join-Path $PSScriptRoot "server.ps1"
$url = "http://localhost:$Port/"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         Launching OpportunityHub GUI Application         " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# Find preferred browser
$browserExe = $null
if (Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe") {
    $browserExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
} elseif (Test-Path "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe") {
    $browserExe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

# Start server as persistent background process
$job = Start-Process powershell -ArgumentList "-NoExit -ExecutionPolicy Bypass -File `"$serverScript`" -Port $Port" -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

if (-not $NoBrowser) {
    if ($browserExe) {
        Write-Host "Opening app in browser: $browserExe" -ForegroundColor Yellow
        Start-Process $browserExe -ArgumentList "--app=$url"
    } else {
        Start-Process $url
    }
}

Write-Host "`nOpportunityHub is now running at: $url" -ForegroundColor Green
Write-Host "PID: $($job.Id)" -ForegroundColor Gray
Write-Host "Press Ctrl+C or close the window to stop the background process if launched directly." -ForegroundColor Gray
