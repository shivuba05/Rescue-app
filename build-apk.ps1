$ErrorActionPreference = 'Stop'
$envDir = "c:\Users\User\Desktop\project\android-env"

Write-Host "1/4 Configuring OpenJDK 17..."
$jdkDir = "$envDir\jdk\jdk-17.0.20.1+1"
$env:JAVA_HOME = $jdkDir
$env:Path = "$jdkDir\bin;" + $env:Path

Write-Host "2/4 Downloading Android SDK Command Line Tools (with curl)..."
$sdkDir = "$envDir\android-sdk"
if (-not (Test-Path $sdkDir)) { New-Item -ItemType Directory -Force -Path $sdkDir | Out-Null }
$cmdlineZip = "$envDir\cmdline-tools.zip"
if (-not (Test-Path "$sdkDir\cmdline-tools\latest\bin\sdkmanager.bat")) {
    Write-Host "Downloading Command Line Tools..."
    curl.exe -L "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" -o $cmdlineZip
    Write-Host "Extracting Command Line Tools..."
    if (Test-Path "$sdkDir\cmdline-tools-tmp") { Remove-Item -Recurse -Force "$sdkDir\cmdline-tools-tmp" }
    Expand-Archive -Path $cmdlineZip -DestinationPath "$sdkDir\cmdline-tools-tmp" -Force
    if (-not (Test-Path "$sdkDir\cmdline-tools\latest")) { New-Item -ItemType Directory -Force -Path "$sdkDir\cmdline-tools\latest" | Out-Null }
    Move-Item -Path "$sdkDir\cmdline-tools-tmp\cmdline-tools\*" -Destination "$sdkDir\cmdline-tools\latest" -Force
}
$env:ANDROID_HOME = $sdkDir
$env:Path = "$sdkDir\cmdline-tools\latest\bin;$sdkDir\platform-tools;" + $env:Path

Write-Host "3/4 Accepting Android Licenses and installing SDK..."
$yes = "y`n" * 100
$yes | & "$sdkDir\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
& "$sdkDir\cmdline-tools\latest\bin\sdkmanager.bat" "platform-tools" "platforms;android-34" "build-tools;34.0.0"

Write-Host "4/4 Building APK using Expo (Local Build)..."
Set-Location "c:\Users\User\Desktop\project\mobile-app"
$env:EXPO_PUBLIC_API_URL="https://your-vercel-deployment.vercel.app"
npx expo prebuild --platform android --clean
Set-Location "android"
.\gradlew assembleRelease

Write-Host "============================"
Write-Host "APK BUILD COMPLETE!"
Write-Host "Your APK is located at: c:\Users\User\Desktop\project\mobile-app\android\app\build\outputs\apk\release\app-release.apk"
Write-Host "============================"
