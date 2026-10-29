$ErrorActionPreference = 'Stop'
$sdkDir = "$env:LOCALAPPDATA\Android\Sdk"
if (-not (Test-Path $sdkDir)) {
    New-Item -ItemType Directory -Force -Path $sdkDir | Out-Null
}
Set-Location $sdkDir
Write-Host "Downloading Android command line tools..."
Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" -OutFile "cmdline-tools.zip"
Write-Host "Extracting..."
if (Test-Path "$sdkDir\cmdline-tools") { Remove-Item -Recurse -Force "$sdkDir\cmdline-tools" }
Expand-Archive -Path "cmdline-tools.zip" -DestinationPath "$sdkDir\cmdline-tools" -Force
Rename-Item -Path "$sdkDir\cmdline-tools\cmdline-tools" -NewName "latest"
Remove-Item "cmdline-tools.zip"

Write-Host "Setting Environment Variables..."
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkDir, 'User')
$userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notmatch 'Android\\Sdk') {
    $newPath = "$userPath;$sdkDir\cmdline-tools\latest\bin;$sdkDir\platform-tools"
    [System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}
$env:ANDROID_HOME = $sdkDir
$env:Path += ";$sdkDir\cmdline-tools\latest\bin;$sdkDir\platform-tools"

Write-Host "Accepting licenses and installing SDK packages..."
echo y | .\cmdline-tools\latest\bin\sdkmanager.bat --licenses
.\cmdline-tools\latest\bin\sdkmanager.bat "platform-tools" "platforms;android-34" "build-tools;34.0.0"
Write-Host "Android SDK Setup Complete."
