$ErrorActionPreference = 'Stop'

$installer = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1
if (-not $installer) { throw 'The Windows installer is missing.' }

$root = Join-Path $env:RUNNER_TEMP ('fw-upgrade-' + [Guid]::NewGuid().ToString('N'))
$directory = Join-Path $root '自定义 安装目录'
$executable = Join-Path $directory 'fw-lab-desktop.exe'
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
$programs = [Environment]::GetFolderPath('Programs')
$originalShortcut = Join-Path $desktop 'F.w 研究所.lnk'
$shortcut = Join-Path $desktop ('FW upgrade test ' + [Guid]::NewGuid().ToString('N') + '.lnk')
$cached = Join-Path $directory 'Cache\keep.txt'
$registration = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\F.w 研究所'
$app = $null

function Get-ProductShortcuts {
    Get-ChildItem -LiteralPath $desktop, $programs -Filter 'F.w 研究所.lnk' -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object FullName | Sort-Object
}

function Invoke-Installer([string]$Path, [string]$Arguments) {
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -PassThru
    try {
        if (-not $process.WaitForExit(90000)) { throw 'Silent install did not finish.' }
        if ($process.ExitCode -ne 0) { throw "Silent install failed ($($process.ExitCode))." }
    }
    finally {
        if (-not $process.HasExited) { $process | Stop-Process -Force -ErrorAction SilentlyContinue }
        $process.Dispose()
    }
}

try {
    # Install the previous public build, so the fixture has genuine registry
    # entries and shortcuts from a normal Windows installation.
    $previous = (Resolve-Path 'download/fw-lab-windows-latest.exe').Path
    Invoke-Installer $previous "/S /D=$directory"
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'The previous app was not installed.' }
    $previousHash = (Get-FileHash -LiteralPath $executable).Hash
    $previousVersion = (Get-ItemProperty -LiteralPath $registration).DisplayVersion

    New-Item -ItemType Directory -Path (Split-Path $cached) -Force | Out-Null
    Set-Content -LiteralPath $cached -Value 'existing user cache'
    Move-Item -LiteralPath $originalShortcut -Destination $shortcut
    $shortcutHash = (Get-FileHash -LiteralPath $shortcut).Hash
    $before = @(Get-ProductShortcuts) -join [Environment]::NewLine

    # Match Tauri's quiet NSIS invocation. The unquoted /D path is last.
    Invoke-Installer $installer.FullName "/S /R /UPDATE /ARGS --fw-update-restart /NS /D=$directory"

    # Tauri adds bundle metadata to the embedded executable, then restores
    # the unpatched build output. Compare the two installed copies instead.
    $expectedVersion = (Get-Content 'src-tauri/tauri.v11.conf.json' -Raw | ConvertFrom-Json).version
    $installed = Get-ItemProperty -LiteralPath $registration
    if ($installed.DisplayVersion -ne $expectedVersion -or $installed.InstallLocation.Trim('"') -ne $directory) {
        throw "Expected version $expectedVersion in $directory, got $($installed.DisplayVersion) in $($installed.InstallLocation)."
    }
    if ($previousVersion -ne $expectedVersion -and (Get-FileHash -LiteralPath $executable).Hash -eq $previousHash) {
        throw 'The executable was not replaced.'
    }
    if ((Get-Content -LiteralPath $cached -Raw).Trim() -ne 'existing user cache') { throw 'Existing cache was modified.' }
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        $app = Get-Process -Name 'fw-lab-desktop' -ErrorAction SilentlyContinue |
            Where-Object Path -EQ $executable | Select-Object -First 1
        if ($app) { break }
        Start-Sleep -Milliseconds 800
    }
    if (-not $app) { throw 'The installed app did not restart from the custom directory.' }
    $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($app.Id)").CommandLine
    if ($commandLine -notlike '*--fw-update-restart*') { throw 'The app did not receive the upgrade restart argument.' }
    if ((Get-FileHash -LiteralPath $shortcut).Hash -ne $shortcutHash) { throw 'The custom shortcut was modified.' }
    if ((@(Get-ProductShortcuts) -join [Environment]::NewLine) -ne $before) {
        throw 'The upgrade changed the set of desktop or Start Menu shortcuts.'
    }

    Write-Host 'Quiet upgrade replaced the installed executable, preserved existing files and shortcuts, and restarted the app.'
}
finally {
    if ($app) { $app | Stop-Process -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $shortcut, $root -Recurse -Force -ErrorAction SilentlyContinue
}
