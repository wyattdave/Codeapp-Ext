@echo off
setlocal
set "CAP_SHIM_DIR=%~dp0"
node "%CAP_SHIM_DIR%cap.js" %*
exit /b %ERRORLEVEL%