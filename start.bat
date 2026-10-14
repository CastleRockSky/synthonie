@echo off
setlocal
cd /d "%~dp0"
title Zeke Synth
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing... this takes a minute.
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node scripts\start.mjs %*
if errorlevel 1 pause
