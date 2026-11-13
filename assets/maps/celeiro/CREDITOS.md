# Créditos dos assets do mapa CELEIRO

Este mapa usa modelos 3D de terceiros e texturas de bancos públicos. As licenças exigem que os
autores sejam creditados; mantenha este arquivo junto do jogo (ele é distribuído com os assets).

## Modelos 3D (Sketchfab, CC BY 4.0)

Licença de todos: **Creative Commons Attribution 4.0** — <http://creativecommons.org/licenses/by/4.0/>.
Uso comercial permitido; o autor tem de ser creditado e as alterações indicadas.
Os arquivos ficam em `assets/maps/celeiro/models/` e foram otimizados para o jogo.

| Arquivo | Crédito | Alterações |
|---|---|---|
| `container.glb` | This work is based on "Classic Shipping Container (Free/Gameready)" (<https://sketchfab.com/3d-models/classic-shipping-container-freegameready-772f4be391a245f699c54e6cf157c58d>) by Sebastian Webster (<https://sketchfab.com/Sebastian.Hamish.Webster>) licensed under CC-BY-4.0 | Decimado (17,1k → 6,3k tris), texturas reduzidas a 1024 e convertidas para WebP. Em tempo de execução: a porta aberta é fechada, a peça é encurtada por corte do miolo (variantes de 4,7 m e 3,4 m) e cada instância é recolorida (vermelho/azul). |
| `logs.glb` | This work is based on "Log pile (game ready asset)" (<https://sketchfab.com/3d-models/log-pile-game-ready-asset-0bad9fd158ab4cc187857609f710a440>) by Pixel Life (<https://sketchfab.com/pixellife>) licensed under CC-BY-4.0 | Decimado (1,98k → 1,58k tris), texturas reduzidas. Instâncias esticadas no comprimento (7,2 m) e escurecidas levemente. |
| `boxcar.glb` | This work is based on "Railway Boxcar Freight Wagon \| Detailed 3D Model" (<https://sketchfab.com/3d-models/railway-boxcar-freight-wagon-detailed-3d-model-6cede42e50cc4042addfbedac1311551>) by saadthedesigner314 (<https://sketchfab.com/saadthedesigner314>) licensed under CC-BY-4.0 | Decimado (4,3k → 3,9k tris). Escala não uniforme para 7,3 × 3,1 × 2,4 m. Recolorido em shader: corpo cinza-escuro e teto prateado. |
| `barrel.glb` | This work is based on "Oil barrel" (<https://sketchfab.com/3d-models/oil-barrel-ec37cc2a844f4f0ca0873d85a8b3b976>) by farsmok (<https://sketchfab.com/farsmok>) licensed under CC-BY-4.0 | Decimado, texturas reduzidas. Usado só o barril em pé, escalado para 0,6 × 0,9 m. |
| `crate.glb` | This work is based on "Wooden Boxes" (<https://sketchfab.com/3d-models/wooden-boxes-ddecbe4586594bddb4822a90c0cba222>) by MaX3Dd (<https://sketchfab.com/MaX3Dd>) licensed under CC-BY-4.0 | Decimado (4,1k → 2,5k tris no arquivo; usada só a caixa `box1`, 605 tris), texturas reduzidas. Escala não uniforme para cada caixote da planta. |
| `pallet.glb` | This work is based on "Wooden Pallet Low-poly" (<https://sketchfab.com/3d-models/wooden-pallet-low-poly-2f1abd705d4f4118b4c8d0b275441505>) by MaX3Dd (<https://sketchfab.com/MaX3Dd>) licensed under CC-BY-4.0 | Decimado (1,37k → 0,88k tris), texturas reduzidas. Escalado para 1,25 × 0,17 × 1,25 m (topo dos containers com rampa). |

## Texturas (CC0 — domínio público)

Todas as texturas em `assets/maps/celeiro/textures/` são **CC0**: podem ser usadas, modificadas e
redistribuídas sem pedir permissão. O crédito abaixo é cortesia, não obrigação.

| Pasta | Asset | Autor | Licença |
|---|---|---|---|
| `sand` | coast_sand_01 (Poly Haven) | Rob Tuytel | CC0 |
| `concrete_floor` | Concrete034 (ambientCG) | ambientCG | CC0 |
| `roof` | rusty_corrugated_iron (Poly Haven) | Charlotte Baglioni | CC0 |
| `container` | corrugated_iron_02 (Poly Haven) | Jenelle van Heerden, Sergej Majboroda | CC0 |
| `train_metal` | rusty_metal_02 (Poly Haven) | Rob Tuytel | CC0 |
| `painted_metal` | rusty_painted_metal (Poly Haven) | Amal Kumar | CC0 |
| `wood_planks` | plank_flooring (Poly Haven) | Dario Barresi, Dimitrios Savva, Rico Cilliers | CC0 |
| `wood_crate` | Planks001 (ambientCG) | ambientCG | CC0 |
| `bark` | Bark001 (ambientCG) | ambientCG | CC0 |
| `barn_wall` | green_rough_planks (Poly Haven) | Rob Tuytel | CC0 |
| `floor_worn` | concrete_floor_worn_001 (Poly Haven) | Dimitrios Savva, Rico Cilliers | CC0 |
| `ramp_wood` | plank_flooring_03 (Poly Haven) | Jenelle van Heerden, Matterfield | CC0 |
| `barn_red` | distressed_painted_planks (Poly Haven) | Rob Tuytel | CC0 |

`concrete_wall` (Dario Barresi, Charlotte Baglioni) e `barn_trim` (Dimitrios Savva) também são CC0,
mas não são usadas pelo construtor do mapa no jogo.

## Origem

O mapa CELEIRO é uma adaptação do projeto standalone "mapa vagão" (planta, geometria procedural,
materiais e montagem), trazido para dentro do SHADOW-OPS. A geometria procedural (muros, galpão,
torres, cercas, rampas e piso) foi feita para este projeto.
