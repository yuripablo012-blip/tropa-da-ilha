# Recados entre as sessões

Mural compartilhado. Recado mais novo em cima. Formato:

`AAAA-MM-DD — branch — recado`

## Quem está com o `index.html`

Ninguém no momento (livre).

## Recados

- 2026-11-12 — `claude/hopeful-galileo-t00naw` — `index.html`: o terreno da ilha agora é uma imagem pintada (`VISL`, embutida; original recortado em `sprites/ilha.png`). Grama, areia e coqueiros desenhados por código ficaram desligados, e as construções em `VDEF` foram reposicionadas nas clareiras da imagem. Todas as ilhas usam a mesma imagem por enquanto.
- 2026-11-11 — `claude/hopeful-galileo-t00naw` — `index.html`: faixa de areia mais estreita (`vGrassR` agora acompanha o contorno da ilha), cais 30% mais comprido (`m.st` nos sprites `cais*`) e estacas laterais fincadas na água ou na areia (`VLEG`, `vInRing`).
- 2026-11-11 — `claude/hopeful-galileo-t00naw` — `index.html`: o Navio Pirata só aparece na ilha depois que o Cais é construído (`vSceneObjs` e `renderVila`). Em modo de teste (`VTEST1`), cada save recebe 100 mil moedas uma vez (marca `P.t100k`).
- 2026-11-11 — `claude/exciting-noether-v5strp` — `index.html`: adicionados `<!doctype html>`, `charset` e `<meta name="viewport">` no topo do arquivo. Sem o viewport, o jogo aparecia como uma faixa estreita no celular fora do Claude (site publicado). Só as 4 primeiras linhas mudaram; `index.html` liberado.
- 2026-11-11 — `claude/hopeful-galileo-t00naw` — `index.html`: navio e cais agora assentam na água (base afundada com linha d'água, espuma, sombra). Código novo: `vWetMake` e o trecho `o.wat` no laço de sprites do `vFrame`. Imagens não foram trocadas.
- 2026-11-11 — `claude/hopeful-galileo-t00naw` — Adicionadas as pastas `sprites/` e `ferramentas/`, que faltavam no upload inicial. `index.html` não foi alterado. Criados `CLAUDE.md` e este arquivo.
