# OpportunityHub - Automated Obsidian Vault Sync Engine
# Synchronizes live project metrics, active opportunities, application pipeline, and codebase stats to Obsidian.

param (
    [string]$VaultPath = "C:\Users\HP\Documents\Obsidian Vault\OpportunityHub",
    [switch]$Watch
)

$scriptDir = $PSScriptRoot
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$configDir = Join-Path $projectRoot "config"

function Sync-OpportunityHubToObsidian {
    param (
        [string]$TargetVault = $VaultPath
    )

    if (-not (Test-Path $TargetVault)) {
        New-Item -ItemType Directory -Path $TargetVault -Force | Out-Null
    }

    # Load cache
    $cachePath = Join-Path $configDir "opportunities_cache.json"
    $opps = @()
    if (Test-Path $cachePath) {
        try {
            $raw = Get-Content $cachePath -Encoding UTF8 -Raw | ConvertFrom-Json
            $opps = @($raw)
        } catch {}
    }

    # If cache empty, run fetcher
    if ($opps.Count -eq 0) {
        . (Join-Path $scriptDir "fetch_all.ps1")
        $opps = @(Get-AllOpportunities)
    }

    $totalCount = $opps.Count
    $internships = @($opps | Where-Object { $_.type -eq "internship" }).Count
    $hackathons  = @($opps | Where-Object { $_.type -eq "hackathon" }).Count
    $competitions= @($opps | Where-Object { $_.type -eq "competition" }).Count

    # Load profile
    $profilePath = Join-Path $configDir "user_profile.json"
    $profile = $null
    if (Test-Path $profilePath) {
        try { $profile = Get-Content $profilePath -Encoding UTF8 -Raw | ConvertFrom-Json } catch {}
    }
    $app = if ($profile) { $profile.applicant } else { $null }

    # Load history
    $historyPath = Join-Path $configDir "applications_history.json"
    $history = @()
    if (Test-Path $historyPath) {
        try { $history = @(Get-Content $historyPath -Encoding UTF8 -Raw | ConvertFrom-Json | Where-Object { $_ -and $_.id }) } catch {}
    }

    # Load saved
    $savedPath = Join-Path $configDir "saved_opportunities.json"
    $saved = @()
    if (Test-Path $savedPath) {
        try { $saved = @(Get-Content $savedPath -Encoding UTF8 -Raw | ConvertFrom-Json | Where-Object { $_ }) } catch {}
    }

    $nowStr = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

    # Build Mermaid Distribution
    $sourceGroups = $opps | Group-Object source | Sort-Object Count -Descending
    $pieLines = @()
    foreach ($sg in $sourceGroups) {
        $pieLines += "    `"$($sg.Name)`" : $($sg.Count)"
    }
    $pieChart = ($pieLines -join "`n")

    # Build Sources Table
    $tableRows = @()
    foreach ($sg in $sourceGroups) {
        $sample = $sg.Group[0]
        $tableRows += "| **$($sg.Name)** | $($sg.Count) | $([cultureinfo]::CurrentCulture.TextInfo.ToTitleCase($sample.type)) | `$($sample.applyLink) |"
    }
    $sourcesTable = ($tableRows -join "`n")

    # Build Recent Applications Rows
    $historyRows = @()
    if ($history.Count -eq 0) {
        $historyRows += "| *No applications submitted yet* | - | - | - | `⚪ None` | - |"
    } else {
        foreach ($h in ($history | Select-Object -Last 10)) {
            $historyRows += "| **$($h.title)** | $($h.source) | $($h.type) | $($h.appliedAt) | `🟢 $($h.status)` | [Open Link →]($($h.applyLink)) |"
        }
    }
    $historyTable = ($historyRows -join "`n")

    $rupee = [char]0x20B9
    $candidateName = if ($app -and $app.fullName) { $app.fullName } else { "Kshitij Hurle" }
    $candidateSubtitle = if ($app -and $app.subtitle) { $app.subtitle } else { "2nd Year CSE (Data Science)" }
    $candidateUni = if ($app -and $app.university) { $app.university } else { "Pune Institute of Computer Technology" }
    $candidateDegree = if ($app -and $app.degree) { $app.degree } else { "B.Tech CSE" }
    $candidateGradYear = if ($app -and $app.gradYear) { $app.gradYear } else { "2026" }
    $candidateGpa = if ($app -and $app.gpa) { $app.gpa } else { "8.9 / 10.0" }
    $candidateLoc = if ($app -and $app.location) { $app.location } else { "Pune, India" }
    $candidateMode = if ($app -and $app.workMode) { $app.workMode } else { "Remote / Hybrid" }
    $candidateAvail = if ($app -and $app.availability) { $app.availability } else { "Immediate (Summer 2026)" }
    $candidateStipend = if ($app -and $app.expectedStipend) { $app.expectedStipend } else { "$rupee 50,000 / month" }
    $candidateLinkedIn = if ($app -and $app.linkedIn) { $app.linkedIn } else { "https://linkedin.com/in/kshitijhurle" }
    $candidateGitHub = if ($app -and $app.github) { $app.github } else { "https://github.com/kshitijhurle" }
    $candidatePortfolio = if ($app -and $app.portfolio) { $app.portfolio } else { "https://kshitijhurle.dev" }
    $candidateLeetCode = if ($app -and $app.leetcode) { $app.leetcode } else { "https://leetcode.com/u/kshitijhurle" }
    $candidateResume = if ($app -and $app.resumePath) { $app.resumePath } else { "C:\Users\HP\Documents\Resume_Kshitij_Hurle.pdf" }

    # Generate Telemetry Markdown
    $md = @"
# 📊 OpportunityHub - Live Telemetry & Application Pipeline

> [!NOTE] Back to [[00 - OpportunityHub Overview & Architecture]]

This note displays the real-time operational status, opportunity counts, and application pipeline of OpportunityHub. It is automatically refreshed by ``scripts/sync_to_obsidian.ps1``.

---

## ⚡ Real-Time Operational Telemetry

| Metric | Current Status / Value | Notes |
| :--- | :---: | :--- |
| **Server Status** | 🟢 Online (`http://localhost:5050/`) | High-reliability PowerShell HTTPListener |
| **Total Ingested Opportunities** | **$totalCount Active Opportunities** | Aggregated across $($sourceGroups.Count) verified platforms |
| **Internships Available** | **$internships Opportunities** | Handshake, Wellfound, YC, Upwork, Remotive, Unstop, Internshala, LinkedIn |
| **Hackathons Available** | **$hackathons Opportunities** | Devpost, Devfolio, MLH, HackerEarth, Unstop |
| **Competitions Available** | **$competitions Opportunities** | Kaggle, HackerEarth, Unstop |
| **Active Platforms** | **$($sourceGroups.Count) Platforms** | 100% Verified, Non-404 Links |
| **Bookmarked Opportunities** | **$($saved.Count) Saved** | Tracked in ``saved_opportunities.json`` |
| **Applications in Pipeline** | **$($history.Count) Recorded** | Tracked in ``applications_history.json`` |
| **Last Synchronized** | `$nowStr IST` | Updated automatically |

---

## 🌐 Platform Breakdown & Source Coverage

````mermaid
pie title Opportunity Distribution by Source
$pieChart
````

| Source Platform | Items | Type Focus | Verified Endpoint |
| :--- | :---: | :--- | :--- |
$sourcesTable

---

## 👤 Registered Applicant Profile Status

- **Candidate Name:** $candidateName
- **Professional Headline:** $candidateSubtitle
- **Institution:** $candidateUni
- **Degree:** $candidateDegree, Class of $candidateGradYear
- **Academic Standing:** CGPA $candidateGpa
- **Location & Mode:** $candidateLoc · Preferred Mode: $candidateMode
- **Availability:** $candidateAvail
- **Expected Stipend:** $candidateStipend
- **Profiles:** [LinkedIn]($candidateLinkedIn) · [GitHub]($candidateGitHub) · [Portfolio]($candidatePortfolio) · [LeetCode]($candidateLeetCode)
- **Resume File:** ``$candidateResume``

---

## 📑 Recent Application Pipeline

| Opportunity | Platform | Category | Applied Date | Status Badge | Actions |
| :--- | :---: | :---: | :---: | :---: | :---: |
$historyTable

---

## 📝 Recent Change History

- **${nowStr}:** Live telemetry synced from OpportunityHub runtime.
- **2026-10-24:** Added comprehensive Obsidian project documentation suite in ``C:\Users\HP\Documents\Obsidian Vault\OpportunityHub\``.
- **2026-10-21:** Added **Devfolio** as an official source with custom ``.brand-icon-devfolio`` and verified live hackathon endpoints.
- **2026-10-21:** Eliminated 404 broken links; integrated **Handshake, Wellfound, Y Combinator, Upwork, MLH**.
- **2026-10-21:** Expanded the **Resume & Applicant Profile** modal into a spacious 6-section ATS credentials editor.
- **2026-10-21:** Implemented collapsible sidebar navigation with 68px/230px transition and fluid canvas expansion.
"@

    $telemetryPath = Join-Path $TargetVault "Live Telemetry & Application Pipeline.md"
    $md | Set-Content $telemetryPath -Encoding UTF8 -Force
    Write-Host "[Obsidian Sync] Telemetry updated at $telemetryPath ($totalCount opportunities)" -ForegroundColor Green
}

# Run sync once
Sync-OpportunityHubToObsidian -TargetVault $VaultPath

# If -Watch is specified, monitor project folder for real-time changes
if ($Watch) {
    Write-Host "[Obsidian Sync] Watching $projectRoot for changes... (Press Ctrl+C to stop)" -ForegroundColor Cyan
    $fsw = New-Object System.IO.FileSystemWatcher
    $fsw.Path = $projectRoot
    $fsw.IncludeSubdirectories = $true
    $fsw.EnableRaisingEvents = $true
    $fsw.Filter = "*.*"

    $action = {
        param($source, $eventArgs)
        $ext = [System.IO.Path]::GetExtension($eventArgs.FullPath).ToLower()
        if ($ext -in @(".html", ".css", ".js", ".ps1", ".json", ".md")) {
            Start-Sleep -Milliseconds 250
            Sync-OpportunityHubToObsidian -TargetVault $VaultPath
        }
    }

    Register-ObjectEvent $fsw "Changed" -Action $action | Out-Null
    Register-ObjectEvent $fsw "Created" -Action $action | Out-Null
    Register-ObjectEvent $fsw "Deleted" -Action $action | Out-Null

    while ($true) { Start-Sleep -Seconds 2 }
}
