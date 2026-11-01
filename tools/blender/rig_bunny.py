# 用法:blender -b -P rig_bunny.py -- <Tripo glb> <輸出 .blend> <角色 key>(角色參數在 rig_chars.py;原檔在 tools/blender/assets/<key>_tripo_v1.glb)
# 兔子綁骨架:建骨架 → 自動權重 → 存 .blend
import bpy, sys, math
from mathutils import Vector
a=sys.argv[sys.argv.index('--')+1:]; SRC,OUT=a[0],a[1]; CH=a[2] if len(a)>2 else 'bunny'
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from rig_chars import CHARS; C=CHARS[CH]
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
FEATS=[(f[0],f[1]) for f in C['feats']]   # (x, z),都在臉的正面(y < -0.3)
co=np.array([v.co[:] for v in me.data.vertices])
def ss(e0,e1,x): t=np.clip((x-e0)/(e1-e0),0,1); return t*t*(3-2*t)
# 原本的位置存起來(face 腳本烘顏色時暫時換回原形狀,投射才會貼合原模型)
oc=me.data.attributes.new('orig_co','FLOAT_VECTOR','POINT'); oc.data.foreach_set('vector',co.astype(np.float32).ravel())
# 薄膜填補:五官範圍外的頂點固定,範圍內反覆取鄰居平均 → 不管凸起成什麼形狀都會變成平順的一片
nV=len(co); ed=np.zeros(len(me.data.edges)*2,dtype=np.int64); me.data.edges.foreach_get('vertices',ed); ea,eb=ed[0::2],ed[1::2]
deg=np.bincount(np.r_[ea,eb],minlength=nV).astype(np.float64)[:,None]
def nbr_avg(a):
  acc=np.zeros_like(a); np.add.at(acc,ea,a[eb]); np.add.at(acc,eb,a[ea]); return acc/np.maximum(deg,1)
mask=np.zeros(nV,bool)
for (fx,fz),rad in zip(FEATS,[f[2] for f in C['feats']]):
  m=(co[:,1]<-0.2)&(np.hypot(co[:,0]-fx,co[:,2]-fz)<rad); mask|=m
  print('feature',fx,fz,'moved',int(m.sum()))
for _ in range(400): co[mask]=nbr_avg(co)[mask]
# 法線:填補區用重算的(平順),外圍保留原本的,交界用鄰居平均抹勻
me.data.vertices.foreach_set('co',co.ravel()); me.data.update()
nn=np.zeros(nV*3); me.data.vertices.foreach_get('normal',nn); nn=nn.reshape(-1,3)
band=mask.copy()
for _ in range(3): band|=(nbr_avg(band[:,None].astype(float))[:,0]>0)
vn[mask]=nn[mask]
for _ in range(6): t=nbr_avg(vn); vn[band]=t[band]
vn/=np.linalg.norm(vn,axis=1)[:,None]
me.data.vertices.foreach_set('co',co.ravel()); me.data.update()
bpy.ops.object.shade_smooth(); me.data.normals_split_custom_set_from_vertices([tuple(n) for n in vn])
print('custom normals', me.data.has_custom_normals)
print('verts after merge',len(me.data.vertices))
B={ # name: (head, tail, parent)
 'root':((0,0,C['root'][0]),(0,0,C['root'][1]),None),
 'hips':((0,0,C['hips'][0]),(0,0,C['hips'][1]),'root'),
 'chest':((0,0,C['chest'][0]),(0,0,C['chest'][1]),'hips'),
 'head':((0,C['head'][2],C['head'][0]),(0,C['head'][2],C['head'][1]),'chest'),
}
for s,x in (('L',1),('R',-1)):
 M=lambda p:(p[0]*x,p[1],p[2])   # 左邊座標鏡射到右邊
 B[f'ear1.{s}']=(M(C['ear1'][0]),M(C['ear1'][1]),'head')
 B[f'ear2.{s}']=(M(C['ear1'][1]),M(C['ear2']),f'ear1.{s}')
 B[f'arm.{s}']=(M(C['arm'][0]),M(C['arm'][1]),'chest')   # 肩關節放在身體裡面:袖子跟著手臂一起轉,手才舉得起來
 B[f'leg.{s}']=(M(C['leg'][0]),M(C['leg'][1]),'hips')
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
  bag = ss(*C['bag_y'],p.y)*(1-ss(*C['bag_z'],p.z))   # 身體後面 = 書包
  for s in 'LR':
    k=f'arm.{s}'
    if k in w:
      keep=ss(*C['arm_x'],abs(p.x))*(1-bag)   # 袖子也算手臂(漸層到肩膀)
      w['chest']=w.get('chest',0)+w[k]*(1-keep); w[k]*=keep
    k=f'leg.{s}'
    if k in w:
      keep=1-ss(*C['leg_z'],p.z)
      w['hips']=w.get('hips',0)+w[k]*(1-keep); w[k]*=keep
  t=sum(w.values()) or 1
  for n,x in w.items():
    if x/t<1e-3: vg[n].remove([v.index])
    else: vg[n].add([v.index],x/t,'REPLACE')
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('weights cleaned')
