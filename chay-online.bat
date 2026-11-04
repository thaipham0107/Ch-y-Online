@echo off
chcp 65001 >nul
title Chay Online
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\start.ps1"
