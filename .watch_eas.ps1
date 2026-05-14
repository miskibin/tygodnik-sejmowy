Set-Location D:\sejmograf\mobile
$buildId = "03dd7403-a428-4ca4-ac14-fe340ade6100"
$logPath = "D:\sejmograf\.eas_build_watch.log"
$finalPath = "D:\sejmograf\.eas_build_final.json"
while ($true) {
  $out = & eas build:view $buildId --json 2>&1 | Out-String
  $m = [regex]::Match($out, '"status":\s*"([^"]+)"')
  $status = if ($m.Success) { $m.Groups[1].Value } else { "UNKNOWN" }
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $logPath -Value "$ts status=$status"
  if ($status -in @("FINISHED","ERRORED","CANCELED")) {
    Set-Content -Path $finalPath -Value $out
    break
  }
  Start-Sleep -Seconds 90
}
