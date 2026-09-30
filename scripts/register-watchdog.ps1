# Re-registers BOTOracle-Services so the watchdog runs with zero visible window.
# The task fires wscript.exe (GUI subsystem) -> no console -> no terminal flash.
$vbs = "C:\Users\LOYAL\Documents\hackathon\bot-oracle\scripts\run-watchdog.vbs"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`""
$trigger = New-ScheduledTaskTrigger -Once -At "2026-09-30T16:32:00" -RepetitionInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Unregister-ScheduledTask -TaskName "BOTOracle-Services" -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName "BOTOracle-Services" -Action $action -Trigger $trigger -Principal $principal
Get-ScheduledTask -TaskName "BOTOracle-Services" | Select-Object TaskName, State
