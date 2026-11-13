# Quick Design Spec: Modo Favela

**Type**: Tweak + New Small System
**Scope**: O competitivo 5v5 passa a se chamar Modo Favela, com escolha de lado (Polícia ou Bandido) ao entrar, e ganha o mapa FAVELA. Não muda as regras de rodada, C4 e economia (Parte 5, ainda por fazer).
**Date**: 2026-11-13
**Estimated Implementation**: 1 dia (feito)

## Change Summary

- O modo `competitive` aparece como **MODO FAVELA** no menu, na sala, no HUD, na carreira e na sala CUSTOM. A chave interna continua `competitive` (estatísticas antigas seguem valendo).
- JOGAR abre **Escolha o seu lado**: Polícia = time `att` (ataque, azul), Bandido = time `def` (defesa, vermelho). As cores dos times foram invertidas para combinar.
- Novo mapa **FAVELA** (primeiro da lista, padrão para quem ainda não escolheu mapa), vindo do projeto FavelaRJ da Unreal.

## Motivation

O jogo ganha identidade (favela carioca, polícia contra bandido) e um mapa grande e vertical, diferente dos galpões.

## Design Delta

| Antes | Depois |
|---|---|
| Competitivo: você sempre começa no ataque | Você escolhe Polícia (ataque) ou Bandido (defesa) |
| Ataque vermelho, defesa azul | Polícia azul, Bandido vermelho |
| Mapas planos, piso em y=0 | FAVELA: morro com 15–40 m de desnível, uma ponte sobre o rio |

## New Rules / Values

- Polícia nasce na avenida do canal; Bandido nasce no meio do morro, entre os sites.
- Site A = praça; Site B = laje plana a oeste. Rotas: Polícia → A 123 m, → B 161 m; Bandido → A 88 m, → B 28 m.
- Limite da arena: 143 × 230 m, paredes invisíveis; o resto do mapa é cenário. Não dá para cair no rio (grade invisível na beira).

## Affected Systems

`CollisionWorld` (terreno), `Navigation` (2,5D), `Game` (mapa, câmera, sol), `Bot`/`BotManager`/`OnlineMatch` (nascimento com altura), `Minimap`, `Lobby`, `FrontMenu`, `TeamPicker` (novo), `MapData`, `FavelaMap` (novo), `FavelaData` (gerado).

## Acceptance Criteria

- [x] JOGAR no Modo Favela abre a escolha de lado; Polícia entra no time de ataque, Bandido no de defesa
- [x] FAVELA carrega e a partida começa; jogador e bots nascem em pé no piso do seu lado
- [x] Bots atravessam a ponte, sobem o morro e chegam aos sites
- [x] WAREHOUSE e CELEIRO continuam iguais
- [ ] Playtest humano: ritmo da partida no mapa grande e desempenho em PCs mais fracos

## GDD Update Required?

Não há GDD no projeto ainda. Os detalhes técnicos estão no `PROGRESSO.md` (seção 13/11) e no `CONTINUAR.md` (5.2).
