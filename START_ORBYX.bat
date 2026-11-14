@echo off
setlocal
title ORBYX Expedition
cd /d "%~dp0"
py -3 --version >nul 2>&1
if not errorlevel 1 (
  py -3 "%~dp0serve.py"
  goto finish
)
python --version >nul 2>&1
if not errorlevel 1 (
  python "%~dp0serve.py"
  goto finish
)
echo Python 3 was not found. Install Python from https://www.python.org/downloads/
echo Select Add Python to PATH during installation, then run this file again.
:finish
pause
