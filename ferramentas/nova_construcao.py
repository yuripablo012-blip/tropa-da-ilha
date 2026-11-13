"""Recorta uma imagem com os 3 níveis de uma construção (lado a lado, fundo magenta) e inclui no jogo.

Uso: python3 nova_construcao.py <imagem> <chave> <index.html> <pasta_saida> <pasta_sprites>
A chave é a de VDEF no index.html (ex.: vig, mer, forte, mina, kra).
"""
import sys, json, re, io, base64
from PIL import Image
import numpy as np
src, key_, html, outdir, sprdir = sys.argv[1:6]
s=open(html,encoding='utf-8').read()
i=s.index('const VSPR = {'); j=s.index('\n',i); line=s[i:j]
slim=re.sub(r'"src":"[^"]+"','"src":""',line[len('const VSPR = '):].rstrip(';')); meta=json.loads(slim)
ratio=np.mean([meta[k+'3']['u']/meta[k+'3']['w'] for k in ('tes','tav','fer','far','est')]); print('u/px',ratio, {k:(meta[k]['w'],meta[k]['h'],meta[k]['u']) for k in ('far1','far2','far3','tes3')})
a=np.asarray(Image.open(src).convert('RGB')).astype(np.float32); r,g,b=a[...,0],a[...,1],a[...,2]
d=np.minimum(r,b)-g; al=np.clip((170-d)/110,0,1); sp=np.clip(d,0,None)*0.92
out=np.dstack([np.clip(r-sp,0,255),g,np.clip(b-sp,0,255),al*255]).astype(np.uint8)
c=(out[...,3]>100).sum(0).astype(float); W=len(c); cs=np.convolve(c,np.ones(9)/9,'same'); cuts=[]
for n in (1,2):
    lo=int(W*n/3-170); hi=int(W*n/3+170); cuts.append(lo+int(np.argmin(cs[lo:hi])))
bnd=[0]+cuts+[W]; parts=[]
for n in range(3):
    sub=out[:,bnd[n]:bnd[n+1]]; m=sub[...,3]>100; rows=np.where(m.sum(1)>1)[0]; cols=np.where(m.sum(0)>1)[0]
    parts.append(Image.fromarray(sub[rows[0]:rows[-1]+1, cols[0]:cols[-1]+1]))
w3,h3=parts[2].size; sc=420/max(w3,h3); new={}
for n,p in enumerate(parts):
    im=p.resize((max(1,round(p.size[0]*sc)),max(1,round(p.size[1]*sc))),Image.LANCZOS); im.save('%s/%s%d.png'%(sprdir,key_,n+1)); im.save('%s/%s%d.png'%(outdir,key_,n+1))
    bb=io.BytesIO(); im.save(bb,'WEBP',quality=86,method=6)
    new[key_+str(n+1)]={'w':im.size[0],'h':im.size[1],'u':round(float(ratio*im.size[0]),2),'ax':0.5,'ay':0.88,'src':'data:image/webp;base64,'+base64.b64encode(bb.getvalue()).decode()}
    print(key_,n+1,im.size,new[key_+str(n+1)]['u'],len(bb.getvalue()))
ins=json.dumps(new,separators=(',',':'))[1:-1]+','
assert ('"%s1"'%key_) not in line
s=s[:i]+'const VSPR = {'+ins+line[len('const VSPR = {'):]+s[j:]
open(html,'w',encoding='utf-8').write(s)
