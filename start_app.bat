@echo off
title OpportunityHub - Internships & Hackathons Auto-Apply
cd /d "%~dp0"
echo Starting OpportunityHub Application...
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\start_app.ps1"
echo OpportunityHub launched!
