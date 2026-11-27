# Speichert den RamboFlow-API-Zugang verschlüsselt (Windows DPAPI).
# Nur DEIN Windows-Benutzer auf DIESEM Rechner kann ihn wieder entschlüsseln.
#
#   powershell -ExecutionPolicy Bypass -File scripts\save-token.ps1
#
# Danach in der Claude-Konfiguration statt RAMBOFLOW_API_TOKEN:
#   "RAMBOFLOW_API_TOKEN_FILE": "C:\\Users\\<du>\\AppData\\Roaming\\RamboFlow\\mcp-token.dat"
$dir = Join-Path $env:APPDATA 'RamboFlow'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$file = Join-Path $dir 'mcp-token.dat'
$secure = Read-Host 'RamboFlow-API-Zugang (rbf_...) einfügen' -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $plain.StartsWith('rbf_')) { Write-Host 'Das ist kein RamboFlow-Zugang (muss mit rbf_ beginnen).' -ForegroundColor Red; exit 1 }
$secure | ConvertFrom-SecureString | Set-Content -LiteralPath $file -Encoding ASCII
Write-Host "Gespeichert: $file" -ForegroundColor Green
Write-Host 'In claude_desktop_config.json: RAMBOFLOW_API_TOKEN entfernen und stattdessen eintragen:'
Write-Host ('  "RAMBOFLOW_API_TOKEN_FILE": "' + ($file -replace '\\','\\') + '"')
