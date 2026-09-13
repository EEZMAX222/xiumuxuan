# ============================================================
#  休沐选 · 临时公网地址
#
#  给本机运行的站点（默认 http://127.0.0.1:8787）套一个临时的
#  公网 HTTPS 地址，让别人也能打开。**不需要 Cloudflare 账号。**
#
#  用法：
#      powershell -ExecutionPolicy Bypass -File scripts/tunnel.ps1
#      或  npm run tunnel
#
#  说明：
#    - 走 Cloudflare 边缘，所以服务器能拿到真实的 CF-IPCountry，
#      中国大陆 IP 会看到 403（这是本站的预期行为）。
#    - 这是 Cloudflare 的「quick tunnel」：地址随机、每次启动都变、
#      官方不保证可用时长，关掉窗口就失效。长期使用请部署到
#      Cloudflare Workers，见 docs/DEPLOY-CLOUDFLARE.md
# ============================================================

$ErrorActionPreference = 'Stop'

$port = if ($env:PORT) { $env:PORT } else { '8787' }
$target = "http://127.0.0.1:$port"

$toolsDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'tools'
$exe = Join-Path $toolsDir 'cloudflared.exe'
$downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'

Write-Host ''
Write-Host '  休沐选 · 临时公网地址' -ForegroundColor Cyan
Write-Host '  ---------------------------------------------'

# 1) 站点是否在跑
$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Host "  [!] 端口 $port 上没有服务，请先在另一个窗口运行： npm start" -ForegroundColor Yellow
  Write-Host ''
  exit 1
}
Write-Host "  本地站点   $target  (运行中)"

# 2) cloudflared 是否就绪
if (-not (Test-Path $exe)) {
  Write-Host '  首次运行，正在下载 cloudflared …'
  New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
  & curl.exe -sL -o $exe $downloadUrl
  if (-not (Test-Path $exe)) {
    Write-Host '  [!] cloudflared 下载失败' -ForegroundColor Red
    exit 1
  }
}
Write-Host "  隧道程序   $exe"

# 3) 启动隧道并等待地址
$logFile = Join-Path $env:TEMP ("xmx-tunnel-{0}.log" -f $PID)
if (Test-Path $logFile) { Remove-Item $logFile -Force }

Write-Host '  正在建立隧道 …'
$proc = Start-Process -FilePath $exe `
  -ArgumentList 'tunnel', '--url', $target, '--no-autoupdate' `
  -RedirectStandardError $logFile -RedirectStandardOutput "$logFile.out" `
  -PassThru -NoNewWindow

$publicUrl = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  if ($proc.HasExited) { break }
  $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
  if ($content -and $content -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
    $publicUrl = $Matches[0]
    break
  }
}

Write-Host ''
if ($publicUrl) {
  Write-Host '  ============================================================' -ForegroundColor Green
  Write-Host "   公网地址： $publicUrl" -ForegroundColor Green
  Write-Host '  ============================================================' -ForegroundColor Green
  Write-Host ''
  Write-Host '  提醒：' -ForegroundColor Cyan
  Write-Host '   · 中国大陆 IP 打开会直接拿到 403（一个不含任何说明的响应）—— 这是本站的设计目标。'
  Write-Host '   · 地址每次启动都会变，官方不保证在线时长。'
  Write-Host '   · 按 Ctrl+C 停止；关掉这个窗口地址就失效。'
  Write-Host '   · 想要固定地址，请部署到 Cloudflare Workers：docs/DEPLOY-CLOUDFLARE.md'
  Write-Host ''
} else {
  Write-Host '  [!] 未能取得公网地址，cloudflared 日志：' -ForegroundColor Red
  if (Test-Path $logFile) { Get-Content $logFile | Select-Object -Last 15 | ForEach-Object { Write-Host "      $_" } }
  if (-not $proc.HasExited) { $proc.Kill() }
  exit 1
}

# 4) 保持前台运行，Ctrl+C 结束
try {
  Wait-Process -Id $proc.Id
} finally {
  if (-not $proc.HasExited) { $proc.Kill() }
  Remove-Item $logFile -Force -ErrorAction SilentlyContinue
  Remove-Item "$logFile.out" -Force -ErrorAction SilentlyContinue
}
