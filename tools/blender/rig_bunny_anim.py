# 用法:blender -b <rig_bunny_face.py 產生的 .blend> -P rig_bunny_anim.py -- <輸出 glb> [檢查圖資料夾]
# 兔子 5 個動作:Idle / Hop / Roll / Happy / Sad,匯出帶動畫的 glb
import bpy, sys, math
from mathutils import Vector, Quaternion
a=sys.argv[sys.argv.index('--')+1:]; OUT=a[0]; SHEET=a[1] if len(a)>1 else None
FPS=30; sc=bpy.context.scene; sc.render.fps=FPS
r=bpy.data.objects['Rig']; pb=r.pose.bones
for b in pb: b.rotation_mode='QUATERNION'
X,Y,Z=(1,0,0),(0,1,0),(0,0,1)
# 世界座標軸(Blender:+X=兔子的左手邊,-Y=正面,+Z=上)
#   點頭/耳朵往前折 = +X;手往前擺、腳往前踢 = -X;左手舉起 = -Y(右手 +Y);左耳往外 = +Y(右耳 -Y)
def q(n,rots):
  m=pb[n].bone.matrix_local.to_3x3().inverted(); out=Quaternion()
  for ax,deg in rots: out=Quaternion((m@Vector(ax)).normalized(),math.radians(deg))@out
  return out
def side(d,s): return d if s=='L' else -d
def pose(f,P):
  """P: {bone: [(axis,deg),...]} 或 root 的 ('loc',z) / ('scl',sz)"""
  for b in pb: b.rotation_quaternion=Quaternion(); b.location=(0,0,0); b.scale=(1,1,1)
  for n,v in P.items():
    if n=='rootloc': pb['root'].location=pb['root'].bone.matrix_local.to_3x3().inverted()@Vector((0,0,v))
    elif n=='squash': s=v; pb['root'].scale=(1/math.sqrt(s),s,1/math.sqrt(s))   # 骨頭 Y 軸 = 往上
    else: pb[n].rotation_quaternion=q(n,v)
  for b in pb:
    b.keyframe_insert('rotation_quaternion',frame=f)
    if b.name=='root': b.keyframe_insert('location',frame=f); b.keyframe_insert('scale',frame=f)
def clip(name,keys):
  act=bpy.data.actions.new(name); act.use_fake_user=True
  r.animation_data_create(); r.animation_data.action=act
  for f,P in keys: pose(f,P)
  return act
def ears(fwd=0,out=0,tip=0,ph=0):
  d={}
  for s in 'LR':
    d[f'ear1.{s}']=[(X,fwd),(Y,side(out,s))]
    d[f'ear2.{s}']=[(X,tip),(Y,side(out*0.4,s))]
  return d
REST=r.get('arm_rest',0)   # 模型是 T 字手:放鬆時往下垂 REST 度,越舉高越少(舉到 90 度時不受影響)
BIND=r.get('arm_bind',0)   # 模型手臂本來就比 T 字手低 BIND 度(A 字手):補回來,舉手才舉得一樣高
def arms(fwdL=0,upL=0,fwdR=0,upR=0):
  upL,upR=[u-REST*(1-u/90)+BIND for u in (upL,upR)]
  return {'arm.L':[(X,-fwdL),(Y,-upL)],'arm.R':[(X,-fwdR),(Y,upR)]}
def M(*ds):
  o={}
  for d in ds: o.update(d)
  return o
# ── Idle:2 秒循環,呼吸 + 左右輕晃 + 耳朵慢半拍 ──
K=[]
for i in range(0,61,6):
  t=i/60*2*math.pi; s=math.sin(t); c=math.cos(t)
  K.append((i,M({'squash':1+0.015*math.sin(2*t),'hips':[(Y,2.5*s)],'head':[(Y,-3*s),(X,1.5*math.sin(2*t))]},
             ears(fwd=-3+3*math.sin(2*t-0.8),out=4+4*math.sin(t-1.0),tip=4*math.sin(2*t-1.4)),
             arms(fwdL=4*s,upL=6+2*math.sin(2*t),fwdR=-4*s,upR=6+2*math.sin(2*t)))))
clip('Idle',K)
# ── Hop:往前跳(遊戲會讓角色轉向前進方向)。第 13 格落地,遊戲用 HOP_LAND 對齊 ──
#   蹲低前傾、手往後 → 蹬地:身體往前衝、腳往後蹬、手往前甩、耳朵被風往後吹 → 空中收腳 → 落地壓扁、耳朵往前甩
clip('Hop',[
 (0, M({'squash':1.0},ears(),arms(upL=6,upR=6))),
 (3, M({'squash':0.82,'hips':[(X,6)],'chest':[(X,10)],'head':[(X,-6)]},ears(fwd=10,out=6),arms(fwdL=-35,upL=12,fwdR=-35,upR=12))),
 (6, M({'squash':1.14,'hips':[(X,14)],'chest':[(X,6)],'head':[(X,-8)],'leg.L':[(X,35)],'leg.R':[(X,28)]},ears(fwd=-30,out=8,tip=-20),arms(fwdL=45,upL=25,fwdR=45,upR=25))),
 (10,M({'squash':1.04,'hips':[(X,6)],'leg.L':[(X,-28)],'leg.R':[(X,-22)]},ears(fwd=-22,out=12,tip=-12),arms(fwdL=20,upL=40,fwdR=20,upR=40))),
 (13,M({'squash':0.84,'hips':[(X,8)],'chest':[(X,8)],'leg.L':[(X,-8)],'leg.R':[(X,-8)]},ears(fwd=8,out=6,tip=6),arms(fwdL=15,upL=18,fwdR=15,upR=18))),
 (16,M({'squash':1.04,'hips':[(X,-3)]},ears(fwd=-8,tip=-8),arms(upL=8,upR=8))),
 (20,M({'squash':1.0},ears(),arms(upL=6,upR=6))),
])
# ── Roll:擲骰子,右手往後拉 → 往前上甩出去 ──
clip('Roll',[
 (0, M({},ears(),arms(upL=6,upR=6))),
 (7, M({'squash':0.94,'chest':[(Z,-14),(X,4)],'head':[(Z,8)]},ears(fwd=-6,out=4),arms(fwdL=20,upL=14,fwdR=-40,upR=24))),
 (12,M({'squash':1.06,'chest':[(Z,12),(X,-6)],'head':[(X,-6)]},ears(fwd=-14,out=8,tip=-10),arms(fwdL=-10,upL=10,fwdR=75,upR=20))),
 (17,M({'squash':1.0,'chest':[(Z,6)]},ears(fwd=10,tip=12),arms(fwdL=-4,upL=8,fwdR=45,upR=12))),
 (27,M({},ears(),arms(upL=6,upR=6))),
])
# ── Happy:雙手舉高揮、小跳兩下、耳朵抖 ──
K=[(0,M({},ears(),arms(upL=6,upR=6)))]
for j,f in enumerate((5,11,17,23)):
  up=j%2==0
  K.append((f,M({'squash':0.9 if not up else 1.08,'rootloc':0.10 if up else 0.0,'head':[(Y,8 if up else -8),(X,-6)]},
                ears(fwd=-12 if up else 10,out=12 if up else 4,tip=-10 if up else 14),
                arms(fwdL=10,upL=75 if up else 60,fwdR=10,upR=75 if up else 60))))
K.append((30,M({},ears(),arms(upL=6,upR=6))))
clip('Happy',K)
# ── Sad:低頭、耳朵往兩邊垂、手垂到前面,停在最後一格 ──
clip('Sad',[
 (0, M({},ears(),arms(upL=6,upR=6))),
 (12,M({'squash':0.97,'chest':[(X,8)],'head':[(X,9),(Y,-4)]},ears(fwd=-22,out=14,tip=-18),arms(fwdL=18,upL=0,fwdR=18,upR=0))),
 (24,M({'squash':0.96,'chest':[(X,10)],'head':[(X,12),(Y,3)]},ears(fwd=-28,out=18,tip=-22),arms(fwdL=22,upL=0,fwdR=22,upR=0))),
])
r.animation_data.action=bpy.data.actions['Idle']
if SHEET:   # 每個動作挑幾格拍下來檢查
  sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.color_type='TEXTURE'; sc.render.resolution_x=sc.render.resolution_y=300
  cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
  cam.data.type='ORTHO'; cam.data.ortho_scale=2.6; cam.location=(2.6,-3.6,0.9)
  cam.rotation_euler=(Vector((0,0,0.05))-cam.location).to_track_quat('-Z','Y').to_euler()
  for nm,fr in [('Idle',[0,15,30,45]),('Hop',[3,6,10,13]),('Roll',[0,7,12,17]),('Happy',[5,11,17,23]),('Sad',[0,12,24,24]),('SadF',[24])]:
    if nm=='SadF': cam.location=(0,-4,0.6); cam.rotation_euler=(Vector((0,0,0.05))-cam.location).to_track_quat('-Z','Y').to_euler(); nm='Sad'
    r.animation_data.action=bpy.data.actions[nm]
    for i,f in enumerate(fr):
      sc.frame_set(f); sc.render.filepath=f'{SHEET}/{nm}_{i}{"F" if cam.location.x==0 else ""}.png'; bpy.ops.render.render(write_still=True)
  r.animation_data.action=bpy.data.actions['Idle']
sc.frame_set(0)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT,export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',
  export_draco_mesh_compression_enable=True,export_skins=True,export_image_format='WEBP',export_image_quality=88,export_apply=False,export_yup=True,
  export_force_sampling=True,export_frame_range=False,export_def_bones=True,export_cameras=False,use_selection=False)
print('exported',OUT)
