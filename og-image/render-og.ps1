param([string]$Dir)
# Renders every *.html in $Dir at 1200x630 with headless Chrome, then saves a JPG (quality 85).
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
Add-Type -AssemblyName System.Drawing
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 85L
$chromeProfile = Join-Path $env:TEMP ("og-chrome-" + [guid]::NewGuid())

Get-ChildItem -LiteralPath $Dir -Filter *.html | ForEach-Object {
  $png = Join-Path $Dir ($_.BaseName + ".png")
  $jpg = Join-Path $Dir ($_.BaseName + ".jpg")
  $url = ([System.Uri]$_.FullName).AbsoluteUri
  & $chrome --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$chromeProfile" `
    --window-size=1200,630 --force-device-scale-factor=1 --virtual-time-budget=8000 `
    --allow-file-access-from-files --screenshot="$png" $url 2>$null | Out-Null
  if (-not (Test-Path -LiteralPath $png)) { Write-Output "FAILED $($_.Name)"; return }
  $image = [System.Drawing.Image]::FromFile($png)
  try { $image.Save($jpg, $codec, $params) } finally { $image.Dispose() }
  Remove-Item -LiteralPath $png
  $kb = [math]::Round((Get-Item -LiteralPath $jpg).Length / 1KB)
  Write-Output "$($_.BaseName).jpg  ${kb} KB"
}
Remove-Item -LiteralPath $chromeProfile -Recurse -Force -ErrorAction SilentlyContinue
