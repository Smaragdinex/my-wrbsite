# 用法:blender -b <rig_bunny.py 產生的 .blend> -P rig_bunny_face.py -- <輸出 .blend> <角色 key>(之後再跑 rig_bunny_anim.py)
# 表情:把貼圖上畫死的眼睛 / 嘴巴塗掉,在臉前面加一片跟著頭動的「表情貼片」(材質名 Face,遊戲用 canvas 即時畫表情)
import bpy, bmesh, sys, math, numpy as np
from mathutils import Vector
_a=sys.argv[sys.argv.index('--')+1:]; OUT=_a[0]; CH=_a[1] if len(_a)>1 else 'bunny'
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from rig_chars import CHARS; C=CHARS[CH]
me=bpy.data.objects['Bunny']
RES=2048   # 貼圖解析度:1024 時袖口、背帶邊緣拉近看會糊
# 材質重建成最簡單的:Principled + 一張顏色貼圖(Tripo 原本還有法線 / 粗糙度貼圖,卡通渲染用不到)
nt=me.data.materials[0].node_tree; nt.nodes.clear()
_o=nt.nodes.new('ShaderNodeOutputMaterial'); _b=nt.nodes.new('ShaderNodeBsdfPrincipled'); _t=nt.nodes.new('ShaderNodeTexImage')
nt.links.new(_t.outputs['Color'],_b.inputs['Base Color']); nt.links.new(_b.outputs[0],_o.inputs['Surface'])
# ── 新網格(體素重建)沒有 UV:展開一份,顏色等一下從原模型 Src 投射烘焙過來 ──
me.data.uv_layers.new(name='bake'); me.data.uv_layers.active=me.data.uv_layers['bake']
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=me; me.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(75), island_margin=0.008, area_weight=0.3)
bpy.ops.object.mode_set(mode='OBJECT')
# 覆蓋遮罩:白色自發光烘到黑底、不留邊 → 哪些像素真的被模型用到。之後的烘焙都不留邊,沒覆蓋到的由下面自己往外擴散補色
def bake_cover():
  nt0=me.data.materials[0].node_tree; o0=[n for n in nt0.nodes if n.type=='OUTPUT_MATERIAL'][0]; k0=o0.inputs['Surface'].links[0].from_socket
  e0=nt0.nodes.new('ShaderNodeEmission'); e0.inputs['Color'].default_value=(1,1,1,1); nt0.links.new(e0.outputs[0],o0.inputs['Surface'])
  ci=bpy.data.images.new('cover',RES,RES); ci.pixels.foreach_set(np.tile(np.array([0,0,0,1],dtype=np.float32),RES*RES))
  t0=nt0.nodes.new('ShaderNodeTexImage'); t0.image=ci; nt0.nodes.active=t0
  bpy.ops.object.bake(type='EMIT')
  nt0.links.new(k0,o0.inputs['Surface']); nt0.nodes.remove(e0); nt0.nodes.remove(t0)
  return np.array(ci.pixels[:],dtype=np.float32).reshape(RES,RES,4)[...,0]>0.5
def fill_out(px,cover):   # 沒覆蓋到的像素用旁邊已覆蓋的顏色一圈一圈往外填
  M=~cover.copy(); c=px[...,:3]
  for _ in range(600):   # 2048 時空隙比較寬
    if not M.any(): break
    v=(~M).astype(np.float32)[...,None]; acc=np.zeros_like(c); cnt=np.zeros_like(v)
    for ax,sh in ((0,1),(0,-1),(1,1),(1,-1)): acc+=np.roll(c*v,sh,ax); cnt+=np.roll(v,sh,ax)
    grow=M&(cnt[...,0]>0); c[grow]=acc[grow]/cnt[grow]; M&=~grow
  return int(M.sum())
img=bpy.data.images.new('Bunny_bake',RES,RES)
SRCOBJ=bpy.data.objects['Src']
snt=SRCOBJ.data.materials[0].node_tree; stex=[l.from_node for l in snt.links if l.to_socket.name=='Base Color' and l.from_node.type=='TEX_IMAGE'][0];   # 顏色貼圖(不是法線 / 粗糙度)
sout=[n for n in snt.nodes if n.type=='OUTPUT_MATERIAL'][0]
sem=snt.nodes.new('ShaderNodeEmission'); snt.links.new(stex.outputs['Color'],sem.inputs['Color']); snt.links.new(sem.outputs[0],sout.inputs['Surface'])
nt=me.data.materials[0].node_tree
src=[n for n in nt.nodes if n.type=='TEX_IMAGE'][0]; out=[n for n in nt.nodes if n.type=='OUTPUT_MATERIAL'][0]
keep=out.inputs['Surface'].links[0].from_socket
tgt=nt.nodes.new('ShaderNodeTexImage'); tgt.image=img; nt.nodes.active=tgt
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=16; sc.cycles.device='CPU'   # 多取樣:色塊邊緣才有抗鋸齒
sc.render.bake.margin=0; sc.render.bake.use_clear=False
# 顏色轉移:新網格每個貼圖像素 → 3D 位置(用推平前的形狀,和原模型貼合)→ 原模型表面「最近的一點」→ 取原貼圖的顏色
#   不用 Blender 的投射烘焙:手臂和袖子、背帶之間的夾縫被體素重建補起來後,投射光線會穿到底下藏住的那一層,
#   取到沒人看過、亂七八糟的貼圖(背帶裡的黃色斑點、交界的條紋)。最近點只會落在最貼近的那層表面上
from mathutils.bvhtree import BVHTree
# 原模型被手臂、腿壓住的地方(腋下、袖子內側、大腿根):生成時看不到,貼圖是亂畫的;動起來手一抬就露出來(背帶裡的黃色斑點)
#   → 找出「離別的部位很近、而且被遮住」的頂點,這些地方的顏色改用旁邊看得到的顏色延伸過去
from mathutils.kdtree import KDTree
def hidden_verts():
  mm=me.data; oc=np.zeros(len(mm.vertices)*3,dtype=np.float32); mm.attributes['orig_co'].data.foreach_get('vector',oc); oc=oc.reshape(-1,3).astype(np.float64)
  mm.calc_loop_triangles(); tri=np.array([t.vertices[:] for t in mm.loop_triangles])
  fn_=np.cross(oc[tri[:,1]]-oc[tri[:,0]],oc[tri[:,2]]-oc[tri[:,0]]); vn=np.zeros_like(oc)
  for k in range(3): np.add.at(vn,tri[:,k],fn_)
  vn/=np.maximum(np.linalg.norm(vn,axis=1,keepdims=True),1e-12)
  bvh=BVHTree.FromPolygons(oc.tolist(),tri.tolist())
  N=96; i=np.arange(N)+0.5; ph=np.arccos(1-2*i/N); th=np.pi*(1+5**0.5)*i
  D=np.c_[np.cos(th)*np.sin(ph),np.sin(th)*np.sin(ph),np.cos(ph)]
  GR={'arm.L':1,'arm.R':2,'leg.L':3,'leg.R':4}; gi={g.index:GR.get(g.name,0) for g in me.vertex_groups}
  part=np.zeros(len(oc),int); best=np.zeros(len(oc))
  for v in mm.vertices:
    for g in v.groups:
      if gi.get(g.group,0) and g.weight>best[v.index]: best[v.index]=g.weight; part[v.index]=gi[g.group]
  part[best<0.5]=0
  near=np.full(len(oc),9.0)
  for P_ in range(5):
    idx=np.nonzero(part==P_)[0]
    if not len(idx): continue
    kd=KDTree(len(idx))
    for j,k in enumerate(idx): kd.insert(oc[k],j)
    kd.balance()
    for k in np.nonzero(part!=P_)[0]: near[k]=min(near[k],kd.find(oc[k])[2])
  cand=np.nonzero(near<0.05)[0]; h=np.zeros(len(oc),np.float32)
  for k in cand:   # 只對靠近別的部位的頂點算遮蔽(半球 96 條光線,0.15 內有東西擋到就算遮住)
    n=vn[k]; w=D@n; sel=w>0.05; o=Vector(oc[k]+n*0.002); tot=fr=0
    for d,ww in zip(D[sel],w[sel]): tot+=ww; fr+=ww*(bvh.ray_cast(o,Vector(d),0.15)[0] is None)
    h[k]=1.0 if fr/tot<0.8 else 0.0
  print('hidden verts',int(h.sum()))
  global PARTV; PARTV=part
  return h
def fill_in(c,known,M):   # M 裡的像素用旁邊 known 的顏色一圈一圈往內延伸(只走 M 自己,不會跨到別的 UV 島)
  M=M.copy(); kn=known.copy()
  for _ in range(400):
    if not M.any(): break
    v=kn.astype(np.float32)[...,None]; acc=np.zeros_like(c); cnt=np.zeros_like(v)
    for ax,sh in ((0,1),(0,-1),(1,1),(1,-1)): acc+=np.roll(c*v,sh,ax); cnt+=np.roll(v,sh,ax)
    g=M&(cnt[...,0]>0); c[g]=acc[g]/cnt[g]; M&=~g; kn|=g
  return M
HIDV=hidden_verts()
def nearest_bake():
  dg=bpy.context.evaluated_depsgraph_get()
  sm=SRCOBJ.data; sm.calc_loop_triangles(); M=SRCOBJ.matrix_world
  sv=np.array([(M@v.co)[:] for v in sm.vertices]); stri=np.array([t.vertices[:] for t in sm.loop_triangles]); sloop=np.array([t.loops[:] for t in sm.loop_triangles])
  suv=np.zeros(len(sm.loops)*2,dtype=np.float32); sm.uv_layers.active.data.foreach_get('uv',suv); suv=suv.reshape(-1,2)
  bvh=BVHTree.FromPolygons(sv.tolist(),stri.tolist())
  si=stex.image; sw,sh=si.size; spx=np.array(si.pixels[:],dtype=np.float32).reshape(sh,sw,si.channels)[...,:3]
  mm=me.data; mm.calc_loop_triangles()
  oc=np.zeros(len(mm.vertices)*3,dtype=np.float32); mm.attributes['orig_co'].data.foreach_get('vector',oc); oc=oc.reshape(-1,3)
  oc=(np.array(me.matrix_world)[:3,:3]@oc.T).T+np.array(me.matrix_world)[:3,3]
  muv=np.zeros(len(mm.loops)*2,dtype=np.float32); mm.uv_layers['bake'].data.foreach_get('uv',muv); muv=muv.reshape(-1,2)
  out=np.zeros((RES,RES,3),dtype=np.float32); hit=np.zeros((RES,RES),bool); hid=np.zeros((RES,RES),np.float32); P=[]; Y=[]; X=[]; Hd=[]; Pt=[]
  for t in mm.loop_triangles:   # 光柵化:像素中心落在三角形裡(邊緣放寬一點,接縫不留縫)
    uv=muv[list(t.loops)]*RES-0.5; p3=oc[list(t.vertices)]
    x0,y0=np.floor(uv.min(0)).astype(int); x1,y1=np.ceil(uv.max(0)).astype(int)
    gx,gy=np.meshgrid(np.arange(max(0,x0),min(RES,x1+1)),np.arange(max(0,y0),min(RES,y1+1)))
    if gx.size==0: continue
    a,b,c=uv; d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(d)<1e-12: continue
    l0=((b[1]-c[1])*(gx-c[0])+(c[0]-b[0])*(gy-c[1]))/d; l1=((c[1]-a[1])*(gx-c[0])+(a[0]-c[0])*(gy-c[1]))/d; l2=1-l0-l1
    e=-0.6/max(1.0,np.abs(uv.max(0)-uv.min(0)).max()); ok=(l0>=e)&(l1>=e)&(l2>=e)
    if not ok.any(): continue
    L=np.clip(np.stack([l0[ok],l1[ok],l2[ok]],1),0,None); L/=L.sum(1,keepdims=True)
    P.append(L@p3); Y.append(gy[ok]); X.append(gx[ok]); Hd.append(L@HIDV[list(t.vertices)]); Pt.append(np.full(ok.sum(),PARTV[t.vertices[int(np.argmax(L.sum(0)))]]))
  P=np.concatenate(P); Y=np.concatenate(Y); X=np.concatenate(X)
  loc=np.zeros_like(P); fi=np.zeros(len(P),dtype=np.int64); fn=bvh.find_nearest
  for i,p in enumerate(P.tolist()):
    r=fn(p); loc[i]=r[0]; fi[i]=r[2]
  # 最近點在原三角形上的重心座標 → 原 UV → 雙線性取色
  A,B,Cc=sv[stri[fi,0]],sv[stri[fi,1]],sv[stri[fi,2]]
  v0,v1,v2=B-A,Cc-A,loc-A
  d00=(v0*v0).sum(1); d01=(v0*v1).sum(1); d11=(v1*v1).sum(1); d20=(v2*v0).sum(1); d21=(v2*v1).sum(1); den=np.maximum(d00*d11-d01*d01,1e-20)
  w1=(d11*d20-d01*d21)/den; w2=(d00*d21-d01*d20)/den; w0=1-w1-w2
  U=w0[:,None]*suv[sloop[fi,0]]+w1[:,None]*suv[sloop[fi,1]]+w2[:,None]*suv[sloop[fi,2]]
  fx=(U[:,0]%1)*sw-0.5; fy=(U[:,1]%1)*sh-0.5; ix=np.floor(fx).astype(int); iy=np.floor(fy).astype(int); tx=(fx-ix)[:,None]; ty=(fy-iy)[:,None]
  g=lambda yy,xx: spx[np.clip(yy,0,sh-1),np.clip(xx,0,sw-1)]
  col=(g(iy,ix)*(1-tx)+g(iy,ix+1)*tx)*(1-ty)+(g(iy+1,ix)*(1-tx)+g(iy+1,ix+1)*tx)*ty
  out[Y,X]=col; hit[Y,X]=True; hid[Y,X]=np.concatenate(Hd)
  global POS,PARTT; POS=np.zeros((RES,RES,3),np.float32); POS[Y,X]=P; PARTT=np.full((RES,RES),-1,np.int8); PARTT[Y,X]=np.concatenate(Pt)
  return out,hit,hid
_c,COVER,HIDT=nearest_bake()
HIDT=COVER&(HIDT>0.5)
from rig_strap import strap_mask, bag_texel, build_strap
# 背帶抹掉只對 strap_erase 的角色做(熊、狗):其他角色的背帶是凸起的一層模型、顏色又和背包/毛色太近,抹了反而留線和色塊
if C.get('strap_erase') or os.environ.get('STRAP_DBG'): STRAP,STRAPC=strap_mask(_c,COVER,POS,PARTT,C)
else: STRAP,STRAPC=np.zeros_like(COVER),np.zeros(3,np.float32)
_y,_z=POS[...,1],POS[...,2]
BAGM=COVER&(PARTT==0)&(_y>C['bag_y'][0]+0.05)&(_z>C['chest'][0])&(_z<C['head'][0]-0.03)
STRAP_UV=bag_texel(BAGM,_c,STRAPC,RES) if STRAP.any() else None
if os.environ.get('STRAP_DBG'): _c[STRAP]=(1,0,1)
else: HIDT=HIDT|STRAP   # 原本的背帶抹掉(不補 3D 帶子;STRAP_GEO=1 才補)
_c[HIDT]=0; COVER=COVER&~fill_in(_c,COVER&~HIDT,HIDT)   # 整塊都被遮住、延伸不到的,交給最後的 fill_out 從外面補
# 一圈一圈往內延伸會拉出一絲一絲的毛邊 → 再反覆取上下左右平均(外圈固定),延伸區變成平順的漸層
_H=HIDT&COVER; _w=COVER.astype(np.float32)[...,None]   # 只拿模型上的像素平均(UV 島外的空白還是黑的,混進來會變髒的暗斑)
for _ in range(300):
  _cw=_c*_w; _s=np.roll(_cw,1,0)+np.roll(_cw,-1,0)+np.roll(_cw,1,1)+np.roll(_cw,-1,1); _n=np.roll(_w,1,0)+np.roll(_w,-1,0)+np.roll(_w,1,1)+np.roll(_w,-1,1)
  _g=_H&(_n[...,0]>0); _c[_g]=(_s/np.maximum(_n,1))[_g]
# 背帶抹掉的地方:往旁邊延伸會把手臂皮膚、毛色拉進來變成一條條白紋 → 直接塗附近衣服的顏色
#   衣服色 = 背帶外圍一圈的中位色;每個像素再取附近(25x25)外圍裡和衣服色相近的平均,保留一點明暗
if not os.environ.get('STRAP_DBG') and STRAP.any():
  from rig_strap import dil
  _ring=dil(STRAP,10)&~dil(STRAP,4)&COVER&(PARTT>=0)&(PARTT<=2)&(np.linalg.norm(_c-STRAPC,axis=-1)>0.2)
  _shirt=np.median(_c[_ring],0); _ring&=np.linalg.norm(_c-_shirt,axis=-1)<0.2
  # 背帶側面、邊緣反鋸齒常在別的 UV 島上,貼圖上不相鄰 → 改用 3D 距離抓:離原本背帶 0.03 內、顏色不像衣服的也抹
  _q=0.03; _k=lambda P:np.floor(P/_q).astype(np.int64)
  _key=lambda g:(g[...,0]*2003+g[...,1])*2003+g[...,2]
  _g0=_k(POS[STRAP]); _vox=np.unique(np.concatenate([_key(_g0+np.array(d)) for d in np.ndindex(3,3,3) for d in [np.array(d)-1]]))
  _zone=COVER&(PARTT>=0)&(PARTT<=2)&(POS[...,1]<C['bag_y'][0]-0.05)&(POS[...,2]<C['head'][0]+0.02)&(POS[...,2]>C['hips'][0])
  _dS=np.linalg.norm(_c-_shirt,axis=-1); _dB=np.linalg.norm(_c-STRAPC,axis=-1)
  _near=np.zeros_like(STRAP); _zi=np.flatnonzero(_zone); _near.flat[_zi]=np.isin(_key(_k(POS.reshape(-1,3)[_zi])),_vox)
  _x=_near&~STRAP&(_dS>0.15)&((PARTT==0)|(_dB<_dS))   # 手臂上只抹比較像背帶的(手掌的膚色不動)
  print('strap 3D extra px',int(_x.sum())); STRAP=STRAP|_x
  def _box(a,r=12):
    a=np.pad(a,((r+1,r),(r+1,r))+((0,0),)*(a.ndim-2)); s_=a.cumsum(0).cumsum(1); n=2*r+1
    return s_[n:,n:]-s_[:-n,n:]-s_[n:,:-n]+s_[:-n,:-n]
  _sum=_box(_c*_ring[...,None]); _cnt=_box(_ring.astype(np.float32))
  _loc=np.where(_cnt[...,None]>20,_sum/np.maximum(_cnt,1)[...,None],_shirt)
  _S=STRAP&COVER; _c[_S]=_loc[_S]
  print('shirt color',(_shirt*255).round(),'ring px',int(_ring.sum()))
# 細碎雜色:原模型背帶和袖口交界的夾縫裡,兩層顏色交錯成一條條的細紋。
#   先把顏色分成幾群(色票),某個像素的顏色群在附近 9x9 只佔不到兩成 → 是夾在別的顏色裡的細紋 → 換成附近主要顏色群的平均色
#   (只換細紋;正常的明暗漸層、交界都不動。只數有用到的像素,UV 島之間的空白不投票)
def despeckle(c,cover,k=8,r=4,frac=0.2):
  rng=np.random.default_rng(0); idx=np.flatnonzero(cover); smp=c.reshape(-1,3)[rng.choice(idx,min(200000,len(idx)),replace=False)]
  cen=smp[rng.choice(len(smp),k,replace=False)]
  for _ in range(20):
    lab=((smp[:,None]-cen[None])**2).sum(-1).argmin(1)
    cen=np.array([smp[lab==j].mean(0) if (lab==j).any() else cen[j] for j in range(k)])
  lab=np.full(cover.shape,-1); cc=c[cover]; lab[cover]=((cc[:,None]-cen[None])**2).sum(-1).argmin(1)
  def box(a):
    a=np.pad(a,((r+1,r),(r+1,r))+((0,0),)*(a.ndim-2)); s_=a.cumsum(0).cumsum(1); n=2*r+1
    return s_[n:,n:]-s_[:-n,n:]-s_[n:,:-n]+s_[:-n,:-n]
  cnt=np.stack([box((lab==j).astype(np.float32)) for j in range(k)],-1); tot=np.maximum(cnt.sum(-1),1)
  own=np.take_along_axis(cnt,np.clip(lab,0,None)[...,None],-1)[...,0]/tot; maj=cnt.argmax(-1)
  bad=cover&(own<frac)&(maj!=lab)
  out=c.copy()
  for j in range(k):
    m=bad&(maj==j)
    if not m.any(): continue
    w=(lab==j).astype(np.float32); avg=box(c*w[...,None])/np.maximum(box(w),1)[...,None]; out[m]=avg[m]
  print('despeckled px',int(bad.sum()))
  return out
_c=despeckle(_c,COVER)   # 只跑一輪、範圍小:範圍放大(15x15、三成)會把色塊交界啃成毛邊
_px=np.zeros((RES,RES,4),dtype=np.float32); _px[...,:3]=_c; _px[...,3]=1
img.pixels.foreach_set(_px.ravel())
print('nearest bake texels',int(COVER.sum()),'hidden repainted',int(HIDT.sum()))
me.data.attributes.remove(me.data.attributes['orig_co'])
src.image=img; nt.nodes.remove(tgt)
bpy.data.objects.remove(SRCOBJ)   # 原模型用完就丟,不要跟著匯出
for u in [u for u in me.data.uv_layers if u.name!='bake']: me.data.uv_layers.remove(u)   # 體素重建留下的舊 UV 沒用,留著匯出時會被當成主要 UV
img.filepath_raw=OUT+'.baked.png'; img.file_format='PNG'; img.save()
print('baked', img.size[:], 'uv', [u.name for u in me.data.uv_layers])
W,H=img.size; px=np.array(img.pixels[:],dtype=np.float32).reshape(H,W,4)
lum=px[...,:3]@np.array([.3,.59,.11],dtype=np.float32)
dark=(px[...,:3].max(-1)<0.55)&(px[...,:3].max(-1)-px[...,:3].min(-1)<0.15)&(px[...,0]-px[...,2]<0.06)   # 黑色和烘焙後糊成灰的五官邊緣;只抓中性的黑(貓的深棕色鬍鬚偏暖,要留著)
# 新貼圖沒用到的空白處也是黑的 → 只留「小塊」的黑色(眼睛、嘴巴),大片相連的是空白
def small_blobs(m, limit=40000, core=None):   # 上限要跟著貼圖解析度放大(2048 時一隻眼睛就超過 5000 px)
  seen=np.zeros_like(m); keep=np.zeros_like(m); Hh,Ww=m.shape
  for y0,x0 in zip(*np.nonzero(m)):
    if seen[y0,x0]: continue
    st=[(y0,x0)]; seen[y0,x0]=True; comp=[]
    while st:
      y,x=st.pop(); comp.append((y,x))
      for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
        yy,xx=y+dy,x+dx
        if 0<=yy<Hh and 0<=xx<Ww and m[yy,xx] and not seen[yy,xx]: seen[yy,xx]=True; st.append((yy,xx))
    if len(comp)<limit and (core is None or any(core[y,x] for y,x in comp)):
      for y,x in comp: keep[y,x]=True
      # 線條圍起來的內部也算(張開的嘴裡面的舌頭):從外框往內灌,灌不到的就是被圍住的
      cy,cx=np.array(comp).T; y0b,y1b,x0b,x1b=cy.min(),cy.max()+1,cx.min(),cx.max()+1
      box=np.zeros((y1b-y0b+2,x1b-x0b+2),bool); box[cy-y0b+1,cx-x0b+1]=True
      out=np.zeros_like(box); out[0,:]=out[-1,:]=out[:,0]=out[:,-1]=True; fr=list(zip(*np.nonzero(out)))
      while fr:
        y,x=fr.pop()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
          yy,xx=y+dy,x+dx
          if 0<=yy<box.shape[0] and 0<=xx<box.shape[1] and not box[yy,xx] and not out[yy,xx]: out[yy,xx]=True; fr.append((yy,xx))
      hy,hx=np.nonzero(~out&~box); keep[hy+y0b-1,hx+x0b-1]=True
  return keep
dark=small_blobs(dark&COVER, core=(px[...,:3].max(-1)<0.22)&(px[...,0]-px[...,2]<0.06))   # 只留中間有純黑核心的(眼睛、嘴巴)
if not C['feats']: dark[:]=False   # 無五官模型:沒有東西要塗
# 3D 位置:落在黑色像素上的 loop → 頂點座標(用來對齊表情貼片上五官的位置)
uvl=me.data.uv_layers.active.data; pts=[]
for poly in me.data.polygons:
  for li in poly.loop_indices:
    u,v=uvl[li].uv; x=min(W-1,int(u*W)); y=min(H-1,int(v*H))
    if dark[y,x]: pts.append(me.matrix_world@me.data.vertices[me.data.loops[li].vertex_index].co)
pts=np.array([p[:] for p in pts])
if len(pts)==0: pts=np.zeros((0,3))   # 無五官模型:沒有黑色點
for name,m in (('eye.R',(pts[:,0]<-0.1)&(pts[:,2]>-0.09)),('eye.L',(pts[:,0]>0.1)&(pts[:,2]>-0.09)),('mouth',(abs(pts[:,0])<0.12)&(pts[:,2]<-0.07))):
  q=pts[m]
  if len(q): print('FEAT',name,len(q),'center',q.mean(0).round(3),'min',q.min(0).round(3),'max',q.max(0).round(3))   # 只是印出來參考(範圍是照兔子寫的)
# 塗掉:黑色區域往外擴 3px,用外圈的毛色平均填

def dil(m,r):
  o=m.copy()
  for dy in range(-r,r+1):
    for dx in range(-r,r+1):
      if dx*dx+dy*dy<=r*r: o|=np.roll(np.roll(m,dy,0),dx,1)
  return o
D=dil(dark,14); ring=dil(D,4)&~D   # 烘焙後五官邊緣糊開好幾 px(2048 時更寬),往外多吃一點才不會留下嘴角之類的殘線
fur=ring&(lum>0.8)&((px[...,:3].max(-1)-px[...,:3].min(-1))<0.12)
# 初值:每一塊塗抹區各自用「緊貼外圍那一圈」的平均色(2048 時眼睛很大,只看附近 20px 的話中心取不到)
Bd=dil(D,1)&~D
seen=np.zeros_like(D)
for y0,x0 in zip(*np.nonzero(D)):
  if seen[y0,x0]: continue
  st=[(y0,x0)]; seen[y0,x0]=True; comp=[]
  while st:
    y,x=st.pop(); comp.append((y,x))
    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
      yy,xx=y+dy,x+dx
      if 0<=yy<H and 0<=xx<W and D[yy,xx] and not seen[yy,xx]: seen[yy,xx]=True; st.append((yy,xx))
  cy,cx=np.array(comp).T; y0b,y1b,x0b,x1b=max(0,cy.min()-2),min(H,cy.max()+3),max(0,cx.min()-2),min(W,cx.max()+3)
  rb=Bd[y0b:y1b,x0b:x1b]
  if rb.any(): px[cy,cx,:3]=px[y0b:y1b,x0b:x1b][rb][:,:3].mean(0)
# 再反覆取上下左右平均(外圈固定不動):補的顏色會和周圍的明暗漸層自然接起來,不會一塊一塊
c=px[...,:3]
for _ in range(400):
  avg=(np.roll(c,1,0)+np.roll(c,-1,0)+np.roll(c,1,1)+np.roll(c,-1,1))*0.25
  c[D]=avg[D]
img.pixels.foreach_set(px.ravel()); img.update(); img.pack()
# 空白處(洋紅)用旁邊島塊的顏色一圈一圈往外填滿:貼圖縮小取樣時接縫才不會滲出別的顏色
left=fill_out(px,COVER)
print('fill left',left)
# 色塊重新分類:舊的 Meshy 兔子貼圖很髒才需要(交界毛邊、白點)。Tripo 的原貼圖本來就是乾淨色塊,重分類反而會把邊緣弄碎 → 關掉
CLASSIFY=False
if CLASSIFY:
  # ── 色塊整理:生成貼圖的顏色交界有毛邊、白色雜點,書包上還畫了深淺陰影。整理成三類(淺色 / 黃 / 藍):
  #    多數決讓交界平順、雜點被周圍吃掉;黃和藍用純色(明暗交給遊戲的卡通光影),淺色保留原本的漸層(腮紅、耳朵內側)
  def box(a,r):   # 方框模糊(積分圖),邊界用重複邊緣
    a=np.pad(a,((r+1,r),(r+1,r),(0,0)),mode='edge'); c=a.cumsum(0).cumsum(1)
    n=2*r+1; return (c[n:,n:]-c[:-n,n:]-c[n:,:-n]+c[:-n,:-n])/(n*n)
  PAL=np.array([[251,228,203],[244,192,58],[17,63,177]],dtype=np.float32)/255
  rgb=px[...,:3]
  lab=((rgb[:,:,None,:]-PAL[None,None])**2).sum(-1).argmin(-1)
  oh=np.eye(3,dtype=np.float32)[lab]
  for r in (3,3,2): oh=np.eye(3,dtype=np.float32)[box(oh,r).argmax(-1)]   # 多數決
  light0=(lab==0)&(oh[...,0]>0)&(rgb[...,0]>=rgb[...,2]+0.02)   # 原本就是暖色淺色(米白、粉紅)、整理後也還是淺色的像素;偏藍灰的是滲色,不算
  num=box(rgb*light0[...,None],6); den=box(light0[...,None].astype(np.float32),6)
  lc=np.where(den>0.05,num/np.maximum(den,1e-6),PAL[0])
  lc=np.where(light0[...,None],rgb,lc)   # 淺色像素保留原色,被翻成淺色的(雜點)用周圍淺色的平均
  w=box(oh,1)   # 交界反鋸齒
  px[...,:3]=w[...,0:1]*lc+w[...,1:2]*PAL[1]+w[...,2:3]*PAL[2]
  print('palette cleanup done, light/yellow/blue %', (oh.mean((0,1))*100).round(1))
  # ── 色塊邊界改在 3D 網格上決定:脖子、袖口這些交界剛好落在 UV 塊的邊上,貼圖上的多數決跨不過接縫,會留下碎片。
  #    每個頂點取它在貼圖上的類別,沿網格相鄰關係平滑後決定顏色,再烘回貼圖(邊界沿著模型表面走,不會碎)
  nL=len(me.data.loops); uvs=np.zeros(nL*2,dtype=np.float32); me.data.uv_layers['bake'].data.foreach_get('uv',uvs); uvs=uvs.reshape(-1,2)
  lv=np.zeros(nL,dtype=np.int64); me.data.loops.foreach_get('vertex_index',lv)
  xs=np.clip((uvs[:,0]*W).astype(int),0,W-1); ys=np.clip((uvs[:,1]*H).astype(int),0,H-1)
  nV=len(me.data.vertices); vw=np.zeros((nV,3),dtype=np.float32); np.add.at(vw,lv,oh[ys,xs])
  vw/=np.maximum(vw.sum(1,keepdims=True),1e-6)
  ed=np.zeros(len(me.data.edges)*2,dtype=np.int64); me.data.edges.foreach_get('vertices',ed); ea,eb=ed[0::2],ed[1::2]
  deg=np.bincount(np.r_[ea,eb],minlength=nV).astype(np.float32)[:,None]
  def msmooth(w,n):
    for _ in range(n):
      acc=np.zeros_like(w); np.add.at(acc,ea,w[eb]); np.add.at(acc,eb,w[ea]); w=0.5*w+0.5*acc/np.maximum(deg,1)
    return w
  sm=msmooth(vw,8); cls=sm.argmax(1)   # 網格上的多數決(次數多一點,邊界才會順)
  vz=np.zeros(nV*3,dtype=np.float32); me.data.vertices.foreach_get('co',vz); vz=vz.reshape(-1,3)[:,2]
  # 夾在黃、藍之間的淺色細線(原圖交界畫的白色過渡)→ 改成旁邊比較多的那個顏色
  nthin=0
  for _ in range(2):   # 兩輪:兩三個頂點寬的白邊也收得掉
    thin=(cls==0)&(sm[:,1]+sm[:,2]>0.35)&(vz<-0.32); cls[thin]=np.where(sm[thin,2]>sm[thin,1],2,1); nthin+=int(thin.sum())
    sm=msmooth(np.eye(3,dtype=np.float32)[cls],2)
  thin=np.zeros(nV,bool); thin[:nthin]=True
  cls[vz>-0.32]=0   # 頭(含下巴往內收的地方)和耳朵一律淺色:衣服的藍不會爬上下巴
  print('thin light fixed',int(thin.sum()))
  vw=np.eye(3,dtype=np.float32)[cls]
  vw=msmooth(vw,2)   # 交界留一點過渡,烘焙時再用 smoothstep 收成俐落的邊
  ca=me.data.color_attributes.new('cls','FLOAT_COLOR','POINT'); ca.data.foreach_set('color',np.c_[vw,np.ones(nV)].astype(np.float32).ravel())
  # 淺色區的漸層圖(lc:非淺色處已經用周圍淺色補好)
  lci=bpy.data.images.new('LC',W,H); lci.pixels.foreach_set(np.c_[lc.reshape(-1,3),np.ones(W*H)].astype(np.float32).ravel())
  img2=bpy.data.images.new('Bunny_clean',W,H)
  def lin(c): c=np.asarray(c)/255; return tuple(np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4))+(1,)
  N=nt.nodes; Lk=nt.links.new
  at=N.new('ShaderNodeAttribute'); at.attribute_name='cls'; sp=N.new('ShaderNodeSeparateColor'); Lk(at.outputs['Color'],sp.inputs[0])
  tl=N.new('ShaderNodeTexImage'); tl.image=lci
  cols=[tl.outputs['Color']]
  for c in (PAL[1]*255,PAL[2]*255): r=N.new('ShaderNodeRGB'); r.outputs[0].default_value=lin(c); cols.append(r.outputs[0])
  acc=None; wsum=None
  for i,(ch,col) in enumerate(zip(('Red','Green','Blue'),cols)):
    mr=N.new('ShaderNodeMapRange'); mr.interpolation_type='SMOOTHSTEP'; mr.inputs['From Min'].default_value=0.3; mr.inputs['From Max'].default_value=0.7; Lk(sp.outputs[ch],mr.inputs['Value'])
    sc_=N.new('ShaderNodeVectorMath'); sc_.operation='SCALE'; Lk(col,sc_.inputs[0]); Lk(mr.outputs['Result'],sc_.inputs['Scale'])
    if acc is None: acc=sc_.outputs[0]; wsum=mr.outputs['Result']
    else:
      a2=N.new('ShaderNodeVectorMath'); a2.operation='ADD'; Lk(acc,a2.inputs[0]); Lk(sc_.outputs[0],a2.inputs[1]); acc=a2.outputs[0]
      m2=N.new('ShaderNodeMath'); m2.operation='ADD'; Lk(wsum,m2.inputs[0]); Lk(mr.outputs['Result'],m2.inputs[1]); wsum=m2.outputs[0]
  mx_=N.new('ShaderNodeMath'); mx_.operation='MAXIMUM'; mx_.inputs[1].default_value=1e-4; Lk(wsum,mx_.inputs[0])
  dv=N.new('ShaderNodeVectorMath'); dv.operation='DIVIDE'; Lk(acc,dv.inputs[0]); Lk(mx_.outputs[0],dv.inputs[1])
  em=N.new('ShaderNodeEmission'); Lk(dv.outputs[0],em.inputs['Color']); Lk(em.outputs[0],out.inputs['Surface'])
  tg=N.new('ShaderNodeTexImage'); tg.image=img2; N.active=tg
  bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=me; me.select_set(True)
  bpy.ops.object.bake(type='EMIT')
  Lk(keep,out.inputs['Surface']); src.image=img2
  for n in list(N):
    if n.type in ('ATTRIBUTE','SEPARATE_COLOR','RGB','MAP_RANGE','VECTOR_MATH','MATH','EMISSION') or n in (tl,tg): N.remove(n)
  me.data.color_attributes.remove(me.data.color_attributes['cls'])
  img=img2; px=np.array(img.pixels[:],dtype=np.float32).reshape(H,W,4)
  left=fill_out(px,COVER)
  print('mesh-space classes baked; fill left',left)
img.pixels.foreach_set(px.ravel()); img.update(); img.pack()   # pack 要在最後:匯出用的是 pack 起來的資料
img.filepath_raw=OUT+'.final.png'; img.file_format='PNG'; img.save()
print('erased px',int(D.sum()))
if os.environ.get('STRAP_GEO'): build_strap(me,POS,STRAP,STRAP_UV,C,PARTV,POS[BAGM])
# 表情貼片:臉前面那一塊的面複製一份,沿法線往外推一點,UV 用正面平面投影
X0,X1,Z0,Z1=C['face_box']
bpy.context.view_layer.objects.active=me
fm=bpy.data.materials.new('Face'); fm.use_nodes=True; fm.blend_method='BLEND'; me.data.materials.append(fm); FI=len(me.data.materials)-1
bm=bmesh.new(); bm.from_mesh(me.data); bm.normal_update()
NY=C.get('face_ny',-0.25)
sel=[f for f in bm.faces if X0<=f.calc_center_median().x<=X1 and Z0<=f.calc_center_median().z<=Z1 and f.normal.y<NY and f.calc_center_median().y<-0.15]
r=bmesh.ops.duplicate(bm,geom=sel)
nf=[g for g in r['geom'] if isinstance(g,bmesh.types.BMFace)]; nv=[g for g in r['geom'] if isinstance(g,bmesh.types.BMVert)]
for v in nv: v.co+=v.normal*0.006
uvl=bm.loops.layers.uv.active
for f in nf:
  f.material_index=FI
  for l in f.loops: l[uvl].uv=((l.vert.co.x-X0)/(X1-X0),(l.vert.co.z-Z0)/(Z1-Z0))
bm.to_mesh(me.data); bm.free()
print('face patch faces',len(nf))
bpy.ops.wm.save_as_mainfile(filepath=OUT)
