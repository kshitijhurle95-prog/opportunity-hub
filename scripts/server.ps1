# OpportunityHub Local Backend API & Static Web Server
param(
    [int]$Port = 5050
)

$scriptDir = $PSScriptRoot
$webRoot = Join-Path $scriptDir "..\web"
$configDir = Join-Path $scriptDir "..\config"

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

$profilePath = Join-Path $configDir "user_profile.json"
$exampleProfilePath = Join-Path $configDir "user_profile.example.json"
if (-not (Test-Path $profilePath) -and (Test-Path $exampleProfilePath)) {
    Copy-Item $exampleProfilePath $profilePath -Force
}

$historyPath = Join-Path $configDir "applications_history.json"
if (-not (Test-Path $historyPath)) {
    "[]" | Set-Content $historyPath -Encoding UTF8 -Force
}

$savedPath = Join-Path $configDir "saved_opportunities.json"
if (-not (Test-Path $savedPath)) {
    "[]" | Set-Content $savedPath -Encoding UTF8 -Force
}

$cachePath = Join-Path $configDir "opportunities_cache.json"

# Import Fetcher
. (Join-Path $scriptDir "fetch_all.ps1")

# Initialize HTTP Listener
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Warning "Could not start on port $Port, trying port 5051..."
    $Port = 5051
    $listener = New-Object System.Net.HttpListener
    $prefix = "http://localhost:$Port/"
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   OpportunityHub Application Server Started              " -ForegroundColor Green
Write-Host "   Local Web GUI: $prefix" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Helper to asynchronously sync runtime telemetry to Obsidian
function Invoke-ObsidianSyncAsync {
    $syncScript = Join-Path $scriptDir "sync_to_obsidian.ps1"
    if (Test-Path $syncScript) {
        Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$syncScript`"" -ErrorAction SilentlyContinue
    }
}

# Initial background sync on startup
Invoke-ObsidianSyncAsync

# Helper to send JSON response
function Send-JsonResponse($response, $data, [int]$statusCode = 200) {
    if ($null -eq $data) {
        $json = "null"
    } elseif ($data -is [System.Collections.IEnumerable] -and $data -isnot [string] -and $data -isnot [System.Collections.IDictionary]) {
        $arr = @($data)
        if ($arr.Count -eq 0) {
            $json = "[]"
        } elseif ($arr.Count -eq 1) {
            $json = "[" + ($arr[0] | ConvertTo-Json -Depth 6 -Compress) + "]"
        } else {
            $json = $arr | ConvertTo-Json -Depth 6 -Compress
        }
    } else {
        $json = $data | ConvertTo-Json -Depth 6 -Compress
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json; charset=utf-8"
    $response.AddHeader("Access-Control-Allow-Origin", "*")
    $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
    $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")
    $response.ContentLength64 = $bytes.Length
    try {
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } finally {
        $response.OutputStream.Close()
    }
}

# Helper to send file
function Send-FileResponse($response, [string]$filePath) {
    if (-not (Test-Path $filePath)) {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("File not found")
        $response.ContentLength64 = $msg.Length
        try {
            $response.OutputStream.Write($msg, 0, $msg.Length)
        } finally {
            $response.OutputStream.Close()
        }
        return
    }

    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
    $mime = switch ($ext) {
        ".html" { "text/html; charset=utf-8" }
        ".js"   { "application/javascript; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".json" { "application/json; charset=utf-8" }
        ".png"  { "image/png" }
        ".jpg"  { "image/jpeg" }
        ".svg"  { "image/svg+xml" }
        Default { "text/plain; charset=utf-8" }
    }

    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $response.StatusCode = 200
    $response.ContentType = $mime
    $response.ContentLength64 = $bytes.Length
    try {
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } finally {
        $response.OutputStream.Close()
    }
}

# Read Request Body
function Get-RequestBody($request) {
    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
    $reader.Close()
    return $body
}

# Server Loop
while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $urlPath = $request.Url.AbsolutePath
        $method = $request.HttpMethod

        # Handle CORS OPTIONS
        if ($method -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
            $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")
            $response.OutputStream.Close()
            continue
        }

        # Handle HEAD requests
        if ($method -eq "HEAD") {
            $response.StatusCode = 200
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.OutputStream.Close()
            continue
        }

        # --- API Routes ---
        if ($urlPath -eq "/api/opportunities" -and $method -eq "GET") {
            $data = Get-AllOpportunities
            if ($data.Count -eq 1) {
                ("[" + ($data[0] | ConvertTo-Json -Depth 6) + "]") | Set-Content $cachePath -Encoding UTF8 -Force
            } else {
                $data | ConvertTo-Json -Depth 6 | Set-Content $cachePath -Encoding UTF8 -Force
            }
            Send-JsonResponse $response $data
        }
        elseif ($urlPath -eq "/api/refresh" -and $method -eq "POST") {
            $data = Get-AllOpportunities
            if ($data.Count -eq 1) {
                ("[" + ($data[0] | ConvertTo-Json -Depth 6) + "]") | Set-Content $cachePath -Encoding UTF8 -Force
            } else {
                $data | ConvertTo-Json -Depth 6 | Set-Content $cachePath -Encoding UTF8 -Force
            }
            Send-JsonResponse $response @{
                success = $true
                count   = $data.Count
                items   = $data
                timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            }
            Invoke-ObsidianSyncAsync
        }
        elseif ($urlPath -eq "/api/profile" -and $method -eq "GET") {
            $profile = Get-Content $profilePath -Encoding UTF8 -Raw | ConvertFrom-Json
            Send-JsonResponse $response $profile
        }
        elseif ($urlPath -eq "/api/profile" -and $method -eq "POST") {
            $body = Get-RequestBody $request
            $body | Set-Content $profilePath -Encoding UTF8 -Force
            $updated = $body | ConvertFrom-Json
            Send-JsonResponse $response @{ success = $true; profile = $updated }
            Invoke-ObsidianSyncAsync
        }
        elseif ($urlPath -eq "/api/history" -and $method -eq "GET") {
            $history = @()
            if (Test-Path $historyPath) {
                try {
                    $raw = Get-Content $historyPath -Encoding UTF8 -Raw | ConvertFrom-Json
                    $history = @($raw | Where-Object { $_ -and $_.id })
                } catch { $history = @() }
            }
            Send-JsonResponse $response $history
        }
        elseif ($urlPath -eq "/api/apply" -and $method -eq "POST") {
            $body = Get-RequestBody $request | ConvertFrom-Json
            $history = @()
            if (Test-Path $historyPath) {
                try {
                    $raw = Get-Content $historyPath -Encoding UTF8 -Raw | ConvertFrom-Json
                    $history = @($raw | Where-Object { $_ -and $_.id })
                } catch { $history = @() }
            }

            if ($body.clearAll) {
                "[]" | Set-Content $historyPath -Encoding UTF8 -Force
                Send-JsonResponse $response @{ success = $true; total = 0 }
                Invoke-ObsidianSyncAsync
                continue
            }
            
            $existing = $history | Where-Object { $_.id -eq $body.id }
            $entry = [PSCustomObject]@{
                id          = $body.id
                title       = $body.title
                source      = $body.source
                type        = $body.type
                applyLink   = $body.applyLink
                status      = if ($body.status) { $body.status } else { "Applied" }
                appliedAt   = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                notes       = if ($body.notes) { $body.notes } else { "Auto-applied via OpportunityHub" }
            }

            if ($existing) {
                $history = @($history | Where-Object { $_.id -ne $body.id })
            }
            $history = @($history) + @($entry)
            $cleanHistory = @($history | Where-Object { $_ -and $_.id })
            
            if ($cleanHistory.Count -eq 0) {
                "[]" | Set-Content $historyPath -Encoding UTF8 -Force
            } elseif ($cleanHistory.Count -eq 1) {
                ("[" + ($cleanHistory[0] | ConvertTo-Json -Depth 5) + "]") | Set-Content $historyPath -Encoding UTF8 -Force
            } else {
                $cleanHistory | ConvertTo-Json -Depth 5 | Set-Content $historyPath -Encoding UTF8 -Force
            }

            Send-JsonResponse $response @{ success = $true; entry = $entry; total = $cleanHistory.Count }
            Invoke-ObsidianSyncAsync
        }
        elseif ($urlPath -eq "/api/saved" -and $method -eq "GET") {
            $saved = @()
            if (Test-Path $savedPath) {
                try {
                    $raw = Get-Content $savedPath -Encoding UTF8 -Raw | ConvertFrom-Json
                    $saved = @($raw | Where-Object { $_ -is [string] -and $_ -ne "" })
                } catch { $saved = @() }
            }
            Send-JsonResponse $response $saved
        }
        elseif ($urlPath -eq "/api/saved" -and $method -eq "POST") {
            $body = Get-RequestBody $request | ConvertFrom-Json
            $saved = @()
            if (Test-Path $savedPath) {
                try {
                    $raw = Get-Content $savedPath -Encoding UTF8 -Raw | ConvertFrom-Json
                    $saved = @($raw | Where-Object { $_ -is [string] -and $_ -ne "" })
                } catch { $saved = @() }
            }
            $id = [string]$body.id
            if ($saved -contains $id) {
                $saved = @($saved | Where-Object { $_ -ne $id })
                $isSaved = $false
            } else {
                $saved = @($saved) + @($id)
                $isSaved = $true
            }
            $cleanSaved = @($saved | Where-Object { $_ -is [string] -and $_ -ne "" })
            if ($cleanSaved.Count -eq 0) {
                "[]" | Set-Content $savedPath -Encoding UTF8 -Force
            } elseif ($cleanSaved.Count -eq 1) {
                ("[`"" + $cleanSaved[0] + "`"]") | Set-Content $savedPath -Encoding UTF8 -Force
            } else {
                $cleanSaved | ConvertTo-Json | Set-Content $savedPath -Encoding UTF8 -Force
            }
            Send-JsonResponse $response @{ success = $true; id = $id; isSaved = $isSaved; total = $cleanSaved.Count }
        }
        elseif ($urlPath -eq "/api/launch" -and $method -eq "POST") {
            $body = Get-RequestBody $request | ConvertFrom-Json
            if ($body.url) {
                Start-Process $body.url
            }
            Send-JsonResponse $response @{ success = $true; url = $body.url }
        }
        # --- Static File Serving ---
        else {
            $relPath = if ($urlPath -eq "/" -or $urlPath -eq "") { "index.html" } else { $urlPath.TrimStart('/') }
            $filePath = Join-Path $webRoot $relPath
            Send-FileResponse $response $filePath
        }
    } catch {
        Write-Warning "Server exception: $($_.Exception.Message)"
    } finally {
        try { $response.Close() } catch {}
    }
}
