param(
    [string]$Executable = 'src-tauri/target/release/fw-lab-desktop.exe',
    [string]$OutputDirectory = 'microsoft-store-candidate'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $root
if (-not (Test-Path -LiteralPath $Executable)) { throw 'Build the microsoft-store feature before packaging.' }
$binary = (Resolve-Path $Executable).Path
$out = [IO.Path]::GetFullPath((Join-Path $root $OutputDirectory))
$stage = Join-Path $out 'layout'
New-Item -ItemType Directory -Force $out | Out-Null
if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $stage 'Assets') | Out-Null
Copy-Item -LiteralPath $binary -Destination (Join-Path $stage 'fw-lab-desktop.exe')

$manifestPath = Join-Path $stage 'AppxManifest.xml'
node (Join-Path $PSScriptRoot 'manifest.mjs') $manifestPath
if ($LASTEXITCODE -ne 0) { throw 'Manifest generation failed.' }

Add-Type -AssemblyName System.Drawing
$source = [Drawing.Image]::FromFile((Join-Path $root 'src-tauri/icons/identity/default.png'))
try {
    foreach ($asset in @(@('StoreLogo',50), @('Square44x44Logo',44), @('Square150x150Logo',150))) {
        $size = [int]$asset[1]
        $bitmap = [Drawing.Bitmap]::new($size,$size)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([Drawing.Color]::Transparent)
            $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.DrawImage($source,0,0,$size,$size)
            $bitmap.Save((Join-Path $stage "Assets/$($asset[0]).png"),[Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $source.Dispose() }

$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
$makeappx = Get-ChildItem "$sdkRoot/*/x64/makeappx.exe" |
    Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (-not $makeappx) { throw 'Windows SDK MakeAppx.exe was not found.' }
[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$version = $manifest.Package.Identity.Version
$package = Join-Path $out "FW-Research-$version-x64.msix"
& $makeappx.FullName pack /d $stage /p $package /o
if ($LASTEXITCODE -ne 0) { throw 'MakeAppx validation/packaging failed.' }

$verify = Join-Path $out 'verified-layout'
& $makeappx.FullName unpack /p $package /d $verify /o
if ($LASTEXITCODE -ne 0) { throw 'MSIX unpack verification failed.' }
[xml]$verified = Get-Content -LiteralPath (Join-Path $verify 'AppxManifest.xml') -Raw
foreach ($key in @('Name','Publisher','Version','ProcessorArchitecture')) {
    if ($verified.Package.Identity.GetAttribute($key) -ne $manifest.Package.Identity.GetAttribute($key)) { throw "Identity mismatch: $key" }
}
if ((Get-FileHash $binary).Hash -ne (Get-FileHash (Join-Path $verify 'fw-lab-desktop.exe')).Hash) { throw 'Packaged executable hash mismatch.' }
$hash = (Get-FileHash $package -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $([IO.Path]::GetFileName($package))" | Set-Content (Join-Path $out 'sha256.txt') -Encoding utf8
Copy-Item $manifestPath (Join-Path $out 'AppxManifest.xml') -Force
@(
    'FW研究所：微软商店提交候选包',
    "商店产品：9NDC57KQMR7S；包版本：$version；架构：x64。",
    'MSIX 未签名，供微软合作伙伴中心上传后由商店签名，不是普通双击安装包。',
    '本包使用本地打包界面，通过后台接口提供账号、帖子和聊天服务。',
    '系统要求：Windows 10 2004 或更新版本、x64、Microsoft Edge WebView2 Runtime。',
    '商店版通过 Microsoft Store 更新，不会下载或运行站外 NSIS 更新安装包。',
    '窗口名称和窗口图标支持自定义；开始菜单入口由 Windows 管理。',
    '尚需真实 Windows 设备安装测试及商店认证，本次未提交或发布到商店。'
) | Set-Content (Join-Path $out '提交说明.txt') -Encoding utf8
Remove-Item -LiteralPath $stage,$verify -Recurse -Force
Write-Output "Store package ready: $package"
