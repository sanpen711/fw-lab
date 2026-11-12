$ErrorActionPreference = 'Stop'

$installer = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1
if (-not $installer) { throw 'The Windows installer is missing.' }

$root = Join-Path $env:RUNNER_TEMP ('fw-upgrade-' + [Guid]::NewGuid().ToString('N'))
$directory = Join-Path $root '自定义 安装目录'
$executable = Join-Path $directory 'fw-lab-desktop.exe'
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
$programs = [Environment]::GetFolderPath('Programs')
$shortcut = Join-Path $desktop ('FW upgrade test ' + [Guid]::NewGuid().ToString('N') + '.lnk')
$cached = Join-Path $directory 'Cache\keep.txt'
$app = $null
$process = $null

function Get-ProductShortcuts {
    Get-ChildItem -LiteralPath $desktop, $programs -Filter 'F.w 研究所.lnk' -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object FullName | Sort-Object
}

try {
    New-Item -ItemType Directory -Path (Split-Path $cached) -Force | Out-Null
    Set-Content -LiteralPath $executable -Value 'previous executable'
    Set-Content -LiteralPath $cached -Value 'existing user cache'

    $link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
    $link.TargetPath = $executable
    $link.IconLocation = "$env:SystemRoot\System32\shell32.dll,2"
    $link.Save()
    $shortcutHash = (Get-FileHash -LiteralPath $shortcut).Hash
    $before = @(Get-ProductShortcuts) -join [Environment]::NewLine

    # Match Tauri's quiet NSIS invocation. The unquoted /D path is last.
    $process = Start-Process -FilePath $installer.FullName -ArgumentList "/S /R /UPDATE /ARGS /NS /D=$directory" -PassThru
    if (-not $process.WaitForExit(90000)) { throw 'Silent install did not finish.' }
    if ($process.ExitCode -ne 0) { throw "Silent install failed ($($process.ExitCode))." }

    $expected = (Get-FileHash 'src-tauri/target/release/fw-lab-desktop.exe').Hash
    if ((Get-FileHash -LiteralPath $executable).Hash -ne $expected) { throw 'The running directory was not overwritten.' }
    if ((Get-Content -LiteralPath $cached -Raw).Trim() -ne 'existing user cache') { throw 'Existing cache was modified.' }
    if ((Get-FileHash -LiteralPath $shortcut).Hash -ne $shortcutHash) { throw 'The custom shortcut was modified.' }
    if ((@(Get-ProductShortcuts) -join [Environment]::NewLine) -ne $before) {
        throw 'The upgrade changed the set of desktop or Start Menu shortcuts.'
    }

    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        $app = Get-Process -Name 'fw-lab-desktop' -ErrorAction SilentlyContinue |
            Where-Object Path -EQ $executable | Select-Object -First 1
        if ($app) { break }
        Start-Sleep -Milliseconds 800
    }
    if (-not $app) { throw 'The installed app did not restart from the custom directory.' }
    Write-Host 'Quiet upgrade replaced the installed executable, preserved existing files and shortcuts, and restarted the app.'
}
finally {
    if ($app) { $app | Stop-Process -Force -ErrorAction SilentlyContinue }
    if ($process -and -not $process.HasExited) { $process | Stop-Process -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $shortcut, $root -Recurse -Force -ErrorAction SilentlyContinue
}
