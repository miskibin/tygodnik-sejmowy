<# Prepare the isolated SFGPU image runtime (worker image, gate, pinned model cache). No GPU inference is performed. #>
$ErrorActionPreference = 'Stop'
$HostName = 'sfgpu'
$Root = '/home/michal/tygodnik_illustration_pipeline'
$Cache = "$Root/hf-cache"
$Model = 'Qwen/Qwen-Image-2.1-Turbo'
$Revision = 'd65dbc9a7e8f6b5479e33dee6030eaab2a906509'
$Image = 'tygodnik-illustration:qwen-image-2.1-turbo'
$Ssh = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15')

function Invoke-Remote([string]$Command) {
    & ssh @Ssh $HostName $Command
    if ($LASTEXITCODE -ne 0) { throw "SFGPU command failed" }
}

Invoke-Remote "mkdir -p $Root/runtime $Root/jobs $Cache && chmod 700 $Root $Root/runtime $Root/jobs"
& scp -q scripts/illustrations/worker.py scripts/illustrations/Dockerfile "${HostName}:$Root/runtime/"
if ($LASTEXITCODE -ne 0) { throw 'Could not copy illustration runtime files' }
& scp -q scripts/illustrations/gate.sh "${HostName}:$Root/gate.sh"
if ($LASTEXITCODE -ne 0) { throw 'Could not copy the SSH gate' }
Invoke-Remote "sed -i 's/\r$//' $Root/gate.sh && chmod 755 $Root/gate.sh && docker build -t $Image $Root/runtime"
# Weights only (no README sample images); `hf` avoids nested quoting through ssh.
Invoke-Remote "docker run --rm --network bridge --user 1000:1000 --entrypoint hf -e HF_HOME=/models -v ${Cache}:/models $Image download $Model --revision $Revision --cache-dir /models/hub --exclude 'assets/*'"
Invoke-Remote "test -d $Cache/hub/models--Qwen--Qwen-Image-2.1-Turbo/snapshots/$Revision"
Write-Host "SFGPU runtime and pinned cache are ready: $Revision"
