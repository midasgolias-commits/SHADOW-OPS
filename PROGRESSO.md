# SHADOW OPS: progresso do projeto

Tiro tático em **terceira pessoa** no navegador (Three.js 0.160 via CDN, módulos ES, sem build).
Última atualização: 13/11/2026 (mapa **FAVELA** e o competitivo virou **MODO FAVELA**: Polícia contra Bandido).

## Como rodar (Windows)
Na pasta do jogo, dê dois cliques em **`JOGAR SHADOW OPS.bat`** — ou use o atalho **`SHADOW OPS - JOGAR`** na Área de Trabalho.
Ele fecha um servidor antigo, abre o servidor e o jogo no navegador sozinho. Deixe a janela preta aberta enquanto joga.
O servidor é `tools/server.py` (**sem cache**: o navegador sempre pega a versão nova).
Manual: na pasta que tem o `index.html`, `py tools/server.py 8000` e abrir `http://127.0.0.1:8000`.
Ao abrir, o menu mostra "Carregando… %" (mapa, personagens, 31 animações e 6 armas, ~50 MB, só na 1ª vez por aba).

Testes sem navegador (Node, precisam de `npm i three@0.160.0`):
- `node tools/check-map.mjs`: spawns livres/alcançáveis, caminho até os sites, rampas dos cantos sobem andando e nenhuma parede "teleporta" o jogador.
- `node tools/check-weapons.mjs`: regras das armas, FOV e câmera parada no recuo.
- `node tools/check-bots.mjs`: percepção, combate, navegação, desempenho dos bots no warehouse (40 verificações).

## Controles
WASD move · Shift corre · Ctrl/C agacha · Espaço pula · botão esquerdo atira · **botão direito: mira pela arma (Vector) ou luneta (sniper)** ·
1 a 6 troca de arma · roda do mouse alterna · Q última arma · R recarrega · Esc pausa.

## O que existe hoje
- **3ª pessoa:** câmera atrás do ombro direito, com colisão (encolhe ao encostar em parede). A Izzy (Mixamo) é o jogador.
- **Animações** (31 clipes, mesmas para jogador e bots): parado, andar e correr em 8 direções, agachado (parado/4 direções/tiro/recarga/morte),
  pulo, tiro e recarga só no tronco (por cima da locomoção), faca (parado/4 direções/golpe), morte. A passada acompanha a velocidade real.
- **FOV:** o valor das configurações é horizontal (convertido para vertical conforme a tela, `src/core/Fov.js`).
- **Mira:** ponto branco no centro. Ao atirar, o personagem segura a pose de mira por ~1 s e o corpo/tronco giram até o cano apontar para a mira (correção automática).
- **Armas 3D na mão** (jogador e bots): fuzil (AR-15 provisória), Vector, sniper, SPAS-12, Magnum, **faca de energia** (brilho emissivo).
  A arma fica presa rígida à mão direita, calibrada na pose de tiro (a mão esquerda cai no guarda-mão). O rastro do tiro sai do cano.
- **Recuo** não mexe a câmera: o ponto da mira (branco ou vermelho) sobe junto com os tiros e volta sozinho; o ponto sempre mostra onde o próximo tiro vai.
- **Mão esquerda** presa ao guarda-mão por IK de dois ossos (`HeldWeapon.leftHandIK`, distância `hand2` por arma); solta na recarga, troca e faca.
- **Vector:** botão direito põe a arma em frente à câmera (zoom ~2,7x, `ads.fov: 22` vertical), com a janela do holográfico centrada num **ponto vermelho** (direção do tiro); no recuo a arma gira junto com o ponto; sem rastro nem dispersão grande mirando.
  O personagem some enquanto mira. Ajuste fino da centralização em `WEAPON_MODELS.smg.ads` (`back`, `up`, `dx`, `dy`).
- **Sniper:** botão direito vai para 1ª pessoa com a luneta (`assets/ui/sniper_scope.png`, altura da tela, laterais pretas; zoom ~6x, `zoomFov: 10` vertical; tiro exatamente no centro).
- **Mapa WAREHOUSE** (`assets/maps/warehouse.glb`): colisão gerada por voxelização (5.267 caixas), navegação dos bots em grade de 0,5 m,
  20 spawns de mata-mata, spawns de ataque/defesa e sites A/B para o competitivo, minimapa gerado das caixas.
- **Mapa CELEIRO** (`assets/maps/celeiro/`): pátio com galpão de madeira, containers, vagões, toras, caixotes, paletes, torres e muro com grade.
  O visual é montado em tempo de execução por `src/world/CeleiroMap.js` (geometria própria + 6 GLBs + texturas); a colisão vem de
  `src/world/CeleiroData.js` (376 caixas, geradas de `CeleiroMap.js`). Tem spawns 5x5, 12 pontos de mata-mata e sites A/B.
  Na sala, o campo **Mapa** troca entre WAREHOUSE e CELEIRO (o minimapa, os sites e o nome da sala mudam junto).
- **Bots** com o modelo de máscara (`assets/characters/bot.fbx`), arma na mão, animações e a mesma correção de mira.
- HUD: troca de arma estilo inventário (atual em destaque, anterior e faca visíveis, resto some em degradê), feed de abates com ícones,
  selo central de abate (ABATE / TIRO NA CABEÇA / FACADA / DUPLO / TRIPLO…).
- **Sons gravados** (`assets/sounds/*.mp3`): tiros, recargas, pulo, abate, dano e passos em laço (mais rápido correndo, mais lento agachado).
  Sem o arquivo, cada som volta ao procedural.
- **Colisão:** rampas sobem andando (sobe até o degrau mais alto sob o corpo); encostar em parede alta não joga o jogador para o topo.

## Estrutura
    index.html                      importmap: three + three/addons
    JOGAR SHADOW OPS.bat            liga o servidor (tools/server.py) e abre o jogo no navegador
    assets/maps/warehouse.glb       mapa (texturas recomprimidas, 14,6 MB)
    assets/maps/celeiro/            mapa CELEIRO: models/*.glb, textures/, CREDITOS.md
    assets/characters/izzy.fbx      jogador (com skin, textura embutida)
    assets/characters/bot.fbx       bot (malha única, máscara simplificada, rig Mixamo 41 ossos)
    assets/anims/<pasta>/<nome>.fbx animações Mixamo sem skin (with gun / crouch with rifle / with knife)
    assets/weapons/<id>/            modelos e texturas das armas (texturas reduzidas para 1024)
    assets/ui/sniper_scope.png      luneta
    assets/armas/                   arquivos originais das armas (não usados diretamente pelo jogo)
    src/main.js                     menu, sala, HUD, carregamento
    src/core/Game.js                cena, loop, câmera/avatar do jogador, luzes, mapa GLB
    src/core/Assets.js              carrega tudo uma vez (não é descartado entre partidas)
    src/core/AnimTable.js           tabela id → arquivo de animação, velocidades gravadas (sem Three.js)
    src/player/PlayerController.js  movimento, física e câmera 3ª pessoa
    src/player/CharacterAnimator.js escolhe/mistura animações (jogador e bots)
    src/weapons/Weapons.js          regras das 6 armas
    src/weapons/WeaponSystem.js     tiro, recuo, recarga, troca, luneta, mira pela arma
    src/weapons/WeaponModels.js     modelos 3D das armas: normalização e fixação na mão (HeldWeapon)
    src/weapons/Effects.js          faíscas, marcas, rastros
    src/bots/                       Bot, BotManager, BotBody (hitbox; boneco de caixas só nos testes), BotConfig
    src/world/WarehouseData.js      colisão/spawns gerados do GLB (não editar à mão)
    src/world/CeleiroMap.js         construtor do visual do CELEIRO (geometria + GLBs); também define os colisores
    src/world/CeleiroData.js        colisão do CELEIRO gerada de CeleiroMap.js (não editar à mão)
    src/world/MapData.js            registro de mapas (WAREHOUSE / CELEIRO) e dados de cada um
    tools/gen-celeiro-data.mjs      regera CeleiroData.js (rode após mudar CeleiroMap.js)
    tools/check-celeiro-spawns.mjs  confere spawns/sites do CELEIRO (andável, alcançável, folga ≥ 2 m)
    src/world/CollisionWorld.js     colisão por caixas com grade espacial
    src/world/Navigation.js         grade + A*
    src/ui/                         Lobby, Minimap, WeaponSwitch, KillFeed, WeaponIcons
    src/styles/                     main.css, weapons.css, bots.css, hudfx.css
    tools/devtest.js                ajudante de testes no navegador (console: `const T = await import('/tools/devtest.js?'+Date.now()); await T.setup()`)

## Contratos entre módulos
- Eixos: x leste, z sul, y cima. **Piso do warehouse em y=0** (o GLB tem o piso em y=0,266 e é deslocado; o piso do arquivo está com as faces
  viradas para baixo, por isso os materiais do mapa usam DoubleSide). Yaw 0 olha para -z. Modelos Mixamo olham para +z (rotação yaw+π).
- `buildMapData(id)` → `{ name, visual?, glb?, y0, navCell, navSeed, bounds, boxes[], sites[], labels[], zones[], spawns{attackers, defenders, dm}, terrain?, floorAt? }`
  (`id` = `favela`, `warehouse` ou `celeiro`; a lista fica em `MAPS`, `MapData.js`). Mapas com `visual: 'celeiro'` não têm `glb`: o visual vem de `CeleiroMap.js`;
  `visual: 'favela'` vem de `FavelaMap.js`.
- **Mapas de morro (FAVELA): o piso NÃO fica em y=0.** Pontos de nascimento e sites trazem `y` (altura do piso); quem posiciona alguém usa `p.y || 0`.
  `terrain` (grade de alturas) vai para `CollisionWorld.setTerrain`: o chão de terra entra no movimento, no raycast, na linha de visão e na granada.
  `floorAt(x,z)` vai para a `Navigation` (2,5D: cada célula guarda o piso e só liga com vizinhas de até 0,6 m de desnível). Sem `terrain`, tudo é como antes.
- Caixas com `tag: 'blocker'` (grade invisível na beira do rio da FAVELA) seguram o corpo, mas tiro, linha de visão e granada passam.
- Times do competitivo (MODO FAVELA): `att` = **Polícia** (azul), `def` = **Bandido** (vermelho). O lado é escolhido na entrada (`TeamPicker` → `lobby.quickStart(..., { team })`).
- Armas: `weapons.onAction(tipo, w, extra)` ('shot'|'melee'|'reload') e `weapons.muzzle()` são ligados pelo Game para a animação e o rastro.
- `player.fp` (câmera nos olhos, luneta) e `player.aimTarget` (mira pela arma) são escritos pelo WeaponSystem.
- Tudo carregado de arquivo fica em `game.assets`; objetos com `userData.asset`/`userData.instance` não são descartados no `Game.stop()`.

## Pendências e ideias
- Escolher o fuzil definitivo (hoje AR-15 do laboratório). Pistola usa o modelo antigo (Magnum).
- Animações próprias de pistola (hoje usa as de fuzil). Faca: ajuste fino da posição na mão.
- Parte 5 (regras do competitivo: rodadas, C4, economia), Parte 6 (placar/fim do mata-mata, alvos do treino), Parte 7 (acabamento).
- A ala sul do warehouse (z > 17,4) está fechada por parede sem porta: não é usada.

## Histórico
- Partes 1–4 (FPS procedural, mapa "Pátio Industrial", armas, bots). 26/10: limpeza do FPS. 27/10: HUD de troca de arma e feed;
  integração TPS completa (Izzy, bots, warehouse, armas 3D, luneta, mira da Vector). O Pátio Industrial foi removido.
  Depois: FOV horizontal, arma rígida na mão, recuo sem mexer a câmera, ponto vermelho da Vector, mira de ponto branco, sons gravados,
  faca de energia, correção das rampas e das paredes.
- Se o jogo parar de carregar ("fetch failed"), o servidor caiu: rode de novo o `1 - INICIAR SERVIDOR.bat`.
- Backup do código anterior à integração TPS: `_backup_antes_TPS.zip`.

## Lab de Armas (ajuste da arma na mão, cena por cena)
- Abrir: menu → **Lab de Armas** (ou `lab.html`). Escolhe personagem (Izzy/Bot), arma e cena; ajusta com setas/anéis presos na arma ou pelos números; **Salvar** grava em `assets/config/grips.json` (servidor `tools/server.py`, POST `/api/grips`, só do próprio PC; guarda `grips.backup.json` da versão anterior).
- Cenas: Geral, Parado, Andando, Correndo, Pulando, Atirando/mirando, Recarregando, Agachado (parado/andando/atirando/recarregando); faca: Geral, parado, correndo, golpe, pulando. Cena sem ajuste próprio usa o Geral; o bot usa o ajuste da Izzy até ter o próprio.
- Formato: ajuste = deslocamento `p` (m) + giro `r` (graus XYZ) em cima da posição automática da arma; `lh` = ponto da mão esquerda (frente/baixo/lado, m). Código: `src/weapons/Grips.js`, `HeldWeapon` em `WeaponModels.js` (aplica e desliza suave ao trocar de cena), `CharacterAnimator.scene`, `src/lab/Lab.js`.
- Para a próxima sessão: ler `assets/config/grips.json` do usuário e usar como base.
- Lab: mão esquerda solta por padrão (não "gruda" ao encaixar); bolinha laranja = apontar a ponta; bolinha azul = ponto da mão esquerda; botões ▲◀▶▼/Rolar e setas do teclado.
- Lab: visão **1ª pessoa** (cena `fp`, câmera fixa no ponto dos olhos medido na pose de mira, cabeça escondida, corpo gira até o cano apontar para a frente como no jogo). Câmera/zoom salvos em `grips.json` → `fp.<personagem>` = {x,y,z (cm), fov}. Ainda NÃO existe 1ª pessoa no jogo (próximo passo: tecla V + viewmodel desenhado por cima).
- Lab: botão **Copiar ajustes da Izzy → Bot** (mede a arma em relação à palma da Izzy, normalizada pelo tamanho da mão, e reposiciona na palma do bot). Rodado em 27/10: 45 ajustes do bot salvos.
- Animações novas (27/10): faca — golpe `Stabbing_3`, pulo `Jump_1`, pulo correndo `Running_Jump_2`, de lado `Standing_Run_Left/Right`, salto por cima `Big_Jump`. Dedos que faltam nesses arquivos são completados com a pose parada da mesma pasta (`Assets._fillFingers`).
- **Salto por cima** (só com a faca): correndo, Espaço e Espaço de novo no ar. `PlayerController._vaultPlan` procura obstáculo 0,3–1,3 m de altura, até ~2,6 m de fundo, sem teto e com pouso livre; o movimento segue o quadril da animação (0,45→1,45 s voo, depois rolamento com colisão), os pés ficam ≥10 cm acima do topo. Testado nas caixas de 1,2 m perto de x=-37.
- **VX-47 com mira pela arma** (botão direito) igual à Vector: `Weapons.rifle.ads` fov 17; `WeaponModels.rifle.ads` back .42, ponto da mira manual `sight {y:.18,z:.03}` (EOTech), vidros transparentes (`glass:/Glass/i`), tubo da luneta clareado (`lift`).
- **Pistola**: pasta `assets/anims/with pistol` (20 arquivos). Usadas: parado, andar/correr frente e trás, de lado (strafe e strafe (2)), pulos, ajoelhado + transições. Não usadas: "arc" (curvas, giram o corpo). Agachado andando e tiro/recarga da pistola ainda usam as animações do fuzil (o pacote não tem).
- Lab: câmera da 1ª pessoa com giro (rx/ry/rz), "esconder perto" (corte), mouse (esq. gira, dir. move, roda frente/trás, Shift+roda zoom).
- **Configurações na partida (Esc)**: a pausa mostra o painel ao lado dos botões (fundo semitransparente, mudanças valem na hora). Abas: Controles (sensibilidade, sensibilidade mirando `adsSens`), Câmera (FOV, `camDist` distância, `camSide` ombro, `camHeight` altura + "Câmera padrão"), Mira (estilo ponto/cruz/cruz com ponto/círculo, cor, tamanho, comprimento, espessura, espaço, contorno, opacidade, abre ao atirar + prévia + "Mira padrão"), Áudio e vídeo. Código: `src/ui/Settings.js` (SCHEMA, SETTINGS_DEFAULTS, applyCrosshair); salvo em localStorage `shadowops.settings`.
- Lab 1ª pessoa: tela grande = câmera de ajuste ao lado da arma (setas/anéis inteiros, anéis maiores no modo girar); janela no canto = 1ª pessoa ao vivo (mouse em cima ajusta a câmera); botão "Ver em tela cheia".
- **Clarão no cano** (`src/weapons/MuzzleFlash.js`, texturas reduzidas em `assets/fx/muzzle/A–E.png` do pacote "fire shoot flame vfx"): 2 chamas cruzadas no eixo do cano + brilho redondo de frente + faíscas, forma/giro/tamanho sorteados. Tiro único: maior e 0,07 s; segurado (automático): menor e 0,045 s; mirando pela arma: 55% do tamanho. Jogador tem luz rápida (PointLight fixa na cena, nunca entra/sai — evita recompilar shaders); bots só o clarão.
- **Sons**: `kill_sound.mp3` (abate do jogador, ganho .75) e `bullet_onme_sound.mp3` (levar tiro, ganho 1), cortados do silêncio e normalizados (os originais tinham 17,8 s e 1,9 s). `kill.mp3`/`hurt.mp3` antigos ficam como reserva.
- Conhecido: `tools/check-map.mjs` acusa em ~1 de 5 rodadas um "teleporte em parede" numa das 400 caminhadas aleatórias (colisão antiga, não mexida) — investigar.
- **1ª pessoa = só 4 cenas** (pedido do usuário: pulo/salto/agachar bagunçam a arma na tela): `fp_walk` (andando e parado), `fp_run`, `fp_fire` (atirando/mirando), `fp_reload`; faca: andar, correr, golpe. `Grips.fpSceneOf({reloading, firing, speed})` escolhe a cena no jogo (pulando/agachado/de lado continua em andar/correr). Cena sem ajuste usa `fp_walk` → antigo `fp` → Geral. No Lab, a visão 1ª pessoa lista só essas cenas; "Usar em todas as cenas" nela copia só para as 4 da 1ª pessoa. Lab 1ª pessoa: modo "Setas e anéis ajustam: Arma | Câmera" (camerazinha amarela + linhas do que ela vê); corpo não gira mais quando a arma é ajustada (giro calculado pela posição automática).
- **Ajuste do Claude (1ª pessoa estilo CrossFire)** — `assets/config/presets_claude.json` (arquivo separado; nunca sobrescreve o do usuário). Sniper (foto AWM), VX-47 (foto AUG) e Vector (foto Kriss, própria). Calculado por otimização no Lab: 4 pontos da arma (ponta do cano, mira/luneta, coronha, cabo) projetados nos pontos da foto, variando câmera (±25/25/30 cm, ±15/15/12°) e a arma na mão (±20°, ±5 cm); FOV 59. Mão esquerda da 1ª pessoa própria (`scenes.fp_walk.lh`, ex. sniper f .22 d .04; VX-47 f .23 d .025).
- Lab: quadro "Comparar com o ajuste do Claude" (tabela Seu × Claude, "Ver o do Claude" = prévia, "Usar o do Claude" = aplica e guarda o seu em `backup`, "Voltar ao meu"); câmera da 1ª pessoa por arma (`fpW`, caixa "Câmera só desta arma"); 1ª pessoa desenha só antebraços e mãos (`src/player/ArmsOnly.js`, descarta pele de ossos que não são de braço); cena "andando" da 1ª pessoa usa a pose de mira nos braços (arma erguida).
- **Sala estilo Point Blank + Mochila** (27/10): `src/ui/Lobby.js` (estrutura fixa `.lb2`: palco com personagem 3D à esquerda, abas Informação/Mochila, sala à direita com JOGAR/SAIR), `src/ui/CharacterPreview.js` (renderer próprio; skin + arma principal na pose de mira; arrastar gira; para ao sair/iniciar), `src/ui/Loadout.js` (localStorage `shadowops.loadout`: skin izzy|bot, principal rifle/smg/sniper/shotgun, secundária pistol, arma branca knife), `src/styles/lobby2.css`. Na partida: `WeaponSystem.loadout` = [principal, secundária, faca] nas teclas 1-3 (4-6 não fazem nada), HUD mostra só as 3; `Game` usa a skin escolhida (HeldWeapon com o kind da skin → ajustes do Lab da skin). Treino também usa a mochila. Trocar só fora da partida.

### Viewmodel v2 (1ª pessoa em duas camadas)
- `src/player/Viewmodel.js` → `renderFirstPerson(renderer, scene, worldCam, vmCam, vm, hide)`: o mundo é desenhado com a câmera de mira (nivelada, nos olhos) e depois só braços + arma por cima com a câmera do viewmodel (limpa a profundidade entre as duas). O ângulo da câmera do viewmodel não inclina mais o mapa. Usado na prévia do Lab (`fpOnly`) e em `tools/fptest.js`.
- Ajustes do Claude v2 em `assets/config/presets_claude.json` (sniper/AWM, rifle/AUG, smg/Kriss): mão direita no cabo (posição do seu ajuste de "atirando"), câmera perto dos olhos (y ±8, z até -12 cm), braço esquerdo entrando por baixo.
- O ajuste do Claude é editável no Lab: "Ver o do Claude" → setas/anéis/números mexem nele → "Salvar o do Claude" (POST `/api/presets`, com backup `presets_claude.backup.json`). Precisa do `tools/server.py` novo (reabrir `1 - INICIAR SERVIDOR.bat`).
- Falta: usar `renderFirstPerson` no jogo (tecla V) quando a 1ª pessoa for ligada na partida.

### Câmera do Claude editável + nível + tranco do tiro
- Lab, 1ª pessoa: faixa "Mexendo no SEU / no ajuste do CLAUDE"; botões da câmera (mover, girar, rolar, zoom; Shift = 5×); no modo Câmera as setas do teclado viram a câmera (Shift+setas movem).
- Nível: linha verde = horizonte real (meio da tela), laranja = horizonte da câmera dos braços; leitura de rolar/inclinar com ✓; botões "Nivelar (rolar 0°)", "Olhar reto (0°)", "Tudo reto (norte)". No jogo o mapa é sempre desenhado reto (duas camadas); a câmera do viewmodel só entorta braços/arma.
- Tranco do tiro feito em código (`SHOT_KICK` em WeaponModels.js; `held.shotKick(small)`), chamado no jogo e nos bots a cada tiro: recuo + cano sobe; sniper e escopeta "puxam o ferrolho/bomba" (arma deita e baixa e volta). Mirando pela luneta: 35% e sem ferrolho.
- Cenas "atirando" (fire, crouch_fire, fp_fire) têm `shots: true`: o Lab simula tiros (caixa "Simular tiros" na linha do tempo). fp_fire agora usa o corpo parado (idle) em vez de andando.

### 1ª pessoa na partida (tecla V) + câmera por cena
- `src/player/FirstPersonView.js`: cópia do que o Lab mostra (personagem só-braços numa cena própria, mesmas cenas fp_*, pegada salva, câmera do viewmodel). O jogo desenha o mapa com a câmera de mira (olhos, reta) e depois `fpv.render()` por cima. Mira pela arma (botão direito) usa a arma do mapa como antes; luneta da sniper esconde o viewmodel.
- Configuração `firstPerson` (Esc → Câmera, ou tecla V na partida). `PlayerController.firstPerson` põe a câmera nos olhos.
- Cenas da 1ª pessoa usam sempre `walk_f` como corpo (parado = congelado), igual ao Lab — assim o giro do corpo (fpYaw) e a arma batem com o Lab.
- Câmera da 1ª pessoa agora é POR CENA: `chars[kind][arma].scenes.fp_x.cam`. Sem câmera própria a cena usa a câmera da arma (fpW) / geral (fp). Lab: "Fixar esta câmera só nesta cena", "Usar esta câmera em todas as cenas da 1ª pessoa". Cena só com câmera não tem pegada própria (gripFor ignora entradas sem `p`).

### Tiro: mira fixa, recuo de câmera, caminho pelo cano (hitscan continua)
- Mira do HUD fixa no centro (removido o deslocamento por `aimOff()`/`w.off` em main.js; `aimOff()` não existe mais).
- Recuo agora é da CÂMERA: `WeaponSystem.rc` (alvo, soma por tiro, volta sozinho) → `player.recoil` (segue suave) → somado só na rotação da câmera em `PlayerController.applyLook`. A mira do mouse (`yaw/pitch`) não é tocada. Removido `PlayerController.kick` (sem uso). Mira pela arma: a arma vai presa à câmera (removido o giro de recuo em `Game._ads`).
- Ajustes gerais em `WeaponSystem.AIM` (recoilFollow, recoilRecover, recoilMaxP/Y, adsRecoil, scopeRecoil, muzzleCheck, tracerLife, tracerWidth, fpMuzzleDepth, debug). Por arma em `Weapons.js` (spread, ads.spreadMul, zoomSpread, moveSpread, airSpread, burstSpread, recoil.p/y/ramp/cap).
- Tiro (`_fireRay`): 1) raio pela câmera (+dispersão) acha o ponto mirado (`_cast`, sem dano); 2) se há cano no mapa (`muzzle()`: 3ª pessoa ou mira pela arma), o caminho final vai do cano até o ponto (obstáculo perto do cano leva o tiro); 1ª pessoa/luneta: vale o raio da câmera; 3) dano uma vez; 4) rastro do cano visual (`visualMuzzle()`; na 1ª pessoa = ponto do mapa em cima do cano dos braços na tela, via `FirstPersonView.muzzleInWorld`) até o ponto resolvido.
- Depuração: `?debugShots=1` na URL (ou `__shotDebug = true` no console): amarelo = raio da câmera, vermelho = caminho final, azul = cano, rosa = obstáculo.
- Rastro com vida/espessura configuráveis e sumindo aos poucos; rastro dos bots sai do cano deles (só visual).
- `tools/check-weapons.mjs` roda também no navegador (console da página do jogo). 34 verificações OK.

### Guia de referência (foto por cima da 1ª pessoa) no Lab
- Lab → 1ª pessoa → "Guia de referência": foto meio transparente por cima da janela da 1ª pessoa, com a mira da foto no centro da tela. Por arma: foto, transparência, tamanho, empurrão fino, ponto da mira ("Marcar a mira da foto"). Salvo no navegador (localStorage `shadowops.refGuide`).
- Fotos ficam em `assets/ref/` (o Lab lista a pasta). Padrão: `viewmodel_cf_aug.png` (CrossFire, AUG dourada; ponto verde em 1281,309 de 2557×1029 — a foto é a parte de baixo de um quadro 16:9).

### Horizonte padrão, cópia da VX e mira pela arma na 1ª pessoa
- Lab: "Horizonte padrão" (rolar e inclinar 0°), "Manter a arma no mesmo lugar da tela ao nivelar" (a câmera anda para o meio da arma ficar no mesmo ponto da tela) e "Horizonte padrão em todas as cenas desta arma".
- Aplicado e salvo (17:44): VX-47 com horizonte reto em andando/atirando/recarregando; correndo só sem rolar (inclinar −65° mantido: a arma desce na corrida). As 4 cenas da 1ª pessoa da VX (pegada + câmera; sem a mão esquerda, que cada arma tem a sua) e a câmera da arma (fpW) copiadas para Vector, sniper e SPAS. Faca e pistola não mudaram. A 3ª pessoa de cada arma não mudou.
- Jogo, 1ª pessoa: botão direito na VX-47 e na Vector faz a mesma animação de mira da 3ª pessoa nos braços (FirstPersonView._ads, igual a Game._ads, com a câmera dos braços; zoom dos braços acompanha o zoom da mira; braços somem a partir da metade, como na 3ª pessoa).

### AUG A3 (nova arma)
- Modelo: `assets/weapons/aug/aug.fbx` (cópia de `assets/armas/aug A3/source/AUG_model.fbx`) + `aug/color.jpg` (BaseColor 4096 → 2048). Config em `WEAPON_MODELS.aug` (bullpup: len .79, grip .39, gripDown .1, mão esquerda na empunhadura da frente hand2 .23 / hand2Down −.01, vidro = OpticLense, mira pela arma: sight y .165 z −.012, back .3).
- Regras: `WEAPONS.aug` = cópia da VX-47 (id 'aug', 'AUG A3'); ORDER com 'aug' no fim (tecla 7 sem mochila); mochila: Principal inclui AUG. Ícone próprio, tranco e clarão iguais aos da VX.
- Som: `aug.mp3` / `reload_aug.mp3` em assets/sounds são usados se existirem; senão o tiro do fuzil um pouco mais agudo e a recarga do fuzil (ALIAS). Não há som próprio da AUG nas pastas do usuário.
- Ajustes na mão: AUG tem ajuste PRÓPRIO no grips.json (cópia da VX feita em 27/10, sem a mão esquerda; izzy, bot e câmera da arma). Independente da VX. `GRIP_BASE` só serve de ponto de partida no Lab para arma nova sem ajuste.
- Salvar no Lab agora não apaga arma que está no arquivo mas não no rascunho (outra aba / adicionada pelo Claude): `saveGrips` junta essas armas antes de gravar.

### 1ª pessoa sem cena "correndo"
- A cena "andando" da 1ª pessoa vale para parado, andando e correndo em todas as armas (inclusive faca). `fpSceneOf` nunca devolve mais `fp_run`; SCENES.fpGun/fpKnife sem `fp_run`; FirstPersonView corre com `walk_f` + pose de mira, só mais rápido (timeScale até 1.9). Os dados antigos de `fp_run` no grips.json ficam guardados, mas não são usados.

## 1ª pessoa no jogo igual ao Lab (27/10, noite)
- Causa da arma "diferente" no jogo: o jogo puxava SEMPRE a mão esquerda para um ponto padrão (IK) e o braço ficava esticado; no Lab as pegadas foram ajustadas com "Ver a mão esquerda segurando" DESLIGADO (mão da própria animação).
- Agora (`fpUsesIK` em WeaponModels.js): na 1ª pessoa a mão só é puxada quando a arma tem giro de mão salvo (AUG). Lab e jogo usam a mesma regra.
- Giro da mão (AUG): a referência só é tirada com a mão já presa (IK inteiro), senão ficava torta no início da partida.
- Tentei deixar o horizonte reto (inclinar 0°) na VX, Sniper e SPAS mantendo a arma no lugar: a câmera desceu ~10 cm, a arma ficou grande e o braço esquerdo apareceu. DESFEITO — voltaram as câmeras que o usuário salvou. Não é preciso nivelar: os braços são uma camada própria e o mapa é sempre desenhado com câmera reta, então o horizonte do jogo nunca fica torto.
- AUG: a referência do giro da mão agora é UMA por arma (antes uma por cena): ao atirar e depois de recarregar a mão volta exatamente à pegada do Lab (medido: 0° de diferença).
- Sons novos: sniper (L115A1), recarga da AUG (BF4), tiro da AUG (i3Pack, tiro A cortado); originais em `Sounds/AUG-A3 (do i3Pack)/`.
- Opção "tela cheia" (Controles): trava Ctrl+W/Ctrl+D para não fechar a aba ao agachar andando.
- Comparação conferida em imagens lado a lado (Lab × jogo, 16:9, mesmo instante): VX, AUG, Vector, Sniper e SPAS iguais.

## 1ª pessoa: troca de arma, faca, AUG, sons (27/10, noite)
- **Bug de fundo corrigido:** o mixer do three.js só regrava um osso quando o valor da animação muda; com a pose congelada (parado), o que o código mexia depois (IK da mão esquerda, giro da mão) grudava e acumulava. Ex.: trocar para a faca deixava o braço esquerdo na pose do fuzil até dar um golpe. `forceMixerWrite(mixer)` (CharacterAnimator.js) antes de cada `mixer.update` — no jogo (1ª e 3ª pessoa) e no Lab.
- **Troca de arma (1ª pessoa):** o conjunto inteiro (braços + arma, rígido) sobe para trás por cima do ombro e a nova volta pelo mesmo caminho (`SWING` em FirstPersonView.js; feito girando a câmera dos braços ao contrário, em volta da arma). Durante a troca só antebraço/mão aparecem (`ArmsOnly.upper`). Tempos em `SWITCH` (WeaponSystem.js: guardar .26 s, sacar .34 s, faca .26 s). `hud().switchK/switchIn`.
- **Faca 1ª pessoa:** parado/pulo = quadro inicial da cena "andando" + respiração; andando/correndo = a cena tocando. Golpe: os dedos da mão direita ficam com a pegada (o clipe de golpe fechava o punho atravessando o cabo).
- **AUG:** cenas atirando/recarregando = cópia da "andando" do usuário (câmera + pegada); tranco leve; luneta centralizada (`sight.x -.0079`) e maior (`back .16`); interior do tubo não é desenhado na mira (`scopeCut` + `setScopeCut`, corte em cone só entre .125 e .8 m da câmera).
- **Ferramenta de sons:** `sons.html` (botão 🔊 Sons no Lab). Lista os sons da pasta `Sounds/`, toca, escolhe destino, aplica no jogo (servidor copia para `assets/sounds/<destino>.mp3`, guarda o anterior em `assets/sounds/_backup`, desfazer). Escolhas em `assets/config/sons_destino.json`. Destinos "locutor_*" ainda não são tocados pelo jogo.
- Pacote `Pack_Som_By_bison` (Point Blank, 32 vozes do locutor): nomes decodificados do .i3Pack (bits girados 2), em `Sounds/Pack_Som_By_bison/sons/`.
- Lab: a linha verde é o horizonte do jogo (mapa sempre reto); os ângulos da câmera da arma só mudam como a arma aparece.

## 28/10 — modo testador, facas novas
- **Teste automático da 1ª pessoa:** `tools/fpcheck.js` (troca, parado, andar frente/lado, correr, atirar/golpe, recarregar, mirar, troca de volta; acusa pulos de um quadro e se não volta à pose). Roda no console do jogo, com `?autotest=armas` na URL (grava `tools/ultimo_teste.json` pelo servidor) ou invisível com `tools/autotest.ps1` (Edge headless). `?autoshot=arma` grava fotos.
- **Corrigidos pelo teste:** saída da mira zerava num quadro (adsK agora segue p.aim); arma escorregava no começo da partida (giro do corpo resolvido de uma vez); cenas atirando/recarregando com pegada diferente (VX, Vector, Sniper, SPAS → cópia da "andando"; backup em assets/config/grips.antes_teste_2710.json).
- **Golpe de faca:** corte em arco no FP (SLASH em FirstPersonView.js) e dano varrendo o arco (MELEE em WeaponSystem.js; 40 por alvo, uma vez por golpe, até 2,3 m).
- **Faca nova M9 Bayonet** (`assets/weapons/m9`, OBJ + cor/relevo/metal-aspereza; reflexo de ambiente só nesses materiais — `ensureWeaponEnv`). Faca antiga comentada em WEAPON_MODELS.
- **Karambit** (arma branca 2, escolhida na Mochila): `assets/weapons/karambit`, pegada invertida (`reverse`), mesma 1ª pessoa/golpe da faca. Pegada inicial: fp_walk r [0,-90,30], curl .8.
- **Lab: "Fechar a mão"** (0..1) por cena: dobra os dedos da mão direita (eixo X dos ossos dos dedos), salvo como `curl` na cena.
- Pendentes: P-19 correndo com tremida (cena da pistola tocando rápido); P-19 sem ajuste de 1ª pessoa no Lab; locutor (sons) ainda não ligado.
- **Locutor ligado (28/10):** `src/audio/Announcer.js` (EVENTS: início, abate, duplo, triplo, massacre ≥4, headshot, headshot2, granada, vitória, derrota). ProceduralAudio carrega todo destino aplicado de `assets/config/sons_destino.json` (inclusive nomes livres de "Outro"). KillFeed chama `announcer.kill(e)` nos abates do jogador; `Game.start` chama `say('inicio')`. Granada: som guardado, jogo ainda sem granada.
- **Mão "humana" (28/10):** "Fechar a mão" agora alinha cada falange com a anterior e dobra para o lado da palma (detectado pela própria animação) — sem dedo torto. FIST em WeaponModels.js. "Punho ↕ ↔ ⟲" gira a mão direita (wrist [x,y,z]).
- **Mão esquerda livre (faca/karambit):** Lab → "Mão esquerda livre": mostra o braço esquerdo e põe a mão num ponto fixo do corpo (frente/altura/lado em cm + giro), salvo em `fp_walk.lhFree`. Jogo: `HeldWeapon.leftHandFree` (IK de 2 ossos + giro absoluto). Padrão salvo: f 40, h 120, s 20, rz 60.

## 28/10 — golpe novo das facas, polegar, braço da karambit na M9
- **Golpe (todas as facas, atuais e futuras — `melee: true`)**: novo `src/player/KnifeSlash.js`. Parte da pose parada salva (cena "andando"),
  sem trocar de animação: o ombro faz o arco (direita/cima → esquerda/baixo), o cotovelo estica na própria dobradiça, punho não torce.
  Braço esquerdo recua para trás/baixo e sai da tela (`leftDuringSlash`), volta no fim. Golpe novo antes do fim emenda de onde o braço está (`slashValues(p, from)`).
  Jogo: `FirstPersonView` aplica depois do `_placeCam` e antes do `held.update` (o `_slashCam` antigo não é mais usado).
  Lab: cena "1ª pessoa · golpe (usa a pose de "andando")" (`still + slash`), mexer nela grava em fp_walk (`dataScene()`); a barra de tempo percorre o golpe.
  Teste: um golpe = no máximo ~9,5°/7 cm por quadro a 60 fps, termina parado na pose; golpes seguidos sem pulo. Um travamento de 0,1 s do navegador no 1º golpe da partida aparece como "pulo" no fpcheck (não é a animação).
- **Polegar** (`_curl` em WeaponModels.js): fecha por último, mirando o meio do indicador/médio já dobrados, por cima dos dedos.
- **M9**: recebeu o braço direito da karambit (punho [16,-73,-2], fechar a mão 1, câmera, mão esquerda livre); a posição da faca na mão (p/r) continua a da M9. Nome no jogo: **BAIONETA M9**.

## 28/10 (tarde) — TREINO no stand de tiro + recarga animada da Vector
- **Mapa do treino**: `assets/maps/shooting_range/shooting_range.fbx` + `tex/` (o .rar original e a cópia extraída ficam em `_fonte/`).
  `Assets.loadRange()` carrega na 1ª vez que o treino abre (o FBX vem SEM normais: são calculadas, senão fica tudo preto; vidro das baias semitransparente; luminárias acesas).
  `Game._buildRange()`: luz de dentro da sala (hemisférica + ambiente + direcional com sombra embaixo do teto + contra-luz). Fora do treino o WAREHOUSE continua igual.
- **Colisão**: `src/world/RangeData.js` (735 caixas), gerada no navegador: voxelização 0,1 m de todas as malhas menos piso (vira laje), portinhas das baias
  (dá para entrar em qualquer baia), placas e portas do fundo (o vão é fechado por uma caixa); 5 últimas = laje + limites. `buildRangeData()` em MapData.js.
  Testado andando: balcão para em z -4,35; divisórias da baia; prateleira do fundo; portas; paredes laterais x ±7,95; o pulo (0,5 m) não passa o balcão (1,2 m).
- **Treino** (`src/modes/RangeTraining.js`): nasce na baia 5 olhando para os alvos. Botão = controle no balcão da baia 5 (anel laranja + "E").
  Perto (1,7 m) aparece "E Menu do treino"; E abre o menu (o jogo para sem mostrar a pausa); E/Esc/botão fecham.
  Bots: PARADO (x -0,85, z 6,3, na frente do alvo) e ANDANDO (z 3,2, de x -6,8 a 6,8, só de lado, desacelera nas pontas). Vida infinita
  (o dano conta e aparece perto da mira: "-31 CORPO · total"), piscam vermelho, não atiram. Começa só com o parado ligado.
  Armas: todas pelo menu (`WeaponSystem.give(id)` põe na vaga 1/2/3 e saca). Munição: `infiniteAmmo` (pente esvazia e recarrega, reserva nunca baixa; HUD "∞").
  Testado: 6 armas de fogo acertam e recarregam; faca/karambit não alcançam os bots (estão do outro lado do balcão).
- **Vector**: na 1ª pessoa recarrega com a animação do Lab (`FP_RELOAD_ANIM` em FirstPersonView.js; as outras armas seguem com a recarga simples).
  Igual ao Lab, por volta de 60% da recarga o antebraço passa na frente da câmera.
- **Envio para o PC**: `device_commit_files` reaproveitava a cópia antiga quando o caminho enviado se repetia — agora cada envio usa uma pasta nova (`/home/claude/work/bin/stage.sh`).

## 28/10 (noite) — Mochila/Inventário estilo Point Blank + fundo do galpão
- `src/ui/Inventory.js` + `src/styles/inventory.css`: tela cheia. Barra de cima (SHADOW OPS · SALA · INVENTÁRIO · ✕), à esquerda o personagem em 3D
  (CharacterPreview) + STATUS (Dano, Precisão, Disparo, Velocidade: equipada x selecionada, verde/vermelho), à direita abas Arma/Personagem,
  categorias (Ver tudo, Principal, Secundária, Arma branca), pesquisa, vitrine com FOTOS e embaixo os números da arma (Dano, Vel. de disparo, Precisão,
  Munição, Recuo V/H, Peso, Alcance) + botão EQUIPAR. Clicar na arma só seleciona (o personagem mostra); vale para a partida só com EQUIPAR.
  Abre pela sala (aba Mochila / ABRIR MOCHILA) e pelo menu principal (botão Mochila). Esc ou ✕ fecham.
- Fotos: `assets/ui/weapons/<id>.png` (8 armas) e `assets/ui/chars/<skin>.png`, tiradas dos modelos 3D do jogo (renderizador do jogo, câmera de lado,
  fundo transparente). Arma nova: tirar a foto do mesmo jeito (ver conversa de 28/10) e salvar com o id dela.
- Fundo: `assets/ui/bg_galpao.jpg` (imagem do usuário) na mochila e na sala de espera; a área do personagem é transparente (as luzes do galpão aparecem atrás).
- Sala: lista "equipado" com fotos; a antiga mochila em cartões foi removida (Lobby.js `openBag/afterBag/logEquip`).
- **Correção 28/10 20:25 — menu do treino não aceitava cliques**: o `#rangeMenu` estava dentro do `#hud`, que tem `pointer-events:none`
  (o clique atravessava para o jogo). Agora fica fora do HUD (index.html) com `pointer-events:auto`. Clicar numa arma já fecha o menu e volta ao
  treino sacando ela. Testado com clique real do mouse (antes os testes clicavam por código, que não passa por essa regra).
- **28/10 20:40**: sniper também recarrega com a animação do Lab na 1ª pessoa (`FP_RELOAD_ANIM = smg, sniper`; testado: máx 3,3°/quadro, volta exata).
  Facas (karambit, M9): guardar/sacar não usa mais o giro das armas (jogava a mão esquerda no meio da tela e entortava a pose) — agora a pose salva
  só desce e sobe (`KNIFE_SWAP`, `_knifeSwap`). Conferido: a karambit no jogo bate com o Lab (< 1 cm) parada, andando, correndo, pulo, golpe e vindo da sniper/fuzil.
- **28/10 20:45 — karambit diferente do Lab (mão ESQUERDA)**: o giro da "mão esquerda livre" usa uma referência tirada da pose da animação
  na primeira vez; no jogo ela era tirada logo ao sacar a faca, com a mão ainda na pose da arma anterior (sniper etc.) → mão virada (palma para cima).
  Agora `leftHandFree(F, pole, capture)` só tira a referência com a faca parada na pose (FirstPersonView: `knifeT > .4`, sem golpe). Conferido:
  mão esquerda no jogo = Lab (mesmo giro, < 1 cm), vindo da sniper e do fuzil.
- **28/10 20:55 — troca de arma rápida (estilo Point Blank), TODAS as armas**: sem o giro até o ombro (o antebraço passava na tela);
  a pose do Lab desce para fora da tela e a nova sobe (`KNIFE_SWAP {down .8, pitch 14}`, `_knifeSwap` para todas). Com o conjunto fora da tela
  (switchK > .6) braços e arma ficam escondidos. Tempo: `SWITCH {out .12, in .2, inMelee .16}` (antes .26/.34/.26) → troca inteira ≈ 0,3 s.
  Testado: fuzil→karambit→sniper→fuzil, nenhum braço aparece e a arma volta exatamente à pose.
- **28/10 21:00 — AUG torta no treino (culpa da troca rápida)**: com a arma fora da tela a arma parava de ser atualizada, mas a mão esquerda
  continuava "segurando" e a referência do giro da mão (tirada uma vez por arma) saía errada para sempre — no treino, porque lá a AUG chega pelo menu (troca).
  Correção: sem IK da mão com a arma fora da tela, e a referência só é tirada com a arma parada na pose (`leftHandIK(..., capture)`, `gunT > .35`).
  Conferido: pegada da AUG igual na partida normal, no treino pelo menu, depois de trocar e depois de recarregar (0,1°, 0 cm). Os ajustes do Lab (grips.json) não foram mexidos.
- AUG recarrega com a animação do Lab (`FP_RELOAD_ANIM = smg, sniper, aug`): máx 4°/quadro, volta exata à pegada (arma e mão esquerda).
- **28/10 21:10 — recarga animada em TODAS as armas de fogo** (VX-47, AUG, Vector, sniper, SPAS-12, P-19): `FP_RELOAD_ANIM.has(id)` = toda arma
  que não é faca (a recarga "dura" — abaixa e tomba — não é mais usada). SPAS-12: a animação dura a recarga inteira (`reloadTotal`, todos os cartuchos).
  Testado nas 6: anima, máx 3,5–7,6°/quadro (sem salto), volta exata à pose (0°, 0 cm). Troca rápida conferida nas 6: 0,28–0,34 s, nada visível fora da tela, volta exata.
- **Tiro andando** (todas menos a sniper): `moveSpread` bem menor — andando VX-47/AUG 2,0°→0,47°, Vector 1,3°→0,43°, P-19 1,9°→0,52°,
  SPAS 2,5°→2,2°; correndo ~0,6°. Bots mantêm o valor antigo (`botMoveSpread`), a dificuldade deles não mudou. Conferido no jogo andando: 0,47° (VX-47).
- **28/10 21:20 — AUG: mão esquerda "pegando na frente da arma" no fim da recarga**: a animação de recarga termina com a mão na frente da arma
  e só depois o IK levava a mão para a empunhadura (~11 cm de vaivém). Agora, a partir de 72% da recarga (`RELOAD_GRIP_AT`), o IK já leva a mão
  para a pegada salva (vale para toda arma com mão esquerda presa por IK). Medido: de 91% em diante a mão está na pegada (0 cm) e termina exata (0 cm, 0°).

## 28/10 (noite) — ONLINE com amigos (grátis) + publicação no GitHub Pages
- **Rede** (`src/net/Net.js`): PeerJS 1.5.4 (CDN) + servidor público grátis do PeerJS só para os navegadores se encontrarem; a partida
  vai direto entre os navegadores (WebRTC). ID por navegador `SO-XXXX-XXXX` (localStorage, por site); amigos salvos no navegador; ver quem
  está online (hello/ack), convite, sala (o anfitrião recebe as conexões e repassa as mensagens). `?perfil=2` = outro jogador no mesmo navegador (teste).
- **Tela Online** (`src/ui/OnlinePanel.js`, `src/styles/online.css`): seu nome + ID (copiar), amigos (adicionar por ID, online/offline,
  Convidar/Entrar/remover), sala (jogadores, INICIAR, sair/fechar), aviso de convite em qualquer tela (`#onToast`). Card "Online" no menu.
- **Partida online** (`src/net/OnlineMatch.js`): mata-mata entre jogadores (sem bots ainda), mapa WAREHOUSE. 20 estados/s por jogador
  (posição, olhar, animação, arma); outros jogadores = RemotePlayer (modelo + animações + arma + nome em cima, movimento suavizado).
  Acerto decidido por quem atira → manda "hit"; quem leva tira a vida, se morrer avisa "death" (feed + placar), renasce longe dos outros.
  Online roda mesmo com Esc. Pausa: sem "Reiniciar"; "Voltar à sala"/"Sair" do anfitrião encerra a partida para todos.
  Testado com 2 abas: adicionar amigo, convite, entrar, iniciar, posição sincronizada, tiro de sniper (115) matou, placar/feed dos dois, renascer, encerrar.
- **Publicar** (`4 - PUBLICAR NO GITHUB.bat` → `tools/publicar.ps1`): monta `..\site-github` só com o que o jogo usa (124 MB, 241 arquivos;
  fora: assets\armas, _fonte, source, Sounds, tools, _to_delete, extras, zip/rar, .bat) e envia pelo Git. Conferido servindo a cópia: carrega tudo, sem 404.
  No GitHub Pages o Lab/Sons não salvam (não há o server.py) — ajustar no PC e publicar de novo.

## 03/11 12:17 — Pistola: kit novo 9 mm (Sketchfab "Pistol Animations (BLENDER)", LokitoBlu / arma @TORI106)
- .blend convertido no Blender para `assets/weapons/pistol_anim/pistol_anim.glb` + texturas JPG ao lado.
- PistolViewmodel agora tem KITS (`mm9` padrão, `glock` antigo). mm9: sacar (Draw) ao trocar para a pistola, tiro, recarga rápida/completa, andar/correr; boca do cano achada na malha; luz presa à câmera + reflexo (RoomEnvironment).
- grips.json → vm.pistol.kit escolhe o kit; Lab tem a caixa "Kit de braços + arma". Campo de visão padrão do mm9 = 50°.
- Testado no treino a 1600×900 (troca, sacar, parado, tiro, as duas recargas) e publicado.
- Pendente: 3ª pessoa e ícone ainda são a Glock; braços OGA não usados (não têm animação).

## 03/11 — Braço único (Izzy) + AK-74M
- `_fonte/izzy_arms/build.py` (Blender, sem janela): recorta os braços da Izzy, dobra para a pose do esqueleto dos kits do LokitoBlu, escala pela mão, muda o tamanho do braço/antebraço do esqueleto para o da Izzy (o IK do kit mantém a mão na arma), troca os pesos (Mixamo → kit, antebraço nos ossos de torção) e exporta GLB com todas as animações.
- Saídas: `assets/weapons/pistol_anim/pistol_izzy.glb` (kit `izzy9`, padrão da pistola) e `assets/weapons/ak_anim/ak_izzy.glb` (kit `ak`).
- AK-74M nova arma (`ak`, principal): Weapons.js, Loadout, ícone, foto `assets/ui/weapons/ak.png`, 3ª pessoa `ak_anim/ak_world.glb` (`world.py`), som = fuzil mais grave, bots. Sem mirar pela arma (kit sem animação de mira).
- FirstPersonView agora tem um viewmodel por arma (`setVM(wid, rig, kit)`).
- Créditos em CREDITOS.md (CC BY 4.0).
- Falta: animações próprias para VX-47, AUG, Vector, sniper, escopeta, faca, karambit e granada no mesmo braço.

## 03/11 — Sistema de braços por personagem (qualquer operador) + Agente Mascarado
- Guia completo: `_fonte/bracos/COMO_FAZER.md`. Lista: `_fonte/bracos/bracos.json`. Gerar: `5 - GERAR BRACOS DOS PERSONAGENS.bat`.
- Agente Mascarado: esqueleto assimétrico (escala média das mãos), dedos sem osso presos no dedo do kit mais perto, braço de cima cortado perto do ombro.
- Jogo: kits pré-carregados ao abrir; arma escondida enquanto o kit carrega; correr da pistola = andar rápido (sem mão gigante).
- Testado (fotos): Agente Mascarado e Izzy, pistola e AK — parado, rajada, tiros seguidos, recargas, sacar, andar, correr; faca no sistema antigo.

## 03/11 (tarde) — 7 pacotes novos de armas com animação (adaptador universal de braços)
- L11 (sniper, novo pacote), faca nova (Baioneta, Karambit e FACA TÁTICA nova usam as animações; a faca do jogo é trocada na mão), M4A1-S (nova),
  MAGNUM (nova secundária; o revólver antigo já não estava no jogo), SNIPER SD (nova), SHORTY (substitui a SPAS-12), SST-30 (SMG nova).
- Braços da Izzy em todas pelo adaptador universal (`_fonte/bracos/assar_kit.py`, ver COMO_FAZER.md). Armas novas sem mirar pela arma.
- Fotos do inventário novas (sniper/shotgun antigas guardadas como `_antiga.png`). 3ª pessoa com o modelo parado de cada pacote.
- Correções: Magnum usa pose de pistola na 3ª pessoa e vaga de secundária no treino (antes só a Glock); faca com troca de modelo travava
  (`this.assets` faltando no FirstPersonView); clipe faltando não quebra mais a arma.
- Testado com fotos (1600×900): todas as armas novas parado/tiro ou golpe/recarga/andando; Glock e AK sem mudança; 3ª pessoa atirando.
- Créditos dos 7 pacotes: A CONFIRMAR (CREDITOS.md).

## 03/11 (noite) — Volumes separados
- Configurações > Áudio e vídeo: Volume geral + Música + Ambiente (passos, pulo, dano, abates, locutor, menu) + Armas (tiros, recargas, faca, granada).
- `ProceduralAudio`: canais 'armas' e 'ambiente' (`categoria(nome)`, `setCategoria`); Music e MenuFx multiplicam pelo volume da categoria. Salvo no navegador.

## 12/11 — Mapa CELEIRO (segundo mapa jogável)
- Veio do projeto standalone "mapa vagão" (`Desktop\mapa vagao`). No jogo o nome é **CELEIRO** (nunca "vagão"/"galpão" na interface).
- `src/world/CeleiroMap.js`: construtor do visual (galpão de madeira, containers, vagões, toras, caixotes, paletes, torres, muro com grade,
  cerca, rampas, piso). Usa 6 GLBs e 13 conjuntos de texturas de `assets/maps/celeiro/`; devolve `group`, `colliders` e `ready`.
- `src/world/CeleiroData.js`: 376 caixas de colisão geradas por `tools/gen-celeiro-data.mjs` (371 do mapa + base do piso + 4 paredes de limite).
  Bounds x −25,83…24,95 e z −44,17…42,1. Rode o gerador sempre que mudar `CeleiroMap.js`.
- `src/world/MapData.js`: agora tem `MAPS` e `buildMapData(id)`. CELEIRO usa `visual: 'celeiro'` (sem GLB único) e tem 5 spawns de ataque
  (sul, z ≈ +32), 5 de defesa (norte, z ≈ −34), 12 de mata-mata, sites A (5,92; −13,92) e B (−3,08; 13,58) de 6×4 m e zonas de base.
  Todos os pontos foram conferidos por `tools/check-celeiro-spawns.mjs` (andável, alcançável a partir do centro e folga ≥ 2 m).
- `src/core/Game.js`: `getCeleiro()` monta o mapa uma vez e reaproveita entre partidas (grupo com `userData.asset`, preservado no `stop()`);
  céu, neblina e câmera de sombra são ajustados para o tamanho do CELEIRO.
- `src/ui/Lobby.js`: novo campo **Mapa** (WAREHOUSE / CELEIRO) nos dois modos; trocar o mapa refaz os dados, o minimapa e o nome na sala.
- Testado no navegador: partida competitiva no CELEIRO sem erros no console, mapa/minimapa/sites corretos, bots e spawns funcionando.
- Créditos dos modelos e texturas: `assets/maps/celeiro/CREDITOS.md` (6 modelos CC-BY 4.0 + texturas CC0).

## 13/11 — Menu iniciar com cenário 3D
- Menu novo (estilo PUBG): `src/ui/FrontMenu.js` + `src/styles/front.css` + `src/ui/Boot.js` (tela de carregamento).
- Personagem parado de frente na animação idle, sem girar e sem arrastar com o mouse (`CharacterPreview` com `{ yaw: 0, spin: 0, fixed: true }`).
- Cenário 3D `src/ui/MenuScene.js` (ativado por `set: 'galpao'` no `CharacterPreview`): canto de galpão à noite com chão de concreto
  (o personagem pisa e faz sombra), parede, pilares, vigas, porta de enrolar, canos, placas SAÍDA/ÁREA RESTRITA, faixa amarela, manchas de óleo,
  contêiner, caixas, barris e pallet (GLBs e texturas do CELEIRO). O canvas ocupa a tela inteira atrás da interface.
- Removidos do menu: dicas, controles, cartão do modo e cartão "Equipado". O `MenuFx` não desenha mais feixe de luz, faíscas nem poeira no menu novo
  (continua só o som ao passar o mouse).

## 13/11 — CUSTOMIZAR no lugar da Mochila
- Aba **Customizar** no menu iniciar (antes "Mochila"): janela de vidro fosco à esquerda (`.fc-panel` em `front.css`), o personagem 3D não sai do lugar.
  Por enquanto só troca de personagem (`SKINS` em `Loadout.js`, agora com `role` e `rarity`). Clicar prova no modelo 3D; SALVAR grava;
  RESTAURAR volta ao salvo; fechar (✕, Esc ou aba Jogar) sem salvar desfaz a prova. Ao salvar chama `hooks.onSkin` → `pushMe()` (sala online).
- Armas não são mais escolhidas no menu nem na sala: só dentro da partida (por enquanto vale o padrão do `Loadout.js`: rifle, pistola, faca).
- Mochila antiga removida: `Inventory.js` e `inventory.css` foram para `_to_delete/` (o usuário apaga). A sala (`Lobby.js`) perdeu a aba Mochila,
  o botão Mochila e o bloco "Equipado para a partida". `weaponPhoto`/`charPhoto` agora ficam em `src/ui/WeaponPhoto.js`.

## 13/11 — Tudo pelo menu iniciar (sem sala no offline)
- Competitivo e Mata-mata não abrem mais a sala: no menu iniciar escolhe-se o modo e o **Mapa** (WAREHOUSE / CELEIRO, botões em cima do JOGAR)
  e o JOGAR entra direto na partida. Usa `Lobby.quickStart(mode, mapId, name)`: monta os times com bots e as opções padrão
  (dificuldade normal; competitivo 1:40 por rodada; mata-mata 30 abates) sem mostrar a tela da sala.
- O modo e o mapa escolhidos ficam salvos no navegador (`shadowops.menu`).
- Fim/pausa da partida offline volta para o menu iniciar; o botão "Voltar à sala" só aparece no online. Treino e Online continuam como antes
  (o Online ainda usa a sala, para convidar amigos).
- Customizar: ajustes da revisão de interface (janela do tamanho do conteúdo e sem cobrir o personagem em telas médias, setas do teclado
  trocam o personagem, foco não se perde, Esc não fecha junto com Patentes/Configurações, SALVAR desativado com cara de desativado,
  som de passar o mouse também nos personagens).

## 13/11 — Aba CUSTOM (no lugar do Online) e Patentes removidas
- **Patentes** saiu do jogo: aba do menu, botão da sala e o selo/XP no canto (agora mostra só nome e o ID do jogador). O código de XP
  (`Ranks.js`) continua no projeto, mas sem tela.
- Modo **CUSTOM** na faixa de modos (antes ONLINE). Janela de vidro `src/ui/CustomRoom.js` + estilos `.cr-*` em `front.css`, com 3 abas:
  PARTIDA (modo Competitivo/Mata-mata/Treino, mapa, bots −/+, dificuldade, tempo da rodada ou limite de abates),
  SALA (máximo de pessoas 2–8, fechar a sala, senha, encerrar sala) e AMIGOS (seu ID, adicionar por ID, convidar/entrar, quem está na sala, remover).
  A configuração fica salva (`shadowops.custom`) e o anfitrião manda para os amigos (`net.setRoomCfg`).
- `Net.js`: sala com `cfg` (mode, map, bots, diff, max, locked, pass) sincronizada; senha guardada só no anfitrião (`_roomPass`);
  convidados entram sem senha; recusa "A sala está fechada." / "Sala cheia (N)." / "Esta sala tem senha." / "Senha errada.";
  `startMatch` leva o mapa para os amigos.
- Sozinho na sala: partida no PC com a quantidade de bots escolhida (`Lobby.quickStart(..., { bots, diff, round, kills })`).
  Com amigos: partida online (por enquanto só Mata-mata e sem bots — o motor online ainda não sincroniza bots nem o competitivo).
- Testado no navegador com dois jogadores (`?perfil=2`): senha errada/sem senha recusadas, senha certa entra, partida online no CELEIRO
  para os dois e volta dos dois para a aba CUSTOM. Competitivo offline com 1 bot no difícil também testado.

## 13/11 — Claude Code Game Studios (skills e agentes) instalado no projeto
- Fonte: github.com/Donchitos/Claude-Code-Game-Studios (licença MIT, cópia em `.claude/LICENSE-ccgs.txt`), framework v1.3.0.
- Instalado: `.claude/agents` (34 agentes; os de Godot/Unity/Unreal foram para `_to_delete/ccgs-agents-outras-engines`), `.claude/skills` (78),
  `.claude/docs`, `rules`, `scripts`, `engines`, `genres`, `hooks` (arquivos copiados, mas NÃO ligados), `docs/` (guias + referência web) e `project.yaml`
  (engine Web, código em `src`).
- De propósito NÃO instalado: `settings.json` (ligaria os 18 hooks automáticos, a barra de status e o modo "pergunta antes de tudo"),
  `statusline.sh` e o `CLAUDE.md` deles. Se quiser ligar depois, copiar da origem e revisar os hooks antes
  (`update-check.sh` acessa a internet; `notify.sh` abre notificações do Windows).
- Para começar: numa conversa nova nesta pasta, `/project-stage-detect` (analisa o jogo existente) ou `/adopt`; depois `/next-step`.

## 13/11 — Grupo de 5, tela de amigos e sino de notificações
- **Grupo** (canto de baixo à direita, `src/ui/PartyBar.js`): ícone de amigos (com quantos estão online) + 5 vagas (você + 4).
  Vaga vazia (+) ou o ícone abrem a tela de amigos (vidro): seu ID, adicionar por ID, grupo (tirar/sair), amigos (Convidar / Entrar / remover),
  senha quando a sala tem. O grupo é a sala online do `Net.js` (a mesma da aba CUSTOM); ao ficar online o jogo já abre a sala.
- Amigos do grupo aparecem **em 3D ao lado do seu personagem** com o nome em cima (`CharacterPreview.setSquad`, vagas em `SQUAD_SPOTS`).
- **Sino** (canto de cima à direita, `src/ui/NotifyCenter.js`): pedido de amizade (`net` emite `newFriend` quando alguém te adiciona),
  convites com ACEITAR / RECUSAR, amigo entrou/saiu do grupo, fim de partida e versão nova. Bolinha de não lidas; guarda 30 no navegador.
- **Engrenagem** no lugar da aba Configurações.
- Testado com dois jogadores (`?perfil=2`): convite chegou no sino → Aceitar → entrou no grupo → vaga preenchida, aviso no sino do anfitrião
  e o amigo em 3D no menu.
- Revisão do agente **ux-designer** (Game Studios) aplicada: aceitar convite avisa se desfaz o grupo atual e só marca "Aceito" se entrou;
  sem avisos falsos de "entrou no grupo" ao entrar no grupo de outro; foco do teclado não se perde; vagas com nome embaixo ("VOCÊ"/amigo);
  vagas travadas para quem não é dono; um painel da direita por vez; sino com fundo opaco e abaixo da barra; convite expira em 10 min;
  nome dos amigos em 3D sempre visível.
- Pendente pequeno: num teste com convite real o item ficou sem o rótulo "Aceito" (a entrada no grupo funcionou); nos testes diretos o rótulo aparece.

## 13/11 — Customizar completo (como o Customize do PUBG)
- Janela grande de vidro à esquerda (`src/ui/Wardrobe.js`, estilos `.wr-*` em `front.css`), personagem 3D no lugar mostrando as provas.
  Abas em cima: **PERSONAGEM** (skins do operador) · **ARMAS** (categoria à esquerda → arma → grade de skins) · **PERFIL** (nome de jogador
  e avatar, com cartão de prévia) · **CARREIRA** (KDA, abates, mortes, assistências, partidas, vitórias, headshots, dano, tempo, por modo e últimas 10).
  Em todas: clicar prova, SALVAR grava, RESTAURAR volta, ALEATÓRIO sorteia; fechar sem salvar desfaz. Setas do teclado andam pela grade.
- **Skins de arma** (agente technical-artist): `src/weapons/WeaponSkins.js` — 9 acabamentos procedurais (Padrão, Camuflagem Urbana, Deserto,
  Floresta, Ártico, Fibra de Carbono, Cromo Escuro, Tigre Neon, Ouro), salvos por arma (`shadowops.wskins`). Valem no menu, em 3ª e 1ª pessoa
  (só o jogador local; bots/online no padrão). `HeldWeapon` ganhou `{ skins: true }` e `applySkin(id)`. Menu tem reflexo suave (mapa de ambiente
  desenhado) para os metais.
- **Estatísticas** (agente gameplay-programmer): `src/core/Stats.js` + gravação em `Game.stop()` (uma vez por partida; treino não conta).
  Abates/mortes do placar; dano e headshots do jogador; assistências só contra bots. Vitória fica "—" até existir fim de partida (Partes 5/6).
- **Avatares** (`src/ui/Avatars.js`): 12 emblemas em SVG; aparecem no canto de cima (clicar abre o Perfil), nas vagas do grupo e para os amigos online
  (`Net.js` manda `avatar` junto dos dados públicos).
- Testado no navegador: trocar skin de arma (Ouro/Tigre na arma do personagem 3D), salvar nome+avatar (topo e grupo atualizam),
  partida de mata-mata registrada na Carreira. Os dados de teste foram apagados depois.

## 13/11 — Tela de carregamento nova e sem som ao passar o mouse
- Tela de carregamento com o design do usuário (minimalista: emblema, SHADOW-OPS, barra fina, etapa e %; build e SV no topo).
  A barra segue o carregamento real (Boot.js anima o número até o valor real; etapas automáticas por porcentagem; PRONTO com ponto verde).
  Sem Tailwind: CSS próprio em front.css; fontes Inter e JetBrains Mono.
- Removido o som ao passar o mouse nos botões do menu (MenuFx); fica só o som do clique.
- Marca nova no topo esquerdo do menu (arte do usuário): ícone de mira em losango (SVG) + SHADOW-OPS em Chakra Petch 700; substitui o logo.png.

## 13/11 — Mapa FAVELA e MODO FAVELA (Polícia contra Bandido)
- **O competitivo agora se chama MODO FAVELA.** Ao apertar JOGAR aparece a tela **Escolha o seu lado**: **Polícia** (time de ataque, azul) ou
  **Bandido** (time de defesa, vermelho); as teclas 1 e 2 também escolhem e Esc volta. Código: `src/ui/TeamPicker.js`, `src/styles/teampick.css`.
  Na sala os times aparecem como POLÍCIA / BANDIDO. As estatísticas continuam na mesma chave (`competitive`).
- **Mapa FAVELA** (primeiro da lista, também vale no mata-mata): trecho do mapa **FavelaRJ** feito na Unreal pelo usuário (outro projeto,
  `C:\Users\luiss\Downloads\FavelaRJ_UE`), da avenida do canal até o meio do morro: 143 × 230 m, com 15 a 40 m de desnível.
  A Polícia nasce na avenida e atravessa a **ponte da Estrada** (a única passagem sobre o rio dentro da arena); o Bandido nasce entre os sites.
  **Site A = praça**, **Site B = laje plana a oeste**. Rotas a pé: Polícia → A 123 m / → B 161 m; Bandido → A 88 m / → B 28 m.
  Em volta da arena aparece o mapa inteiro (morro, bairros de fora, mata, rodovias) como cenário; o limite são paredes invisíveis.
- **Visual** (`src/world/FavelaMap.js`, arquivos em `assets/maps/favela`, ~58 MB): malhas simplificadas da Unreal (43 → 6 milhões de triângulos,
  meshopt), texturas de 512 px, parede de bloco e reboco e terreno em 5 camadas pela cor do vértice (mesma lógica dos materiais da Unreal),
  árvores como cartão de longe e modelo cheio a menos de 120 m, casas de fora instanciadas. Carrega na **primeira partida no mapa**
  (barra "Carregando a favela", ~7 s no PC do dono) e fica guardado entre partidas. Na FAVELA: câmera até 3 km, névoa longe, sol de fim de tarde
  do noroeste com a caixa de sombra seguindo o jogador. No PC do dono: ~80 fps no chão (10,7 milhões de triângulos na tela).
- **Colisão** (`src/world/FavelaData.js`, 2,1 MB, GERADO, não editar): 117 mil caixas das casas, vias e valão (voxels de 0,25 × 0,15 m a partir das
  malhas de colisão da Unreal), terreno como grade de alturas de 0,5 m, piso de cada célula para os bots e 65 grades invisíveis na beira do rio.
  Para refazer: no projeto FavelaRJ_UE, `cd Web\tools` e `node shadowops-favela.mjs C:\Users\luiss\Downloads\SHADOW-OPS` (6 s);
  depois `node tools/check-favela-spawns.mjs` aqui (confere nascimentos, sites e a rota Polícia → Bandido; sugere pontos novos).
  Para trocar o visual: `npm run tudo` em `FavelaRJ_UE\Web\tools` e copiar `Web\public\{glb,tex,inst,mats.json,inst.json,fora.json}` para `assets/maps/favela`.
- **Motor:** `CollisionWorld` ganhou terreno (`setTerrain`, `groundAt`): anda ladeira acima (barranco de mais de ~58° bloqueia), gruda na descida,
  tiro e granada batem no chão (faísca de terra, tag `dirt`). `Navigation` ganhou o modo 2,5D. O nascimento do jogador, dos bots e do online usa a altura do ponto.
  O minimapa mede as caixas a partir do piso do lugar. WAREHOUSE e CELEIRO testados depois da mudança: iguais (sem terreno, tudo em y=0).
- Testado no navegador (13/11): menu → MODO FAVELA → Polícia → carrega → partida; jogador e bots no piso certo; os bots atravessam a ponte, sobem o morro
  e trocam tiro perto do Site A em ~25 s; o Bandido nasce no meio do morro. Falta olhar humano: ritmo da partida no mapa grande, bots em becos estreitos,
  escadarias internas das casas (os bots andam por ruas, escadarias e térreos; lajes e andares de cima ficam para o jogador).

## 13/11 — Atualização automática (app dos amigos e atalho do dono)
- App instalado pelo site (botão "Ícone na área de trabalho", PWA): o sw.js já busca HTML/JS/CSS sempre novos; agora o main.js também
  confere version.json ao abrir e a cada 5 min e, se houver versão nova e a pessoa não estiver em partida nem em grupo com amigos, recarrega sozinho
  (uma vez por versão, sem loop). Em partida/grupo: aviso no menu e no sino.
- Atalho JOGAR (PC do dono): antes de abrir, faz git pull --ff-only do GitHub (traz melhorias feitas por outra IA/PC; não mexe se houver mudanças locais).
