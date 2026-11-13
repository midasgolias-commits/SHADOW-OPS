# SHADOW OPS: guia para continuar em outra conversa

Leia isto primeiro, depois o `PROGRESSO.md`. Atualizado em 13/11/2026 (mapa FAVELA e MODO FAVELA).

## 1. O projeto em uma frase
Tiro tático em **3ª pessoa** no navegador (Three.js 0.160 por CDN, módulos ES, sem build). Jogador = **Izzy**; bots = guarda de máscara;
mapas = **FAVELA** (morro, do projeto FavelaRJ da Unreal), **WAREHOUSE** (GLB) e **CELEIRO** (visual montado em código + GLBs soltos).
Modos: **MODO FAVELA** (o competitivo 5v5: Polícia contra Bandido, o lado é escolhido ao entrar), Mata-mata e Treino,
sempre contra bots. Multiplayer online não existe.

## 2. Estado atual
- [x] Partes 1–4 (motor, armas, bots) — base original
- [x] Integração TPS: câmera, Izzy animada, bots com modelo e animações, warehouse com colisão/navegação, armas 3D, luneta, mira da Vector
- [x] Segundo mapa **CELEIRO** (12/11): visual em `CeleiroMap.js`, colisão gerada, spawns/sites verificados, campo "Mapa" na sala
- [x] HUD: inventário na troca de arma, feed de abates estilizado, selo de abate
- [x] Mapa **FAVELA** (13/11): morro com terreno como grade de alturas, bots em 2,5D, ponte, sites na praça e na laje; competitivo renomeado para **MODO FAVELA** com escolha Polícia/Bandido
- [ ] Parte 5: regras do competitivo (rodadas, C4, economia)
- [ ] Parte 6: placar/fim do mata-mata, alvos do treino
- [ ] Parte 7: acabamento, balanceamento, otimização

## 3. Como o usuário roda e testa
Dois cliques em `JOGAR SHADOW OPS.bat` (ou no atalho `SHADOW OPS - JOGAR` da Área de Trabalho). Ele liga o `tools/server.py` (sem cache)
e abre o navegador sozinho em `http://127.0.0.1:8000`. Se o Claude estiver ligado ao computador do usuário,
dá para testar no navegador do app em `http://127.0.0.1:8000` (o servidor precisa estar aberto). Dicas de teste automatizado no navegador:
- O jogo pausa sem pointer lock: em teste, `__game.pause=()=>{}; __game.paused=false;` e `__game.weapons.active=()=>true`.
- O botão "Iniciar partida" da sala tem contagem regressiva: espere `__game.running`.
- Ao trocar arquivos, o navegador guarda módulos em cache: `fetch(arquivo,{cache:'reload'})` antes de recarregar.
- Ao copiar arquivos para o PC do usuário, use sempre um caminho de origem novo (uma cópia repetida do mesmo caminho pode não ser regravada).

## 4. Contratos que não podem quebrar
Ver "Contratos entre módulos" no `PROGRESSO.md`. Principais: piso em y=0 nos galpões (na FAVELA não: nascimentos e sites trazem `y` e o terreno é `CollisionWorld.setTerrain`); yaw 0 olha para -z; modelos Mixamo giram yaw+π;
`WarehouseData.js` é gerado (não editar à mão); objetos de `game.assets` não são descartados entre partidas.

## 5. Como foi gerada a colisão do warehouse
Voxelização do GLB (0,2 m na horizontal, 0,1 m na vertical, só de y=0 a 7,5 m), junção gulosa dos voxels em caixas (5.262) +
base sólida sob o piso + 4 paredes invisíveis no limite do piso (x −39,8…39,9; z −27,57…27,53). Spawns escolhidos com folga ≥ 2 m
das paredes, espalhados por amostragem do ponto mais distante. Se o mapa mudar, refazer esse processo.

## 5.1 Como foi gerada a colisão do CELEIRO
O mapa do CELEIRO não é um GLB único: `src/world/CeleiroMap.js` monta a geometria em código e registra os colisores AABB.
`node tools/gen-celeiro-data.mjs` roda esse construtor sem texturas/modelos (Three.js r180 que veio junto do projeto original)
e grava `src/world/CeleiroData.js` com 371 caixas + base do piso + 4 paredes de limite. **Nunca edite `CeleiroData.js` à mão**:
mude `CeleiroMap.js` e rode o gerador. Depois rode `node tools/check-celeiro-spawns.mjs` para conferir spawns e sites
(andável, alcançável do centro e folga ≥ 2 m) e cole os valores em `MapData.js`.
Obs.: o Gerador lê o Three.js de `C:\Users\Coutinho\Desktop\mapa vagao\three\build\three.module.js` (ajuste `THREE_URL` se mover a pasta).

## 5.2 Como foi gerada a colisão da FAVELA
`src/world/FavelaData.js` é gerado pelo projeto FavelaRJ (`C:\Users\luiss\Downloads\FavelaRJ_UE\Web\tools\shadowops-favela.mjs`) a partir das
malhas de colisão exportadas para a Unreal (`ImportMapa/saida/colisao`, `colvias`, `colvalao`, `colterreno`): casas, vias e valão viram caixas
(voxels 0,25 × 0,15 m + junção gulosa), o terreno vira grade de alturas de 0,5 m e cada célula ganha o piso onde um bot fica de pé
(a superfície da via mais próxima: tabuleiro da ponte, degrau da escadaria; sem via, o térreo). Abaixo da água do rio (3,6 m) não há piso, e a
beira do rio ganha grades invisíveis. **Nunca edite à mão**: rode o gerador e depois `node tools/check-favela-spawns.mjs`.

## 6. Pontos que precisam de olhar humano
- FAVELA: ritmo da partida (arena 143 × 230 m, uma só ponte), bots em becos estreitos. Mapa recortado em 13/11 (só a área marcada, 26 MB, ~2,7 mi de triângulos na tela); o mapa inteiro antigo está em `_to_delete/` para o dono apagar.
- Posição da faca na mão e aparência das armas em movimento (corrida/recarga).
- Balanceamento dos bots no mapa novo (em Node: jogador parado a 20 m morre em ~2,7 s no normal).
- Ritmo da câmera e sensibilidade em 3ª pessoa.
- CELEIRO: as texturas somam ~48 MB de download e ~490 MB de VRAM. Há um plano medido para reencodar (≈3,8 MB e ~80 MB de VRAM,
  −92%) em `tools/estimate-celeiro-resize.ps1`; falta decidir e aplicar. `concrete_wall/`, `barn_trim/`, `painted_metal/rough.jpg`
  e `bark/rough.jpg` não são usadas (4,6 MB) — remover só com o "ok" do usuário.

## 7. Estilo de trabalho combinado
- Português do Brasil, explicações simples (o usuário não é programador, usa Windows).
- Não apagar arquivos sem pedir; antigos vão para `_to_delete` e o usuário apaga.
- Ao fim de cada etapa: atualizar `PROGRESSO.md` e este arquivo.
