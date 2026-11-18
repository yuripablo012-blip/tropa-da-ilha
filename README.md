# Tropa da Ilha

Jogo mobile de navegador: um pirata com canhão defende a ponte, ganha moedas nas batalhas e usa as moedas para construir a própria ilha.

## Como jogar

Abra o `index.html` no navegador do celular. É um arquivo único, com imagens, sons e código embutidos, e funciona sem internet.

## Conteúdo

- `index.html` — o jogo completo.
- `api.php` — contas dos jogadores (criar conta, entrar, guardar o progresso). Roda na hospedagem do site; os dados ficam numa pasta fora do site, um arquivo por conta, sem banco de dados. Aberto direto do arquivo ou sem servidor, o jogo funciona sem conta.
- `sprites/` — imagens da ilha já recortadas (construções, coqueiros, terreno). `sprites/ilha.png` é o terreno pintado da ilha.
- `painel.html` — painel do dono do jogo: quantas pessoas abriram o jogo, contas criadas e quem jogou, por dia. Abre só com a senha do painel; os números vêm do `api.php`.
- `ferramentas/criativos/gerar.js` — gera os criativos de anúncio: um robô joga o jogo de verdade, a tela é gravada e saem vídeos 1080x1920 com chamada e tela final "Jogue grátis", mais imagens paradas. Uso: `node ferramentas/criativos/gerar.js` (todos) ou `node ferramentas/criativos/gerar.js horda ilha`. Precisa de Node, Playwright e ffmpeg; os arquivos saem na pasta `criativos/` (fora do git). Para um criativo novo, copie um item da lista `CRIATIVOS` no fim do arquivo. Os itens `reels_*` são para postar no Reels sem pagar (legenda no estilo do Instagram e final "link na bio"); os outros são anúncios.
- `ferramentas/sprlib.py` — script que recorta o fundo magenta/azul das imagens geradas e separa os 3 níveis de cada construção.

## Estado atual

- A ilha está em **modo de teste**: toda construção custa 1 moeda (`VTEST1 = true` no `index.html`). Trocar para `false` antes de publicar.
- Construções ainda sem imagem (ficam escondidas até a imagem chegar): Torre do Vigia, Mercado, Forte, Mina de Ouro, Totem do Kraken.
