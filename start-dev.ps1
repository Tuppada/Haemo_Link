# Start backend and frontend for local development.
# Run from the repository root: .\start-dev.ps1

$backend = Start-Process -NoNewWindow -PassThru -FilePath pwsh -ArgumentList '-NoLogo', '-NoProfile', '-Command', 'cd "%PWD%"; .\\mvnw.cmd spring-boot:run' 
$frontend = Start-Process -NoNewWindow -PassThru -FilePath pwsh -ArgumentList '-NoLogo', '-NoProfile', '-Command', 'cd "%PWD%\\haemolink-frontend"; npm install; npm run dev' 

Write-Host "Started backend and frontend processes. Backend PID: $($backend.Id), Frontend PID: $($frontend.Id)"
Write-Host "If you want to stop them manually, use Stop-Process -Id <pid>."