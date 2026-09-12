<# Prepare the isolated SFGPU image runtime. No GPU inference is performed. #>
$ErrorActionPreference = 'Stop'
$HostName = 'sfgpu'
$Root = '/home/michal/tygodnik_illustration_pipeline'
$Cache = "$Root/hf-cache"
$TrialCache = '/home/michal/tygodnik_image_trial_20260912/hf-cache'
$Model = 'black-forest-labs/FLUX.2-klein-4B'
$Revision = 'e7b7dc27f91deacad38e78976d1f2b499d76a294'
$Image = 'tygodnik-illustration:flux2-klein4b'
$Ssh = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15')
$ModelDir = 'models--black-forest-labs--FLUX.2-klein-4B'

function Invoke-Remote([string]$Command) {
    & ssh @Ssh $HostName $Command
    if ($LASTEXITCODE -ne 0) { throw "SFGPU command failed" }
}

Invoke-Remote "mkdir -p $Root/runtime && chmod 700 $Root $Root/runtime"
& scp -q scripts/illustrations/worker.py scripts/illustrations/Dockerfile "${HostName}:$Root/runtime/"
if ($LASTEXITCODE -ne 0) { throw 'Could not copy illustration runtime files' }
Invoke-Remote "docker build --pull=false -t $Image $Root/runtime"

$prepare = @"
set -eu
cache='$Cache'
trial='$TrialCache'
model='$ModelDir'
revision='$Revision'
if test ! -d "`$cache/hub/`$model/snapshots/`$revision"; then
  if test ! -e "`$cache" && test -d "`$trial/hub/`$model/snapshots/`$revision"; then
    cp -a --reflink=auto "`$trial" "`$cache"
  fi
fi
if test ! -d "`$cache/hub/`$model/snapshots/`$revision"; then
  mkdir -p "`$cache"
  docker run --rm --network bridge --user 1000:1000 --entrypoint python -v "`$cache:/models" '$Image' -c "from huggingface_hub import snapshot_download; snapshot_download('$Model', revision='$Revision', cache_dir='/models/hub')"
fi
test -d "`$cache/hub/`$model/snapshots/`$revision"
"@
Invoke-Remote $prepare
Write-Host "SFGPU runtime and pinned cache are ready: $Revision"
