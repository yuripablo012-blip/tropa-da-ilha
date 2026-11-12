# Tropa da Ilha

Jogo mobile de navegador: um pirata com canhão defende a ponte, ganha moedas nas batalhas e usa as moedas para construir a própria ilha.

## Como jogar

Abra o `index.html` no navegador do celular. É um arquivo único, com imagens, sons e código embutidos, e funciona sem internet.

## Conteúdo

- `index.html` — o jogo completo.
- `sprites/` — imagens da ilha já recortadas (construções, coqueiros, terreno). `sprites/ilha.png` é o terreno pintado da ilha.
- `ferramentas/sprlib.py` — script que recorta o fundo magenta/azul das imagens geradas e separa os 3 níveis de cada construção.

## Estado atual

- A ilha está em **modo de teste**: toda construção custa 1 moeda (`VTEST1 = true` no `index.html`). Trocar para `false` antes de publicar.
- Construções ainda sem imagem (ficam escondidas até a imagem chegar): Torre do Vigia, Mercado, Forte, Mina de Ouro, Totem do Kraken.
