# start-services.ps1 - launch the bot-oracle node + gateway if they aren't
# already running. Idempotent: safe to run on a schedule - it only starts
# what is dead. Registered as the "BOTOracle-Services" scheduled task
# (at logon, repeating every 5 minutes) so the stack survives reboots and
# process crashes.
#
# Detection: each service is launched with a "--service=<name>" marker arg
# (ignored by the app - index.js never parses argv), and we match on that
# marker in the process CommandLine. The node's and gateway's own
# "src/index.js" paths are indistinguishable otherwise.

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot

function Ensure-Service($name, $workDir, $logDir) {
    $running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -like "*--service=$name*" } |
        Select-Object -First 1
    if ($running) { Write-Output "$name alive (pid $($running.ProcessId))"; return }

    New-Item -ItemType Directory -Force $logDir | Out-Null
    foreach ($ext in @("log", "err")) {
        $f = Join-Path $logDir "$name.$ext"
        if ((Test-Path $f) -and ((Get-Item $f).Length -gt 0)) {
            Copy-Item $f "$f.1" -Force   # keep the last crash's output
        }
    }
    $p = Start-Process -FilePath "node" `
        -ArgumentList "--env-file=.env.testnet", "src/index.js", "--service=$name" `
        -WorkingDirectory $workDir `
        -RedirectStandardOutput (Join-Path $logDir "$name.log") `
        -RedirectStandardError (Join-Path $logDir "$name.err") `
        -WindowStyle Hidden -PassThru
    Write-Output "$name started (pid $($p.Id))"
}

Ensure-Service "node"    (Join-Path $root "node")    (Join-Path $root "node\state")
Ensure-Service "gateway" (Join-Path $root "gateway") (Join-Path $root "gateway\state")
