param(
  [string]$ServiceName = "gg-watchdog"
)

sc.exe stop $ServiceName | Out-Null
sc.exe delete $ServiceName | Out-Null

Write-Host "Stopped and removed $ServiceName"
