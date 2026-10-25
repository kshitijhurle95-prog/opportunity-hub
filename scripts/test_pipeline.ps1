# Phase 1 Test & Verification Script
param (
    [string]$ConfigPath = "config/user_profile.example.json",
    [string]$CacheFile = "config/.cache_seen_ids.json"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Opportunity Tracker: Phase 1 Pipeline Verification     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Load User Profile Config
if (Test-Path $ConfigPath) {
    $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    Write-Host "[OK] Loaded configuration from $ConfigPath" -ForegroundColor Green
} else {
    Write-Error "Config file not found at $ConfigPath"
    exit 1
}

$targetSkills = $config.preferences.skills
$allOpportunities = @()

# 2. Fetch Devpost Hackathons
Write-Host "`n[1/3] Fetching Devpost Hackathons..." -ForegroundColor Yellow
try {
    $devpostRes = Invoke-RestMethod -Uri "https://devpost.com/api/hackathons" -Headers @{ "User-Agent" = "OpportunityTracker/1.0" } -TimeoutSec 10
    $devpostCount = 0
    foreach ($h in $devpostRes.hackathons) {
        $themes = @()
        if ($h.themes) {
            foreach ($t in $h.themes) {
                if ($t.name) { $themes += $t.name } else { $themes += $t.ToString() }
            }
        }
        $loc = "Online"
        if ($h.displayed_location -and $h.displayed_location.location) {
            $loc = $h.displayed_location.location
        }
        $org = "Devpost Partner"
        if ($h.organization_name) {
            $org = $h.organization_name
        }

        $allOpportunities += [PSCustomObject]@{
            id           = "devpost_$($h.id)"
            source       = "Devpost"
            title        = $h.title
            organization = $org
            location     = $loc
            skills       = $themes
            postedDate   = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            deadline     = $h.submission_period_dates
            applyLink    = $h.url
            detailsURL   = $h.url
            type         = "hackathon"
        }
        $devpostCount++
    }
    Write-Host "   [OK] Fetched $devpostCount hackathons from Devpost" -ForegroundColor Green
} catch {
    Write-Warning "   [!] Failed to fetch Devpost: $($_.Exception.Message)"
}

# 3. Fetch HackerEarth Challenges
Write-Host "`n[2/3] Fetching HackerEarth Challenges..." -ForegroundColor Yellow
try {
    $heRes = Invoke-RestMethod -Uri "https://www.hackerearth.com/api/events/upcoming/" -Headers @{ "User-Agent" = "OpportunityTracker/1.0" } -TimeoutSec 10
    $heCount = 0
    if ($heRes.response) {
        foreach ($e in $heRes.response) {
            $rawId = ($e.title -replace '[^a-zA-Z0-9]+', '_').ToLower()
            $org = if ($e.is_hackerearth) { "HackerEarth" } else { "HackerEarth Partner" }
            $posted = if ($e.start_utc_tz) { $e.start_utc_tz } else { (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ") }
            $deadline = if ($e.end_tz) { $e.end_tz } else { $e.end_date }

            $allOpportunities += [PSCustomObject]@{
                id           = "hackerearth_$rawId"
                source       = "HackerEarth"
                title        = $e.title
                organization = $org
                location     = "Online"
                skills       = @("Coding", "Algorithms", "Hackathon", "AI")
                postedDate   = $posted
                deadline     = $deadline
                applyLink    = $e.url
                detailsURL   = $e.url
                type         = "challenge"
            }
            $heCount++
        }
    }
    Write-Host "   [OK] Fetched $heCount challenges from HackerEarth" -ForegroundColor Green
} catch {
    Write-Warning "   [!] Failed to fetch HackerEarth: $($_.Exception.Message)"
}

# 4. Fetch Kaggle Competitions (or Mock if unauthenticated)
Write-Host "`n[3/3] Fetching Kaggle Competitions..." -ForegroundColor Yellow
$kaggleFetched = $false
if ($env:KAGGLE_USERNAME -and $env:KAGGLE_KEY) {
    try {
        $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($env:KAGGLE_USERNAME):$($env:KAGGLE_KEY)"))
        $kaggleRes = Invoke-RestMethod -Uri "https://www.kaggle.com/api/v1/competitions/list" -Headers @{ "Authorization" = "Basic $auth" } -TimeoutSec 10
        foreach ($comp in $kaggleRes) {
            $org = if ($comp.organizationName) { $comp.organizationName } else { "Kaggle" }
            $allOpportunities += [PSCustomObject]@{
                id           = "kaggle_$($comp.id)"
                source       = "Kaggle"
                title        = $comp.title
                organization = $org
                location     = "Remote / Global"
                skills       = @("Machine Learning", "Data Science", "Python")
                postedDate   = $comp.enabledDate
                deadline     = $comp.deadline
                applyLink    = $comp.url
                detailsURL   = $comp.url
                type         = "competition"
            }
        }
        $kaggleFetched = $true
        Write-Host "   [OK] Fetched live competitions from Kaggle API" -ForegroundColor Green
    } catch {
        Write-Warning "   [!] Kaggle API auth failed: $($_.Exception.Message)"
    }
}

if (-not $kaggleFetched) {
    Write-Host "   [*] (No KAGGLE_USERNAME/KEY in environment: using sample Kaggle competition for test)" -ForegroundColor Gray
    $mockKaggle = @(
        [PSCustomObject]@{
            id           = "kaggle_llm_science_exam_2026"
            source       = "Kaggle"
            title        = "LLM Science & Reasoning Challenge 2026"
            organization = "Kaggle Research"
            location     = "Remote / Global"
            skills       = @("Python", "PyTorch", "LLMs", "NLP")
            postedDate   = "2026-10-15T00:00:00Z"
            deadline     = "2026-12-15T23:59:59Z"
            applyLink    = "https://www.kaggle.com/competitions/llm-science-2026"
            detailsURL   = "https://www.kaggle.com/competitions/llm-science-2026"
            type         = "competition"
        }
    )
    $allOpportunities += $mockKaggle
}

Write-Host "`nTotal raw opportunities gathered: $($allOpportunities.Count)" -ForegroundColor Cyan

# 5. Filter by Target Skills
Write-Host "`nFiltering by user profile skills: ($($targetSkills -join ', '))..." -ForegroundColor Yellow
$matchedOpportunities = @()

foreach ($opp in $allOpportunities) {
    $skillsStr = if ($opp.skills) { $opp.skills -join ' ' } else { "" }
    $haystack = "$($opp.title) $($opp.organization) $skillsStr".ToLower()
    $matched = $null
    foreach ($skill in $targetSkills) {
        if ($haystack -like "*$($skill.ToLower())*") {
            $matched = $skill
            break
        }
    }
    if ($matched) {
        $opp | Add-Member -MemberType NoteProperty -Name "matchedSkill" -Value $matched -Force
        $matchedOpportunities += $opp
    }
}

Write-Host "[OK] $($matchedOpportunities.Count) opportunities matched profile criteria" -ForegroundColor Green

# 6. Deduplication Engine
$seenCache = @()
if (Test-Path $CacheFile) {
    try {
        $seenCache = Get-Content $CacheFile -Raw | ConvertFrom-Json
    } catch {}
}
if ($null -eq $seenCache) { $seenCache = @() }

$freshOpportunities = @()
$newCache = [System.Collections.ArrayList]@($seenCache)

foreach ($opp in $matchedOpportunities) {
    if ($seenCache -notcontains $opp.id) {
        $freshOpportunities += $opp
        [void]$newCache.Add($opp.id)
    }
}

# Save updated cache (keep last 1000 items)
if ($newCache.Count -gt 1000) {
    $newCache = $newCache[($newCache.Count - 1000)..($newCache.Count - 1)]
}
$newCache | ConvertTo-Json | Set-Content $CacheFile -Force

Write-Host "[OK] Deduplication: $($freshOpportunities.Count) new opportunities (out of $($matchedOpportunities.Count) matches, $($seenCache.Count) previously seen)" -ForegroundColor Green

# 7. Format Digest
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "                GENERATED NOTIFICATION DIGEST             " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if ($freshOpportunities.Count -eq 0) {
    Write-Host "No new unseen opportunities found in this run." -ForegroundColor Gray
} else {
    foreach ($opp in $freshOpportunities) {
        Write-Host "• [$($opp.source)] $($opp.title)" -ForegroundColor White
        Write-Host "  - Host: $($opp.organization) | Location: $($opp.location)" -ForegroundColor Gray
        Write-Host "  - Matched Tag: $($opp.matchedSkill)" -ForegroundColor Yellow
        Write-Host "  - Deadline: $($opp.deadline)" -ForegroundColor Gray
        Write-Host "  - Apply Link: $($opp.applyLink)" -ForegroundColor Cyan
        Write-Host ""
    }
    
    # Save output sample
    $outputResult = [PSCustomObject]@{
        generatedAt   = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        count         = $freshOpportunities.Count
        opportunities = $freshOpportunities
    }
    $outputResult | ConvertTo-Json -Depth 4 | Set-Content "config/last_digest.json" -Force
    Write-Host "[OK] Digest saved to config/last_digest.json" -ForegroundColor Green
}
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Phase 1 pipeline test completed successfully." -ForegroundColor Green
