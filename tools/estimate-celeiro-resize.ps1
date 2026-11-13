# tools/estimate-celeiro-resize.ps1 — mede a economia REAL de reencodar cópias das texturas do CELEIRO
# em resoluções menores. NÃO altera assets/: escreve as cópias em %TEMP%\celeiro-resize.
# Uso: powershell -ExecutionPolicy Bypass -File tools\estimate-celeiro-resize.ps1
Add-Type -AssemblyName System.Drawing

$src = Join-Path $PSScriptRoot '..\assets\maps\celeiro\textures'
$tmp = Join-Path $env:TEMP 'celeiro-resize'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# pasta/arquivo -> [largura alvo, altura alvo, qualidade]
# 0 = manter dimensão original
$plan = [ordered]@{
  'bark/color.jpg'            = @(512, 1024, 85)
  'bark/normal.jpg'           = @(512, 1024, 90)
  'barn_red/color.jpg'        = @(1024, 1024, 85)
  'barn_red/normal.jpg'       = @(1024, 1024, 90)
  'barn_red/rough.jpg'        = @(512, 512, 85)
  'barn_wall/color.jpg'       = @(1024, 1024, 85)
  'barn_wall/normal.jpg'      = @(1024, 1024, 90)
  'barn_wall/rough.jpg'       = @(512, 512, 85)
  'concrete_floor/color.jpg'  = @(512, 256, 85)
  'concrete_floor/normal.jpg' = @(1024, 512, 90)
  'concrete_floor/rough.jpg'  = @(512, 256, 85)
  'container/color.jpg'       = @(512, 512, 85)
  'container/normal.jpg'      = @(1024, 1024, 90)
  'container/rough.jpg'       = @(512, 512, 85)
  'floor_worn/color.jpg'      = @(1024, 1024, 85)
  'floor_worn/normal.jpg'     = @(1024, 1024, 90)
  'floor_worn/rough.jpg'      = @(512, 512, 85)
  'painted_metal/color.jpg'   = @(512, 512, 85)
  'painted_metal/normal.jpg'  = @(512, 512, 90)
  'ramp_wood/color.jpg'       = @(1024, 1024, 85)
  'ramp_wood/normal.jpg'      = @(1024, 1024, 90)
  'ramp_wood/rough.jpg'       = @(512, 512, 85)
  'roof/color.jpg'            = @(1024, 1024, 85)
  'roof/normal.jpg'           = @(1024, 1024, 90)
  'roof/rough.jpg'            = @(512, 512, 85)
  'sand/color.jpg'            = @(1024, 1024, 85)
  'sand/normal.jpg'           = @(1024, 1024, 90)
  'sand/rough.jpg'            = @(512, 512, 85)
  'train_metal/color.jpg'     = @(512, 512, 85)
  'train_metal/normal.jpg'    = @(512, 512, 90)
  'train_metal/rough.jpg'     = @(256, 256, 85)
  'wood_crate/color.jpg'      = @(512, 393, 85)
  'wood_crate/normal.jpg'     = @(512, 393, 90)
  'wood_crate/rough.jpg'      = @(512, 393, 85)
  'wood_planks/color.jpg'     = @(512, 512, 85)
  'wood_planks/normal.jpg'    = @(512, 512, 90)
  'wood_planks/rough.jpg'     = @(512, 512, 85)
}

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$enc = New-Object System.Drawing.Imaging.EncoderParameters(1)
function Save-Jpeg($bmp, $path, $quality) {
  $enc.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
  $bmp.Save($path, $codec, $enc)
}

$rows = @()
$sumOrig = 0; $sumNew = 0
foreach ($key in $plan.Keys) {
  $p = Join-Path $src ($key -replace '/', '\')
  $orig = Get-Item $p
  $img = [System.Drawing.Image]::FromFile($p)
  $ow = $img.Width; $oh = $img.Height
  $tw = $plan[$key][0]; $th = $plan[$key][1]; $q = $plan[$key][2]
  $out = Join-Path $tmp ($key -replace '/', '_')
  $bmp = New-Object System.Drawing.Bitmap($tw, $th)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($img, 0, 0, $tw, $th)
  $g.Dispose()
  Save-Jpeg $bmp $out $q
  $bmp.Dispose(); $img.Dispose()
  $newLen = (Get-Item $out).Length
  $sumOrig += $orig.Length; $sumNew += $newLen
  $rows += [pscustomobject]@{
    File = $key; Orig = '{0}x{1}' -f $ow, $oh; OrigMB = [math]::Round($orig.Length / 1MB, 2)
    New = '{0}x{1}' -f $tw, $th; NewMB = [math]::Round($newLen / 1MB, 2)
    SaveMB = [math]::Round(($orig.Length - $newLen) / 1MB, 2)
    Pct = [math]::Round(100 * (1 - $newLen / $orig.Length), 0)
  }
}
$rows | Format-Table -AutoSize | Out-String -Width 200
"TOTAL usado hoje : {0:N2} MB" -f ($sumOrig / 1MB)
"TOTAL plano      : {0:N2} MB" -f ($sumNew / 1MB)
"ECONOMIA         : {0:N2} MB ({1:N0}%)" -f (($sumOrig - $sumNew) / 1MB), (100 * (1 - $sumNew / $sumOrig))
