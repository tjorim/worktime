# PowerShell script to analyze .hday files and extract unique patterns
# Usage: .\analyze-hday-patterns.ps1 -Path "\\network\share\CUG_holiday"
#        .\analyze-hday-patterns.ps1 -Path "C:\local\hday\files"

param(
    [Parameter(Mandatory=$true)]
    [string]$Path,

    [Parameter(Mandatory=$false)]
    [int]$MaxFiles = 0  # 0 = all files
)

Write-Host "Scanning .hday files in: $Path" -ForegroundColor Cyan
Write-Host ""

# Find all .hday files
$hdayFiles = Get-ChildItem -Path $Path -Filter "*.hday" -File

if ($MaxFiles -gt 0) {
    $hdayFiles = $hdayFiles | Select-Object -First $MaxFiles
    Write-Host "Limiting to first $MaxFiles files" -ForegroundColor Yellow
}

Write-Host "Found $($hdayFiles.Count) .hday files" -ForegroundColor Green
Write-Host ""

# Regular expressions for parsing
$reRange = '^(?<prefix>[a-z]*)(?<start>\d{4}/\d{2}/\d{2})(?:-(?<end>\d{4}/\d{2}/\d{2}))?(?:\s*#\s*(?<title>.*))?$'
$reWeekly = '^(?<prefix>[a-z]*?)d(?<weekday>[0-6])(?:\s*#\s*(?<title>.*))?$'
$reComment = '^[#r].*$'  # r = release tag from VBA tool

# Storage for patterns
$patterns = @{}
$prefixCounts = @{}
$exampleLines = @{}

# Scan all files
$lineCount = 0
foreach ($file in $hdayFiles) {
    try {
        $lines = Get-Content $file.FullName -Encoding UTF8

        foreach ($line in $lines) {
            $line = $line.Trim()
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            if ($line -match $reComment) { continue }

            $lineCount++

            # Try to match range pattern
            if ($line -match $reRange) {
                $prefix = $Matches['prefix']
                if ([string]::IsNullOrEmpty($prefix)) {
                    $prefix = "(none)"
                }

                # Count this prefix
                if (-not $prefixCounts.ContainsKey($prefix)) {
                    $prefixCounts[$prefix] = 0
                    $exampleLines[$prefix] = @()
                }
                $prefixCounts[$prefix]++

                # Store example (max 3 per prefix)
                if ($exampleLines[$prefix].Count -lt 3) {
                    $exampleLines[$prefix] += $line
                }
            }
            # Try to match weekly pattern
            elseif ($line -match $reWeekly) {
                $prefix = $Matches['prefix']
                if ([string]::IsNullOrEmpty($prefix)) {
                    $prefix = "(none)"
                }
                $prefix = $prefix + "d*"  # Mark as weekly

                if (-not $prefixCounts.ContainsKey($prefix)) {
                    $prefixCounts[$prefix] = 0
                    $exampleLines[$prefix] = @()
                }
                $prefixCounts[$prefix]++

                if ($exampleLines[$prefix].Count -lt 3) {
                    $exampleLines[$prefix] += $line
                }
            }
            else {
                # Unknown pattern
                if (-not $patterns.ContainsKey("UNKNOWN")) {
                    $patterns["UNKNOWN"] = @()
                }
                if ($patterns["UNKNOWN"].Count -lt 5) {
                    $patterns["UNKNOWN"] += $line
                }
            }
        }
    }
    catch {
        Write-Host "Error reading $($file.Name): $_" -ForegroundColor Red
    }
}

Write-Host "Analyzed $lineCount total entries" -ForegroundColor Green
Write-Host ""
Write-Host "=" * 80
Write-Host "PREFIX PATTERN SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 80
Write-Host ""

# Define flag meanings
$flagMeanings = @{
    'a' = 'Half day AM'
    'p' = 'Half day PM'
    'b' = 'Business trip / out for work'
    's' = 'Training / course'
    'i' = 'In office (override)'
}

# Sort by count (descending)
$sortedPrefixes = $prefixCounts.GetEnumerator() | Sort-Object -Property Value -Descending

foreach ($entry in $sortedPrefixes) {
    $prefix = $entry.Key
    $count = $entry.Value
    $percentage = [math]::Round(($count / $lineCount) * 100, 2)

    # Decode prefix
    $decoded = @()
    if ($prefix -eq "(none)") {
        $decoded += "Regular vacation/holiday"
    }
    elseif ($prefix.EndsWith("d*")) {
        $cleanPrefix = $prefix.Replace("d*", "")
        if ([string]::IsNullOrEmpty($cleanPrefix)) {
            $decoded += "Weekly recurring"
        }
        else {
            foreach ($char in $cleanPrefix.ToCharArray()) {
                if ($flagMeanings.ContainsKey([string]$char)) {
                    $decoded += $flagMeanings[[string]$char]
                }
                else {
                    $decoded += "Unknown flag: $char"
                }
            }
            $decoded += "Weekly recurring"
        }
    }
    else {
        foreach ($char in $prefix.ToCharArray()) {
            if ($flagMeanings.ContainsKey([string]$char)) {
                $decoded += $flagMeanings[[string]$char]
            }
            else {
                $decoded += "Unknown flag: $char"
            }
        }
    }

    Write-Host "Prefix: '$prefix'" -ForegroundColor Yellow
    Write-Host "  Meaning: $($decoded -join ' + ')" -ForegroundColor White
    Write-Host "  Count: $count ($percentage%)" -ForegroundColor Gray
    Write-Host "  Examples:" -ForegroundColor Gray
    foreach ($example in $exampleLines[$prefix]) {
        Write-Host "    $example" -ForegroundColor DarkGray
    }
    Write-Host ""
}

# Show unknown patterns if any
if ($patterns.ContainsKey("UNKNOWN") -and $patterns["UNKNOWN"].Count -gt 0) {
    Write-Host "=" * 80
    Write-Host "UNKNOWN PATTERNS (first 5)" -ForegroundColor Red
    Write-Host "=" * 80
    foreach ($unknown in $patterns["UNKNOWN"]) {
        Write-Host "  $unknown" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "=" * 80
Write-Host "FLAG MEANINGS" -ForegroundColor Cyan
Write-Host "=" * 80
foreach ($flag in $flagMeanings.GetEnumerator() | Sort-Object Key) {
    Write-Host "  $($flag.Key) = $($flag.Value)" -ForegroundColor White
}
Write-Host ""
Write-Host "Note: Flags can be combined, e.g., 'pb' = Business + Half day PM" -ForegroundColor Yellow
