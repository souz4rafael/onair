@echo off
REM Launcher script that clears ELECTRON_RUN_AS_NODE before starting
REM This variable can be set by other tools (Clawpilot, npm scripts etc.)
REM and prevents Electron from initializing correctly.
SET ELECTRON_RUN_AS_NODE=
SET NODE_ENV=development
cd /d "%~dp0"
.\node_modules\electron\dist\electron.exe . %*
