"""Recorta uma imagem com 3 visuais de uma construção (lado a lado, fundo magenta) e inclui no jogo.

Uso: python3 nova_construcao.py <index.html> <pasta_sprites> <chave>=<imagem> [<chave>=<imagem> ...]
     python3 nova_construcao.py --mais <index.html> <pasta_sprites> <chave>=<imagem> [...]
Sem --mais: a imagem traz os visuais 1, 2 e 3; se a chave já existir no jogo, os três antigos são substituídos.
Com --mais: a imagem traz os visuais 4, 5 e 6 (continuação de uma construção que já tem o 1, 2 e 3).
Cada um é ajustado para ocupar no chão quase o mesmo que o visual 3 (medindo a largura da base do desenho)
e não passar muito da altura dele, para caber na clareira da ilha.
A chave é a de VDEF no index.html (ex.: vig, mer, forte, mina, kra, casa1).
     python3 nova_construcao.py --troca[=fator] <index.html> <pasta_sprites> <chave>=<imagem123>,<imagem456> [...]
Com --troca: troca os seis visuais de uma construção que já está no jogo, mantendo o tamanho que cada um tem hoje
(a altura no jogo é multiplicada pelo fator; o padrão 0.93 serve para desenho novo SEM a base redonda de terra,
que é como as construções estão desde 2026-11: a construção e os enfeites ficam direto no chão da ilha).
Com --mais ou --troca, o brilho rosado em volta do desenho é apagado; escreva "chave!" para não mexer (construção roxa/rosa).

O fundo é detectado como magenta forte em qualquer lugar, mais o magenta mais fraco ligado à borda
da imagem. Só a faixa de 2 px junto ao fundo é suavizada, para não desbotar roxos e rosas do desenho.
"""
import sys, json, re, io, base64
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

def recorta(src, brilho=False):
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = np.minimum(r, b) - g
    forte = (r > 200) & (b > 190) & (g < 85)
    fraco = (d > 95) & (r > 150) & (b > 150)
    m = Image.fromarray((fraco * 255).astype(np.uint8)).copy(); H, W = fraco.shape  # .copy(): a imagem vinda do numpy é só leitura e o floodfill não a altera
    for p in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (W // 2, H - 1), (0, H // 2), (W - 1, H // 2), (W // 3, 0), (2 * W // 3, 0), (W // 3, H - 1), (2 * W // 3, H - 1)]:
        if m.getpixel(p) == 255: ImageDraw.floodfill(m, p, 128)
    fundo = forte | (np.asarray(m) == 128)
    borda = np.asarray(Image.fromarray((fundo * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    suave = np.clip((170 - d) / 110, 0, 1); sp = np.clip(d, 0, None) * 0.92
    al = np.where(fundo, 0, np.where(borda, suave, 1.0))
    rr = np.where(borda, np.clip(r - sp, 0, 255), r); bb = np.where(borda, np.clip(b - sp, 0, 255), b)
    if brilho:  # brilho/fumaça desenhado por cima do magenta fica rosa: o que for rosa claro e estiver ligado ao fundo vira transparência
        rosa = (d > 14) & (r > 185) & (b > 120) & ~fundo; alc = fundo.copy()
        for _ in range(90):
            viz = alc.copy(); viz[1:] |= alc[:-1]; viz[:-1] |= alc[1:]; viz[:, 1:] |= alc[:, :-1]; viz[:, :-1] |= alc[:, 1:]
            novo = viz & (rosa | fundo)
            if (novo == alc).all(): break
            alc = novo
        halo = alc & rosa
        al = np.where(halo, np.minimum(al, np.clip(1 - (d - 14) / 85, 0, 1)), al); bb = np.where(halo, np.clip(b - d * .9, 0, 255), bb)
    return np.dstack([rr, g, bb, al * 255]).astype(np.uint8)

def niveis(out):
    c = (out[..., 3] > 100).sum(0).astype(float); W = len(c); cs = np.convolve(c, np.ones(9) / 9, 'same'); cuts = []
    for n in (1, 2):
        lo = int(W * n / 3 - 190); hi = int(W * n / 3 + 190); cuts.append(lo + int(np.argmin(cs[lo:hi])))
    bnd = [0] + cuts + [W]; parts = []
    for n in range(3):
        sub = out[:, bnd[n]:bnd[n + 1]]; mm = sub[..., 3] > 100; rows = np.where(mm.sum(1) > 1)[0]; cols = np.where(mm.sum(0) > 1)[0]
        parts.append(Image.fromarray(sub[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]))
    return parts

def base(im):
    """Largura e centro da base do desenho (a parte mais larga do terço de baixo), em pixels."""
    m = np.asarray(im)[..., 3] > 100; H = m.shape[0]; best = (0, m.shape[1] / 2)
    for y in range(int(H * .68), H):
        c = np.where(m[y])[0]
        if len(c) and c[-1] - c[0] > best[0]: best = (c[-1] - c[0], (c[-1] + c[0]) / 2)
    return best

def webp(im):
    bb = io.BytesIO(); im.save(bb, 'WEBP', quality=78, method=6); return bb.getvalue()

if __name__ == '__main__':
    mais = '--mais' in sys.argv
    if mais: sys.argv.remove('--mais')
    troca = [x for x in sys.argv if x.startswith('--troca')]; fator = None
    if troca: sys.argv.remove(troca[0]); fator = float(troca[0].split('=')[1]) if '=' in troca[0] else .93
    html, sprdir = sys.argv[1], sys.argv[2]
    s = open(html, encoding='utf-8').read()
    i = s.index('const VSPR = {'); j = s.index('\n', i); line = s[i:j]
    meta = json.loads(re.sub(r'"src":"[^"]+"', '"src":""', line[len('const VSPR = '):].rstrip(';')))
    ratio = 0.02589  # unidades do mundo por pixel do sprite (mesma escala de todas as construções)
    novo = {}
    for arg in sys.argv[3:]:
        key, src = arg.split('=', 1); brilho = not key.endswith('!'); key = key.rstrip('!')  # "chave!" = não mexer nos rosas (construção roxa/rosa)
        if fator:
            for n in range(1, 7): line = re.sub(r'"%s%d":\{[^{}]*\},?' % (key, n), '', line)
            parts = sum((niveis(recorta(f, brilho)) for f in src.split(',')), [])
            for n, p in enumerate(parts):
                old = meta[key + str(n + 1)]; sc = min(1.25, (340 if n > 2 else 420) / max(p.size)) * (1 if n > 2 else (.5, .72, 1)[n] ** .5)
                im = p.resize((max(1, round(p.size[0] * sc)), max(1, round(p.size[1] * sc))), Image.LANCZOS); im.save('%s/%s%d.png' % (sprdir, key, n + 1))
                lb, cb = base(im); d = webp(im)
                novo[key + str(n + 1)] = {'w': im.size[0], 'h': im.size[1], 'u': round(old['u'] * old['h'] / old['w'] * fator * im.size[0] / im.size[1], 2), 'ax': round(cb / im.size[0], 3), 'ay': 0.95, 'src': 'data:image/webp;base64,' + base64.b64encode(d).decode()}
                print(key, n + 1, im.size, len(d), novo[key + str(n + 1)]['u'], novo[key + str(n + 1)]['ax'])
            continue
        if mais:
            for n in (4, 5, 6): line = re.sub(r'"%s%d":\{[^{}]*\},?' % (key, n), '', line)
            m3 = meta[key + '3']; l3, _ = base(Image.open('%s/%s3.png' % (sprdir, key)).convert('RGBA')); chao = m3['u'] * l3 / m3['w']; alto = m3['u'] * m3['h'] / m3['w']  # largura da base e altura do visual 3, em unidades do mundo
            for n, p in enumerate(niveis(recorta(src, brilho))):
                sc = 340 / max(p.size); im = p.resize((max(1, round(p.size[0] * sc)), max(1, round(p.size[1] * sc))), Image.LANCZOS); im.save('%s/%s%d.png' % (sprdir, key, n + 4))
                lb, cb = base(im); d = webp(im)
                novo[key + str(n + 4)] = {'w': im.size[0], 'h': im.size[1], 'u': round(min(max(chao * (.99, 1.02, 1.05)[n], 8.6 * (.95, 1, 1.05)[n]) * im.size[0] / lb, alto * (1.04, 1.1, 1.16)[n] * im.size[0] / im.size[1]), 2), 'ax': round(cb / im.size[0], 3), 'ay': 0.88, 'src': 'data:image/webp;base64,' + base64.b64encode(d).decode()}
                print(key, n + 4, im.size, len(d), novo[key + str(n + 4)]['u'], novo[key + str(n + 4)]['ax'])
            continue
        for n in (1, 2, 3):  # se a construção já existe, a imagem antiga é substituída
            line = re.sub(r'"%s%d":\{[^{}]*\},?' % (key, n), '', line)
        parts = niveis(recorta(src)); w3, h3 = parts[2].size; sc = 420 / max(w3, h3)
        for n, p in enumerate(parts):
            im = p.resize((max(1, round(p.size[0] * sc)), max(1, round(p.size[1] * sc))), Image.LANCZOS); im.save('%s/%s%d.png' % (sprdir, key, n + 1))
            bb = io.BytesIO(); im.save(bb, 'WEBP', quality=84, method=6)
            novo[key + str(n + 1)] = {'w': im.size[0], 'h': im.size[1], 'u': round(ratio * im.size[0], 2), 'ax': 0.5, 'ay': 0.88, 'src': 'data:image/webp;base64,' + base64.b64encode(bb.getvalue()).decode()}
            print(key, n + 1, im.size, len(bb.getvalue()))
    s = s[:i] + 'const VSPR = {' + json.dumps(novo, separators=(',', ':'))[1:-1] + ',' + line[len('const VSPR = {'):] + s[j:]
    open(html, 'w', encoding='utf-8').write(s)
