# Local production preview of dist/ that behaves like the GoDaddy server:
# same security headers (CSP read from dist/.htaccess), gzip and cache headers.
# (No PHP: form posts return 404 here.)
# -Lab: test-only mode that allows same-origin framing (for multi-width layout checks).
param([int]$Port = 4173, [switch]$Lab)
$root = Join-Path (Split-Path -Parent $PSScriptRoot) 'dist'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $root at http://localhost:$Port/"

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.png' = 'image/png'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'; '.woff2' = 'font/woff2'
  '.xml' = 'application/xml; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'; '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'
}
$compressible = @('.html', '.css', '.js', '.svg', '.xml', '.txt', '.json', '.webmanifest')

function Get-Csp {
  $ht = Join-Path $root '.htaccess'
  if (Test-Path $ht) {
    $m = [regex]::Match([IO.File]::ReadAllText($ht), 'Content-Security-Policy "([^"]+)"')
    if ($m.Success) { return ($m.Groups[1].Value -replace '; upgrade-insecure-requests', '') }
  }
  return "default-src 'self'"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path.EndsWith('/')) { $path += 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
    if (-not $file.StartsWith($root) -or -not (Test-Path $file -PathType Leaf)) {
      if (Test-Path (Join-Path $file 'index.html')) {
        $res.StatusCode = 301; $res.RedirectLocation = $ctx.Request.Url.AbsolutePath + '/'; continue
      }
      $res.StatusCode = 404; $file = Join-Path $root '404.html'
    }
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $csp = Get-Csp
    if ($Lab) { $csp = $csp -replace "frame-ancestors 'none'", "frame-ancestors 'self'" }
    $res.Headers.Add('Content-Security-Policy', $csp)
    $res.Headers.Add('X-Content-Type-Options', 'nosniff')
    $res.Headers.Add('X-Frame-Options', $(if ($Lab) { 'SAMEORIGIN' } else { 'DENY' }))
    $res.Headers.Add('Referrer-Policy', 'strict-origin-when-cross-origin')
    if ($path.StartsWith('/_astro/')) { $res.Headers.Add('Cache-Control', 'public, max-age=31536000, immutable') }
    elseif ($ext -in @('.html', '.xml', '.txt')) { $res.Headers.Add('Cache-Control', 'no-cache') }
    elseif ($ext -in @('.png', '.webp', '.svg')) { $res.Headers.Add('Cache-Control', 'public, max-age=2592000') }
    $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
    $bytes = [IO.File]::ReadAllBytes($file)
    $accept = [string]$ctx.Request.Headers['Accept-Encoding']
    if ($ext -in $compressible -and $accept -match 'gzip') {
      $ms = New-Object IO.MemoryStream
      $gz = New-Object IO.Compression.GZipStream($ms, [IO.Compression.CompressionLevel]::Optimal)
      $gz.Write($bytes, 0, $bytes.Length); $gz.Close()
      $bytes = $ms.ToArray()
      $res.Headers.Add('Content-Encoding', 'gzip')
      $res.Headers.Add('Vary', 'Accept-Encoding')
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
