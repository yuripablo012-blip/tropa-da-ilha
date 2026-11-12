# Recados entre as sessões

Mural compartilhado. Recado mais novo em cima. Formato:

`AAAA-MM-DD — branch — recado`

## Quem está com o `index.html`

Ninguém no momento (livre).

## Recados

- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: botão de som (`P.mute`, `sndBtn` no lobby e `sndBtn2` na pausa); a ilha completa com as construções que existem (`vAll`); dica da batalha reposicionada (`.hint`); a escolha do pirata só aparece na primeira vez; metas e `manifest.json` + `icon-192.png`/`icon-512.png` para instalar como aplicativo quando o jogo estiver hospedado.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: praia estendida por código em volta da ilha pintada (`VBEACH`: 7 unidades para a frente, 2,6 para trás), com areia molhada, espuma e água rasa em degradê (`vRenderCache`); contorno da costa ampliado junto (`vRing`); cais e navio avançados para a nova beira.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: terreno voltou a ter as clareiras redondas de terra e os caminhos (`VISL`, `sprites/ilha.png`); construções reposicionadas em cima das clareiras (`VDEF`); base sob as construções desligada (`VBASEIMG = false`); câmera abre um pouco mais afastada.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: construções antigas agora ficam sobre a base pintada recortada da imagem da Torre do Vigia (`VBASE`, `sprites/base.png`), desenhada no `vRenderCache`. A base por código continua desligada (`VBASECODE`).
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: base por código sob as construções antigas desligada (`VBASECODE = false`). O plano é regenerar as imagens antigas já com a base pintada, como a Torre do Vigia.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: construções antigas ganharam base desenhada por código no estilo da Torre do Vigia (lote de grama com borda de terra, piso de pedra, pedras e matinho, no `vRenderCache`). `VOWNBASE` lista as construções cuja imagem já traz a base e ficam sem a de código.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: Torre do Vigia ganhou imagem (`vig1`–`vig3` em `VSPR`, `sprites/vig*.png`) e passou a aparecer na vila. Novo `ferramentas/nova_construcao.py` recorta uma imagem com 3 níveis em fundo magenta e inclui no `VSPR`.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: cada construção passa a ter 9 níveis (`VLMAX`), em 3 estágios visuais de 3 passos (`vStg`); a imagem muda nos níveis 1, 4 e 7 e cresce um pouco nos passos do meio. Saves antigos são convertidos (1/2/3 → 3/6/9, marca `P.vila.v9`). Bônus no nível cheio igual ao de antes (`vTot` usa nível/3); custo total por construção dobrou (`vCost`). Construções em terra 20% menores.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: construções agrupadas numa vila no centro da ilha e cais/navio na praia logo abaixo (`VDEF`); câmera abre mais afastada, mostrando a vila (`vResize`); sombra justa acompanhando o contorno da base de cada construção (laço de sprites do `vFrame`).
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: calçada de pedra desligada (`if (false && built && VISL.ok)` no `vRenderCache`); construções direto na grama, só com o traço de contato. O estilo final da base ainda está em escolha com o dono.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: cada construção ganhou uma calçada de pedra em volta, com uma entradinha na frente e grama subindo nas beiradas (desenhada no `vRenderCache`). Os tufos de grama na base da construção foram desligados.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: construções sem nenhuma mancha embaixo — saíram o canteiro, a sombra macia e a sombra projetada. No lugar, tufos de grama desenhados na frente do contorno da base (`m.tf` em `vAoMake`, laço de sprites do `vFrame`).
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: assentamento das construções — canteiro quadrado de grama escura, vinco escuro sob o contorno da base e base do sprite escurecida até o chão (`vAoMake`, `m.gnd`). Tamanho das construções de volta ao original.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: o lote sob cada construção deixou de ser uma laje elevada e virou um canteiro plano de grama mais escura, com sombra macia colada no pé (`vRenderCache`).
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: cada construção agora fica sobre um lote em losango, levemente elevado (desenhado no `vRenderCache`). O recorte esverdeado da base (`vGndMake`) foi removido.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: construções coladas no chão — a base do sprite some em folhinhas irregulares para a grama passar por cima (`vGndMake`, `m.gnd`), e a sombra em volta virou uma sombra curta só do lado direito.
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: terreno sem clareiras nem trilhas de terra — a imagem da ilha (`VISL`, `sprites/ilha.png`) agora é toda gramada, e o anel de terra sob as construções saiu (ficou só a sombra de contato).
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: ilha com o dobro do tamanho — duas cópias da imagem do terreno unidas numa só (`VISL`, 2702×981; `sprites/ilha.png`). `VDEF` reposicionado nas 15 clareiras, cache da ilha maior (`ext = 75`, `k = 23`) e câmera com mais alcance (`vClamp`, `vZoom`).
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: construções assentadas no chão da ilha pintada — sombra de contato e terra socada sob a base, sombra projetada curta para a direita e sprites 22% maiores (`vBuildObj`, `vRenderCache`).
- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: o terreno da ilha agora é uma imagem pintada (`VISL`, embutida; original recortado em `sprites/ilha.png`). Grama, areia e coqueiros desenhados por código ficaram desligados, e as construções em `VDEF` foram reposicionadas nas clareiras da imagem. Todas as ilhas usam a mesma imagem por enquanto.
- 2026-11-11 — `claude/hopeful-galileo-t00naw` — `index.html`: faixa de areia mais estreita (`vGrassR` agora acompanha o contorno da ilha), cais 30% mais comprido (`m.st` nos sprites `cais*`) e estacas laterais fincadas na água ou na areia (`VLEG`, `vInRing`).
- 2026-11-11 — `claude/hopeful-galileo-t00naw` — `index.html`: o Navio Pirata só aparece na ilha depois que o Cais é construído (`vSceneObjs` e `renderVila`). Em modo de teste (`VTEST1`), cada save recebe 100 mil moedas uma vez (marca `P.t100k`).
- 2026-11-11 — `claude/exciting-noether-v5strp` — `index.html`: adicionados `<!doctype html>`, `charset` e `<meta name="viewport">` no topo do arquivo. Sem o viewport, o jogo aparecia como uma faixa estreita no celular fora do Claude (site publicado). Só as 4 primeiras linhas mudaram; `index.html` liberado.
- 2026-11-11 — `claude/hopeful-galileo-t00naw` — `index.html`: navio e cais agora assentam na água (base afundada com linha d'água, espuma, sombra). Código novo: `vWetMake` e o trecho `o.wat` no laço de sprites do `vFrame`. Imagens não foram trocadas.
- 2026-11-11 — `claude/hopeful-galileo-t00naw` — Adicionadas as pastas `sprites/` e `ferramentas/`, que faltavam no upload inicial. `index.html` não foi alterado. Criados `CLAUDE.md` e este arquivo.
