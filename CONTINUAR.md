# SHADOW OPS: guia para continuar em outra conversa

Leia isto primeiro, depois o `PROGRESSO.md`. Atualizado em 27/10/2026, após a integração em 3ª pessoa.

## 1. O projeto em uma frase
Tiro tático em **3ª pessoa** no navegador (Three.js 0.160 por CDN, módulos ES, sem build). Jogador = **Izzy**; bots = guarda de máscara;
mapa = **WAREHOUSE** (GLB). Modos: Competitivo 5v5, Mata-mata e Treino, sempre contra bots. Multiplayer online não existe.

## 2. Estado atual
- [x] Partes 1–4 (motor, armas, bots) — base original
- [x] Integração TPS: câmera, Izzy animada, bots com modelo e animações, warehouse com colisão/navegação, armas 3D, luneta, mira da Vector
- [x] HUD: inventário na troca de arma, feed de abates estilizado, selo de abate
- [ ] Parte 5: regras do competitivo (rodadas, C4, economia)
- [ ] Parte 6: placar/fim do mata-mata, alvos do treino
- [ ] Parte 7: acabamento, balanceamento, otimização

## 3. Como o usuário roda e testa
`GAME 1V1\1 - INICIAR SERVIDOR.bat` e `2 - ABRIR JOGO NO NAVEGADOR.bat`. Se o Claude estiver ligado ao computador do usuário,
dá para testar no navegador do app em `http://localhost:8000` (o servidor precisa estar aberto). Dicas de teste automatizado no navegador:
- O jogo pausa sem pointer lock: em teste, `__game.pause=()=>{}; __game.paused=false;` e `__game.weapons.active=()=>true`.
- O botão "Iniciar partida" da sala tem contagem regressiva: espere `__game.running`.
- Ao trocar arquivos, o navegador guarda módulos em cache: `fetch(arquivo,{cache:'reload'})` antes de recarregar.
- Ao copiar arquivos para o PC do usuário, use sempre um caminho de origem novo (uma cópia repetida do mesmo caminho pode não ser regravada).

## 4. Contratos que não podem quebrar
Ver "Contratos entre módulos" no `PROGRESSO.md`. Principais: piso em y=0; yaw 0 olha para -z; modelos Mixamo giram yaw+π;
`WarehouseData.js` é gerado (não editar à mão); objetos de `game.assets` não são descartados entre partidas.

## 5. Como foi gerada a colisão do warehouse
Voxelização do GLB (0,2 m na horizontal, 0,1 m na vertical, só de y=0 a 7,5 m), junção gulosa dos voxels em caixas (5.262) +
base sólida sob o piso + 4 paredes invisíveis no limite do piso (x −39,8…39,9; z −27,57…27,53). Spawns escolhidos com folga ≥ 2 m
das paredes, espalhados por amostragem do ponto mais distante. Se o mapa mudar, refazer esse processo.

## 6. Pontos que precisam de olhar humano
- Posição da faca na mão e aparência das armas em movimento (corrida/recarga).
- Balanceamento dos bots no mapa novo (em Node: jogador parado a 20 m morre em ~2,7 s no normal).
- Ritmo da câmera e sensibilidade em 3ª pessoa.

## 7. Estilo de trabalho combinado
- Português do Brasil, explicações simples (o usuário não é programador, usa Windows).
- Não apagar arquivos sem pedir; antigos vão para `_to_delete` e o usuário apaga.
- Ao fim de cada etapa: atualizar `PROGRESSO.md` e este arquivo.
