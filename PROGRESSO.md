# SHADOW OPS: progresso do projeto

Tiro tático em **terceira pessoa** no navegador (Three.js 0.160 via CDN, módulos ES, sem build).
Última atualização: 27/10/2026 (ajustes: FOV horizontal, arma presa na mão, ponto vermelho, sons gravados, faca de energia, rampas).

## Como rodar (Windows)
Na pasta `GAME 1V1`: clique em **`1 - INICIAR SERVIDOR.bat`** (deixe a janela aberta) e depois em **`2 - ABRIR JOGO NO NAVEGADOR.bat`**.
O servidor agora é `tools/server.py` (**sem cache**: o navegador sempre pega a versão nova; antes o navegador podia mostrar código antigo).
Manual: na pasta que tem o `index.html`, `py tools/server.py 8000` e abrir `http://localhost:8000`.
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
- **Bots** com o modelo de máscara (`assets/characters/bot.fbx`), arma na mão, animações e a mesma correção de mira.
- HUD: troca de arma estilo inventário (atual em destaque, anterior e faca visíveis, resto some em degradê), feed de abates com ícones,
  selo central de abate (ABATE / TIRO NA CABEÇA / FACADA / DUPLO / TRIPLO…).
- **Sons gravados** (`assets/sounds/*.mp3`): tiros, recargas, pulo, abate, dano e passos em laço (mais rápido correndo, mais lento agachado).
  Sem o arquivo, cada som volta ao procedural.
- **Colisão:** rampas sobem andando (sobe até o degrau mais alto sob o corpo); encostar em parede alta não joga o jogador para o topo.

## Estrutura
    index.html                      importmap: three + three/addons
    assets/maps/warehouse.glb       mapa (texturas recomprimidas, 14,6 MB)
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
    src/world/MapData.js            dados do mapa (warehouse)
    src/world/CollisionWorld.js     colisão por caixas com grade espacial
    src/world/Navigation.js         grade + A*
    src/ui/                         Lobby, Minimap, WeaponSwitch, KillFeed, WeaponIcons
    src/styles/                     main.css, weapons.css, bots.css, hudfx.css
    tools/devtest.js                ajudante de testes no navegador (console: `const T = await import('/tools/devtest.js?'+Date.now()); await T.setup()`)

## Contratos entre módulos
- Eixos: x leste, z sul, y cima. **Piso do warehouse em y=0** (o GLB tem o piso em y=0,266 e é deslocado; o piso do arquivo está com as faces
  viradas para baixo, por isso os materiais do mapa usam DoubleSide). Yaw 0 olha para -z. Modelos Mixamo olham para +z (rotação yaw+π).
- `buildMapData()` → `{ name, glb, y0, navCell, navSeed, bounds, boxes[], sites[], labels[], zones[], spawns{attackers, defenders, dm} }`.
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
