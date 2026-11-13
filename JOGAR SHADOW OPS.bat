@echo off
chcp 65001 >nul
title SHADOW OPS - servidor local (porta 8000)
rem Atalho do jogo que esta nesta pasta. Funciona de qualquer lugar: entra sozinho na pasta do jogo.
cd /d "%~dp0"
if not exist index.html goto semjogo

rem 0) Atualiza o jogo com a versao mais nova do GitHub (melhorias feitas em outro PC / por outra IA).
rem    So avanca se for seguro (--ff-only): se houver mudancas locais sem enviar, nao mexe em nada e o jogo abre como esta.
where git >nul 2>nul && if exist .git (
  echo Procurando atualizacoes no GitHub...
  git pull --ff-only --quiet origin main >nul 2>nul && (echo Jogo atualizado com a versao mais nova.) || (echo Nao deu para atualizar agora [sem internet ou mudancas locais]. Abrindo a versao deste PC.)
)

rem 1) Fecha um servidor antigo (Python) que ainda esteja na porta 8000
echo Verificando se ha um servidor antigo aberto na porta 8000...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -match '^(py|python|pythonw)$') { Stop-Process -Id $p.Id -Force; Write-Host 'Servidor antigo fechado.' } }"

rem 2) Acha o Python
set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto sempython

echo ==========================================================
echo   SHADOW OPS - servidor rodando em http://127.0.0.1:8000
echo   Mapas: FAVELA, WAREHOUSE e CELEIRO (escolha no menu iniciar)
echo   Sem cache: o navegador sempre pega a versao nova.
echo   O jogo vai abrir sozinho no navegador.
echo   Deixe esta janela ABERTA enquanto joga.
echo ==========================================================

rem 3) Abre o navegador 2 segundos depois (endereco novo = nada de versao velha)
if /i not "%~1"=="semnavegador" start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process ('http://127.0.0.1:8000/?v=' + (Get-Random))"

rem 4) Liga o servidor (fica rodando ate fechar esta janela)
%PY% tools\server.py 8000
echo.
echo O servidor parou. Se apareceu alguma mensagem de erro acima, tire um print e mande.
pause
exit /b

:semjogo
echo [ERRO] Nao encontrei index.html em "%cd%".
echo Este .bat precisa ficar na pasta do jogo (junto do index.html).
pause
exit /b 1

:sempython
echo [ERRO] Python nao encontrado. Instale em https://www.python.org/downloads/
echo        Marque "Add python.exe to PATH" na instalacao e rode este .bat de novo.
pause
exit /b 1
