"""Recorta uma imagem com os 3 níveis de uma construção (lado a lado, fundo magenta) e inclui no jogo.

Uso: python3 nova_construcao.py <index.html> <pasta_sprites> <chave>=<imagem> [<chave>=<imagem> ...]
A chave é a de VDEF no index.html (ex.: vig, mer, forte, mina, kra, casa1).

O fundo é detectado como magenta forte em qualquer lugar, mais o magenta mais fraco ligado à borda
da imagem. Só a faixa de 2 px junto ao fundo é suavizada, para não desbotar roxos e rosas do desenho.
"""
import sys, json, re, io, base64
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

def recorta(src):
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = np.minimum(r, b) - g
    forte = (r > 200) & (b > 190) & (g < 85)
    fraco = (d > 95) & (r > 150) & (b > 150)
    m = Image.fromarray((fraco * 255).astype(np.uint8)); H, W = fraco.shape
    for p in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (W // 2, H - 1), (0, H // 2), (W - 1, H // 2), (W // 3, 0), (2 * W // 3, 0), (W // 3, H - 1), (2 * W // 3, H - 1)]:
        if m.getpixel(p) == 255: ImageDraw.floodfill(m, p, 128)
    fundo = forte | (np.asarray(m) == 128)
    borda = np.asarray(Image.fromarray((fundo * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    suave = np.clip((170 - d) / 110, 0, 1); sp = np.clip(d, 0, None) * 0.92
    al = np.where(fundo, 0, np.where(borda, suave, 1.0))
    rr = np.where(borda, np.clip(r - sp, 0, 255), r); bb = np.where(borda, np.clip(b - sp, 0, 255), b)
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

if __name__ == '__main__':
    html, sprdir = sys.argv[1], sys.argv[2]
    s = open(html, encoding='utf-8').read()
    i = s.index('const VSPR = {'); j = s.index('\n', i); line = s[i:j]
    meta = json.loads(re.sub(r'"src":"[^"]+"', '"src":""', line[len('const VSPR = '):].rstrip(';')))
    ratio = float(np.mean([meta[k + '3']['u'] / meta[k + '3']['w'] for k in ('tes', 'tav', 'fer', 'far', 'est')]))
    novo = {}
    for arg in sys.argv[3:]:
        key, src = arg.split('=', 1); assert ('"%s1"' % key) not in line, key + ' já existe'
        parts = niveis(recorta(src)); w3, h3 = parts[2].size; sc = 420 / max(w3, h3)
        for n, p in enumerate(parts):
            im = p.resize((max(1, round(p.size[0] * sc)), max(1, round(p.size[1] * sc))), Image.LANCZOS); im.save('%s/%s%d.png' % (sprdir, key, n + 1))
            bb = io.BytesIO(); im.save(bb, 'WEBP', quality=84, method=6)
            novo[key + str(n + 1)] = {'w': im.size[0], 'h': im.size[1], 'u': round(ratio * im.size[0], 2), 'ax': 0.5, 'ay': 0.88, 'src': 'data:image/webp;base64,' + base64.b64encode(bb.getvalue()).decode()}
            print(key, n + 1, im.size, len(bb.getvalue()))
    s = s[:i] + 'const VSPR = {' + json.dumps(novo, separators=(',', ':'))[1:-1] + ',' + line[len('const VSPR = {'):] + s[j:]
    open(html, 'w', encoding='utf-8').write(s)
