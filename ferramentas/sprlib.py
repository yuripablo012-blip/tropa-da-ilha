from PIL import Image
import numpy as np, base64, io, json
U='/root/.claude/uploads/b1ca7fad-8eaa-5499-a772-d4c53aac82bb/'
def key(fn, bg='m'):
    a=np.asarray(Image.open(U+fn).convert('RGB')).astype(np.float32)
    r,g,b=a[...,0],a[...,1],a[...,2]
    if bg=='m':
        d=np.minimum(r,b)-g; al=np.clip((170-d)/110,0,1); sp=np.clip(d,0,None)*0.92
        return np.dstack([np.clip(r-sp,0,255),g,np.clip(b-sp,0,255),al*255]).astype(np.uint8)
    d=b-np.maximum(r,g); al=np.clip((150-d)/100,0,1); sp=np.clip(d,0,None)*0.9
    return np.dstack([r,g,np.clip(b-sp,0,255),al*255]).astype(np.uint8)
def crop(sub):
    m=sub[...,3]>100; rows=np.where(m.sum(1)>1)[0]; cols=np.where(m.sum(0)>1)[0]
    return Image.fromarray(sub[rows[0]:rows[-1]+1, cols[0]:cols[-1]+1])
def split(out,n,win=170):
    if n==1: return [crop(out)]
    c=(out[...,3]>100).sum(0).astype(float); W=len(c)
    cs=np.convolve(c,np.ones(9)/9,'same'); cuts=[]
    for i in range(1,n):
        lo=int(W*i/n-win); hi=int(W*i/n+win); cuts.append(lo+int(np.argmin(cs[lo:hi])))
    print('cuts',cuts,[round(cs[x],1) for x in cuts])
    b=[0]+cuts+[W]
    return [crop(out[:,b[i]:b[i+1]]) for i in range(n)]
META=json.load(open('spr/meta.json'))
def put(name,im,scale,u,ax=.5,ay=.9,q=86):
    w,h=im.size; im2=im.resize((max(1,round(w*scale)),max(1,round(h*scale))),Image.LANCZOS)
    b=io.BytesIO(); im2.save(b,'WEBP',quality=q,method=6); im2.save(f'spr/{name}.png')
    META[name]={'w':im2.size[0],'h':im2.size[1],'u':round(u,2),'ax':round(float(ax),3),'ay':ay,'src':'data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode()}
    return len(b.getvalue())
def build3(k,fn,U3,ay=.88,bg='m',maxdim=420):
    parts=split(key(fn,bg),3); w3,h3=parts[2].size; sc=maxdim/max(w3,h3); t=0
    for i,p in enumerate(parts): t+=put(f'{k}{i+1}',p,sc,U3*p.size[0]/w3,ay=ay); print(k,i+1,p.size)
    return t
def save():
    json.dump(META,open('spr/meta.json','w'))
    import re
    f='ilha.html'; s=open(f,encoding='utf-8').read()
    i=s.index('const VSPR = {'); j=s.index('\n',i)
    s=s[:i]+'const VSPR = '+json.dumps(META,separators=(',',':'))+';'+s[j:]
    open(f,'w',encoding='utf-8').write(s); print('html',len(s))
def sheet(names,out):
    ims=[Image.open(f'spr/{n}.png') for n in names]; H=max(i.size[1] for i in ims)
    W=sum(i.size[0] for i in ims); c=Image.new('RGB',(W,H),(60,140,60)); x=0
    for i in ims: c.paste(i,(x,H-i.size[1]),i); x+=i.size[0]
    c.save(out)
