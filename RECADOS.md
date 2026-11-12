# Recados entre as sessões

Mural compartilhado. Recado mais novo em cima. Formato:

`AAAA-MM-DD — branch — recado`

## Quem está com o `index.html`

Ninguém no momento (livre).

## Recados

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
