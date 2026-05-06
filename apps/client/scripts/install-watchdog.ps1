param(
  [string]$ServiceExe = "$(Split-Path -Parent $PSScriptRoot)\src-watchdog\target\release\gg-watchdog.exe",
  [string]$ServiceName = "gg-watchdog"
)

if (!(Test-Path $ServiceExe)) {
  Write-Error "Watchdog executable not found: $ServiceExe"
  exit 1
}

sc.exe stop $ServiceName | Out-Null
sc.exe delete $ServiceName | Out-Null

sc.exe create $ServiceName binPath= "`"$ServiceExe`"" start= auto DisplayName= "GG Manager Watchdog" | Out-Null
sc.exe description $ServiceName "Keeps GG Manager client running" | Out-Null
sc.exe start $ServiceName | Out-Null

Write-Host "Installed and started $ServiceName"
