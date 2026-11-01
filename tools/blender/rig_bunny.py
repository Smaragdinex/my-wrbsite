# 用法:blender -b -P rig_bunny.py -- tools/blender/assets/bunny_tripo_v1.glb <輸出 .blend>(Tripo 生成的兔子;舊的 Meshy 版是 bunny_meshy_v1.glb,座標不同)
# 兔子綁骨架:建骨架 → 自動權重 → 存 .blend
import bpy, sys, math
from mathutils import Vector
a=sys.argv[sys.argv.index('--')+1:]; SRC,OUT=a[0],a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
me=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]; me.name='Bunny'
# 統一尺寸:高 1.9、上下置中(骨頭和五官座標都用這套)
import mathutils
bb=[me.matrix_world@mathutils.Vector(c) for c in me.bound_box]; z0=min(v.z for v in bb); z1=max(v.z for v in bb)
me.data.transform(mathutils.Matrix.Scale(1.9/(z1-z0),4)@mathutils.Matrix.Translation((0,0,-(z0+z1)/2)))
# 重建網格:生成模型內部會自己穿插自己(衣領穿出下巴、背帶和衣服互插),穿插線近看是鋸齒、還會透出另一層顏色。
#   原模型留一份叫 Src(之後把顏色從它投射烘焙過來),本體用體素重建成一層乾淨外殼,再減面回原本的面數
import numpy as np
SRCOBJ=me.copy(); SRCOBJ.data=me.data.copy(); SRCOBJ.name='Src'; bpy.context.scene.collection.objects.link(SRCOBJ)
SRCOBJ.data.materials[0]=me.data.materials[0].copy()
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=me; me.select_set(True)
me.data.remesh_voxel_size=0.005; me.data.use_remesh_fix_poles=True; bpy.ops.object.voxel_remesh()
dec=me.modifiers.new('dec','DECIMATE'); dec.ratio=13000/len(me.data.polygons); bpy.ops.object.modifier_apply(modifier='dec')   # 減完再轉三角面會變兩倍:約 2.6 萬個三角面,和原模型差不多
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.quads_convert_to_tris()
bpy.ops.mesh.vertices_smooth(factor=0.5,repeat=2); bpy.ops.object.mode_set(mode='OBJECT')   # 抹掉體素的小台階
bpy.ops.object.shade_smooth()
print('remeshed faces',len(me.data.polygons),'verts',len(me.data.vertices),'mats',[m.name for m in me.data.materials])
vn=np.array([v.normal[:] for v in me.data.vertices])
# 法線:拿掉匯入時帶的自訂法線(原本接縫兩側不連續,卡通著色的明暗交界會出現鋸齒),改成整體平滑
# 五官抹平:生成模型把眼睛 / 嘴巴雕成凹凸,卡通光影會在邊緣打出亮圈。表情改由貼片畫,所以這幾處的網格抹平(半徑由大到小,邊緣才不會有台階)
import bmesh
FEATS=[(-0.217,-0.01),(0.217,-0.01),(0.0,-0.11)]   # (x, z),都在臉的正面(y < -0.3)
co=np.array([v.co[:] for v in me.data.vertices])
def ss(e0,e1,x): t=np.clip((x-e0)/(e1-e0),0,1); return t*t*(3-2*t)
for (fx,fz),rad in zip(FEATS,(0.11,0.11,0.09)):   # 半徑要比五官大一圈,邊緣才不會留下弧形凹痕
  d=np.hypot(co[:,0]-fx,co[:,2]-fz); front=co[:,1]<-0.3
  ring=front&(d>rad)&(d<rad*2.0)
  # 用五官外圍那一圈皮膚擬合球面:|p|^2 = 2c·p + k(線性最小平方)
  P=co[ring]; A=np.c_[2*P,np.ones(len(P))]; sol=np.linalg.lstsq(A,(P**2).sum(1),rcond=None)[0]
  c=sol[:3]; R=np.sqrt(sol[3]+c@c)
  inside=front&(d<rad); q=co[inside]; tgt=c+(q-c)/np.linalg.norm(q-c,axis=1)[:,None]*R
  w=1-ss(rad*0.65,rad,d[inside])
  co[inside]=q+(tgt-q)*w[:,None]
  sn=(co[inside]-c)/np.linalg.norm(co[inside]-c,axis=1)[:,None]; m=vn[inside]+(sn-vn[inside])*w[:,None]
  vn[inside]=m/np.linalg.norm(m,axis=1)[:,None]   # 推平的地方法線也換成球面的,光影才不會留下輪廓
  print('feature',fx,fz,'R',round(R,3),'moved',int(inside.sum()))
me.data.vertices.foreach_set('co',co.ravel()); me.data.update()
bpy.ops.object.shade_smooth(); me.data.normals_split_custom_set_from_vertices([tuple(n) for n in vn])
print('custom normals', me.data.has_custom_normals)
print('verts after merge',len(me.data.vertices))
B={ # name: (head, tail, parent)
 'root':((0,0,-0.95),(0,0,-0.82),None),
 'hips':((0,0,-0.80),(0,0,-0.58),'root'),
 'chest':((0,0,-0.58),(0,0,-0.36),'hips'),
 'head':((0,-0.04,-0.36),(0,-0.04,0.38),'chest'),
}
for s,x in (('L',1),('R',-1)):
 B[f'ear1.{s}']=((0.17*x,-0.03,0.34),(0.23*x,-0.03,0.66),'head')
 B[f'ear2.{s}']=((0.23*x,-0.03,0.66),(0.30*x,-0.03,0.95),f'ear1.{s}')
 B[f'arm.{s}']=((0.20*x,-0.06,-0.42),(0.50*x,-0.07,-0.60),'chest')   # 肩關節放在身體裡面:袖子跟著手臂一起轉,手才舉得起來
 B[f'leg.{s}']=((0.165*x,-0.04,-0.78),(0.165*x,-0.07,-0.95),'hips')
arm=bpy.data.objects.new('Rig',bpy.data.armatures.new('Rig')); bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm; bpy.ops.object.mode_set(mode='EDIT')
for n,(h,t,p) in B.items():
 e=arm.data.edit_bones.new(n); e.head=h; e.tail=t
 if p: e.parent=arm.data.edit_bones[p]; e.use_connect=(Vector(arm.data.edit_bones[p].tail)-Vector(h)).length<1e-4
for n in ('root',): arm.data.edit_bones[n].use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT'); me.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active=arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
groups={g.index:g.name for g in me.vertex_groups}
empty=sum(1 for v in me.data.vertices if not v.groups)
print('vertex groups',list(groups.values()),'unweighted',empty)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
# ── 修權重:自動權重會把書包和背帶算給手,舉手時書包被拉走 ──
def ss(e0,e1,x): t=max(0,min(1,(x-e0)/(e1-e0))); return t*t*(3-2*t)
vg={g.name:g for g in me.vertex_groups}
def W(v):
  return {me.vertex_groups[g.group].name:g.weight for g in v.groups}
for v in me.data.vertices:
  p=me.matrix_world@v.co; w=W(v)
  bag = ss(0.18,0.26,p.y)*(1-ss(-0.36,-0.30,p.z))   # 身體後面 = 書包
  for s in 'LR':
    k=f'arm.{s}'
    if k in w:
      keep=ss(0.22,0.33,abs(p.x))*(1-bag)   # 袖子也算手臂(漸層到肩膀)
      w['chest']=w.get('chest',0)+w[k]*(1-keep); w[k]*=keep
    k=f'leg.{s}'
    if k in w:
      keep=1-ss(-0.80,-0.74,p.z)
      w['hips']=w.get('hips',0)+w[k]*(1-keep); w[k]*=keep
  t=sum(w.values()) or 1
  for n,x in w.items():
    if x/t<1e-3: vg[n].remove([v.index])
    else: vg[n].add([v.index],x/t,'REPLACE')
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('weights cleaned')
