# 背帶改用程式做:Tripo 把背帶做成插進衣服的一層薄片、還從手臂底下穿過,貼圖修不乾淨
#   1. strap_mask:找出貼圖上原本的背帶(身體上、背包前面、顏色和背包一樣的像素)→ 交給 face 腳本用衣服顏色補掉
#   2. build_strap:沿著原本背帶的位置,做一條貼著身體的扁帶子(跟著胸口骨頭動)
import numpy as np
def dil(m,r):
  o=m.copy()
  for dy in range(-r,r+1):
    for dx in range(-r,r+1):
      if dx*dx+dy*dy<=r*r: o|=np.roll(np.roll(m,dy,0),dx,1)
  return o
def strap_mask(c,cover,POS,PARTT,C):
  y,z=POS[...,1],POS[...,2]
  bag=cover&(PARTT==0)&(y>C['bag_y'][0]+0.05)&(z>C['chest'][0])&(z<C['head'][0]-0.03)   # 背包:胸口高度、背後凸出去的那塊(後腦勺比較高、尾巴比較低,都排除)
  if C.get('bag_dark'): bag&=c.mean(-1)<0.45   # 狐狸:白色尾巴尖也落在這個範圍,只取深色的背包
  bagc=np.median(c[bag],0)
  zone=cover&(PARTT<=2)&(PARTT>=0)&(y<C['bag_y'][0]-0.05)&(z<C['head'][0]+0.02)&(z>C['hips'][0])   # 腋下那段背帶的權重歸手臂,也要算;背包本體(連同貼著背的那面)不算
  near=np.linalg.norm(c-bagc,axis=-1)<0.13
  m=zone&near
  m=dil(m,5)&zone   # 背帶邊緣反鋸齒的過渡色也一起抹掉
  print('strap color',(bagc*255).round(),'strap px',int(m.sum()))
  return m,bagc
def bag_texel(bag,c,bagc,RES):   # 背包中間一塊顏色均勻的像素:背帶整條 UV 都指到這裡(和背包同色,不用另外的材質)
  ok=bag&(np.linalg.norm(c-bagc,axis=-1)<0.06)
  r=6; a=np.pad(ok.astype(np.float32),((r+1,r),(r+1,r))); s=a.cumsum(0).cumsum(1); n=2*r+1
  cnt=s[n:,n:]-s[:-n,n:]-s[n:,:-n]+s[:-n,:-n]
  y,x=np.unravel_index(np.argmax(cnt),cnt.shape)
  return ((x+0.5)/RES,(y+0.5)/RES)
def build_strap(me,POS,STRAP,uv,C,PARTV,BAGP):
  # 上半段(背包上緣 → 肩膀 → 胸前)照原本背帶的位置走;
  # 下半段(胸前 → 腋下 → 背包下緣)原模型被手臂擋住、量不到,改成貼著軀幹側面直接走回背包
  import bpy, bmesh
  from mathutils import Vector
  from mathutils.bvhtree import BVHTree
  mm=me.data
  co=np.zeros(len(mm.vertices)*3,np.float32); mm.vertices.foreach_get('co',co); co=co.reshape(-1,3)
  mm.calc_loop_triangles(); tri=np.array([t.vertices[:] for t in mm.loop_triangles])
  bvh=BVHTree.FromPolygons(co.tolist(),tri.tolist())   # 上半段貼整個外皮
  body=tri[(PARTV[tri]==0).all(1)]; tor=BVHTree.FromPolygons(co.tolist(),body.tolist())   # 腋下那圈只看軀幹(手臂的皮不算)
  def snap(p):   # 貼到軀幹表面
    loc,n,_,_=bvh.find_nearest(Vector(p)); return np.array(loc[:]),np.array(n[:])
  from mathutils.kdtree import KDTree
  kd=KDTree(len(co))
  for i,c in enumerate(co): kd.insert(Vector(c),i)
  kd.balance()
  VW=[{g.group:g.weight for g in v.groups} for v in mm.vertices]
  def weights(p):   # 帶子的權重抄底下外皮的(附近 4 個頂點平均):手抬起來時帶子跟著皮膚動,不會浮在空中或被蓋住
    acc={}
    for _,i,_ in kd.find_n(Vector(p),4):
      for g,w in VW[i].items(): acc[g]=acc.get(g,0)+w/4
    t=sum(acc.values()) or 1; return {g:w/t for g,w in acc.items()}
  bagx=float(np.percentile(np.abs(BAGP[:,0]),70))
  bm=bmesh.new(); bm.from_mesh(mm); uvl=bm.loops.layers.uv['bake']; dl=bm.verts.layers.deform.verify()
  gi=me.vertex_groups['chest'].index
  zarm=C['arm'][0][2]; ybag=C['bag_y'][0]
  P=POS[STRAP]
  for side in (1,-1):
    Q=P[(P[:,0]*side>0.05)&(P[:,2]>zarm-0.02)]
    if len(Q)<500: print('strap side',side,'too few',len(Q)); continue
    yc,zc=np.median(Q[:,1]),np.min(Q[:,2]); ang=np.arctan2(Q[:,2]-zc,Q[:,1]-yc)   # 以下緣為中心:上半圈的角度從前(-Y)掃到後(+Y)
    NB=48; bi=np.clip(((ang)/np.pi*NB).astype(int),0,NB-1)
    full=np.bincount(bi,minlength=NB)>=15
    ks=np.nonzero(full)[0]
    arc=np.array([np.median(Q[bi==k],0) for k in ks])[::-1]   # 前 → 後
    wid=[np.percentile(np.linalg.norm(Q[bi==k]-np.median(Q[bi==k],0),axis=1),85)*2 for k in ks]
    W=float(np.median(wid))
    F,Bk=arc[0],arc[-1]   # 胸前下端、背後上端
    # 下半段不做:腋下那裡手臂和身體在原模型是黏在一起的(體素重建後同一塊),沒有真的表面可以讓帶子繞過去。
    #   改成胸前那端往腋下收、尾巴沉進身體裡(和原設計一樣:背帶消失在手臂底下)
    zlow=F[2]-0.06
    tip=np.array([side*(abs(F[0])+0.05),F[1]+0.07,zlow])
    low=[snap(F+(tip-F)*t)[0] for t in np.linspace(0,1,6)[1:]]
    pts=np.vstack([low[::-1],arc])   # 背包下 → 腋下 → 胸前 → 肩膀 → 背包上
    for _ in range(8):
      pts[1:-1]=pts[1:-1]*0.5+(pts[:-2]+pts[2:])*0.25
      pts=np.array([snap(p)[0] for p in pts])
    def into_bag(p): q=p+[0,0.06,0]; q[0]=side*min(abs(q[0]),bagx*0.8); return q
    n0=snap(pts[0])[1]
    pts=np.vstack([(pts[0]-n0*0.035)[None],pts,into_bag(pts[-1])[None]])   # 胸前那端沉進腋下;背後那端插進背包(x 收進背包寬度內)
    d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(pts,axis=0),axis=1))]; M=max(24,int(d[-1]/0.012))
    pts=np.array([np.interp(np.linspace(0,d[-1],M),d,pts[:,i]) for i in range(3)]).T
    nrm=np.array([snap(p)[1] for p in pts])
    for _ in range(4): nrm[1:-1]=nrm[1:-1]*0.5+(nrm[:-2]+nrm[2:])*0.25
    nrm/=np.linalg.norm(nrm,axis=1,keepdims=True)
    T=0.016; prof=[(-0.5,-0.006),(-0.5,0.6*T),(-0.32,T),(0.32,T),(0.5,0.6*T),(0.5,-0.006)]   # 剖面:扁扁的帶子,上緣圓一點
    rings=[]
    for i,p in enumerate(pts):
      t=pts[min(i+1,M-1)]-pts[max(i-1,0)]; t/=np.linalg.norm(t); n=nrm[i]; b=np.cross(n,t); b/=np.linalg.norm(b)
      ring=[]
      for u,h in prof:
        v=bm.verts.new(Vector(p+b*u*W+n*h)); v[dl][gi]=1.0; ring.append(v)   # 整條跟胸口骨頭走
      rings.append(ring)
    for ra,rb in zip(rings[:-1],rings[1:]):
      for j in range(len(prof)-1):
        f=bm.faces.new((ra[j],rb[j],rb[j+1],ra[j+1])); f.material_index=0; f.smooth=True
        for l in f.loops: l[uvl].uv=uv
    print('strap side',side,'points',M,'width',round(W,3),'len',round(d[-1],2))
  bm.to_mesh(mm); bm.free()
