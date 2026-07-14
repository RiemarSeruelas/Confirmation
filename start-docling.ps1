$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Checking Docling..."
python -c "import docling; print('Docling is installed.')"

Write-Host ""
Write-Host "Starting local Docling service on port 5006..."
Write-Host "Keep this window open while using the Confirmation app."
Write-Host ""

python .\docling_service.py
