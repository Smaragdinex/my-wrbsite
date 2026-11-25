# 官網房間裡會動的 Mia:Tripo 模型(errand-art/mia/dd_rig.blend 的 DianDian_Body)+ 自己建的精簡骨架、自己做的 Idle / Walk 動畫 → models/mia.glb
# 用法:blender -b ~/Desktop/Program/errand-art/mia/dd_rig.blend --python tools/blender/mia_web.py -- <out.glb> [預覽資料夾]
import bpy, sys, math, os, re
from mathutils import Vector, Matrix, Quaternion
A = sys.argv[sys.argv.index('--') + 1:]; OUT = A[0]; PV = A[1] if len(A) > 1 else None
SRC = os.path.expanduser('~/Desktop/Program/errand-art/mia/')
src = bpy.data.objects['DianDian_Body']; me = src.data.copy(); me.transform(src.matrix_world)
body = bpy.data.objects.new('mia', me)
for g in src.vertex_groups: body.vertex_groups.new(name=g.name)
for o in [o for o in bpy.data.objects if o != body]: bpy.data.objects.remove(o, do_unlink=True)
sc = bpy.context.scene; sc.collection.objects.link(body)
for act in list(bpy.data.actions): bpy.data.actions.remove(act)
for c in list(me.attributes):
    if c.name.startswith('custom_normal'): me.attributes.remove(c)
def mapto(n):
    sd = '.L' if re.match(r'^L |.* L$', n) else '.R' if re.match(r'^R |.* R$', n) else ''
    b = re.sub(r'(^[LR] | [LR]$)', '', n)
    if b in ('Pelvis',): return 'pelvis'
    if b == 'Spine': return 'spine1'
    if b == 'Spine1': return 'spine2'
    if b in ('Spine2', 'Clavicle', 'Clavicle Ext'): return 'chest'
    if b.startswith('Neck'): return 'neck'
    if b.startswith('Tail'): return 'tail' + b[-1]
    for k, v in (('UpperArm', 'farm'), ('Forearm', 'flow'), ('Hand', 'fpaw'), ('Finger', 'fpaw'), ('Thigh', 'thigh'), ('Calf', 'calf'), ('HorseLink', 'meta'), ('Foot', 'hpaw'), ('Toe', 'hpaw')):
        if b.startswith(k): return v + sd
    return 'head'
old = {g.index: mapto(g.name) for g in body.vertex_groups}; W = []
for v in me.vertices:
    d = {}
    for g in v.groups: d[old[g.group]] = d.get(old[g.group], 0) + g.weight
    h = d.get('head', 0)                                                         # 耳朵:頭頂以上
    if h > .5 and v.co.z > .33 and abs(v.co.x) > .018:
        k = min(1, (v.co.z - .33) / .02); e = 'ear.L' if v.co.x > 0 else 'ear.R'; d[e] = h * k; d['head'] = h * (1 - k)
    W.append(d)
body.vertex_groups.clear()
# 骨架(頭 → 尾,單位公尺,-Y 是前方)
B = {'pelvis': (None, (0, .157, .267), (0, .12, .262)), 'spine1': ('pelvis', (0, .12, .255), (0, .04, .255)), 'spine2': ('spine1', (0, .04, .255), (0, -.042, .255)), 'chest': ('spine2', (0, -.042, .255), (0, -.15, .255)),
     'neck': ('chest', (0, -.15, .255), (0, -.21, .297)), 'head': ('neck', (0, -.21, .297), (0, -.29, .287))}
for k in range(6): B[f'tail{k + 1}'] = ('pelvis' if k == 0 else f'tail{k}', (0, .184 + .0475 * k, .264), (0, .184 + .0475 * (k + 1), .264))
for s, n in ((1, '.L'), (-1, '.R')):
    B['ear' + n] = ('head', (s * .035, -.235, .328), (s * .045, -.24, .365))
    B['farm' + n] = ('chest', (s * .045, -.135, .235), (s * .044, -.107, .147)); B['flow' + n] = ('farm' + n, (s * .044, -.107, .147), (s * .035, -.114, .056)); B['fpaw' + n] = ('flow' + n, (s * .035, -.114, .056), (s * .035, -.14, .008))
    B['thigh' + n] = ('pelvis', (s * .04, .157, .267), (s * .04, .139, .137)); B['calf' + n] = ('thigh' + n, (s * .04, .139, .137), (s * .033, .188, .085)); B['meta' + n] = ('calf' + n, (s * .033, .188, .085), (s * .034, .172, .029)); B['hpaw' + n] = ('meta' + n, (s * .034, .172, .029), (s * .036, .145, .008))
ad = bpy.data.armatures.new('mia_rig'); rig = bpy.data.objects.new('mia_rig', ad); sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
for n, (p, h, t) in B.items():
    e = ad.edit_bones.new(n); e.head = h; e.tail = t; e.roll = 0
    if p: e.parent = ad.edit_bones[p]
bpy.ops.object.mode_set(mode='OBJECT')
vg = {n: body.vertex_groups.new(name=n) for n in B}
for i, d in enumerate(W):
    top = sorted(d.items(), key=lambda x: -x[1])[:4]; t = sum(x for _, x in top) or 1
    for n, w in top: vg[n].add([i], w / t, 'REPLACE')
# 減面(面數 8 萬 → 約 1 萬 2)、貼圖 1024
bpy.context.view_layer.objects.active = body; body.select_set(True)
m = body.modifiers.new('d', 'DECIMATE'); m.ratio = 12000 / sum(len(p.vertices) - 2 for p in me.polygons); bpy.ops.object.modifier_apply(modifier='d')
me = body.data
for p in me.polygons: p.use_smooth = True
mt = bpy.data.materials.new('mia'); mt.use_nodes = True; nt = mt.node_tree; pr = nt.nodes['Principled BSDF']; pr.inputs['Roughness'].default_value = .8
tn = [f for f in os.listdir(SRC) if f.startswith('T_') and 'basecolor' in f][0]; im = bpy.data.images.load(SRC + tn); im.scale(1024, 1024)
tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = im; nt.links.new(tx.outputs[0], pr.inputs['Base Color'])
me.materials.clear(); me.materials.append(mt)
for p in me.polygons: p.material_index = 0
body.parent = rig; am = body.modifiers.new('arm', 'ARMATURE'); am.object = rig
sc.render.fps = 30; pb = rig.pose.bones
for b in pb: b.rotation_mode = 'QUATERNION'
def wrot(b, axis, ang):                                                          # 以世界軸轉(rest 空間)
    r = b.bone.matrix_local.to_3x3(); ax = r.inverted() @ Vector(axis); return Quaternion(ax, ang)
def setrot(n, *rs):
    q = Quaternion()
    for ax, a in rs: q = wrot(pb[n], ax, a) @ q
    pb[n].rotation_quaternion = q
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
def ik(up, lo, hip, target, bend):                                               # YZ 平面兩骨 IK;回傳 up / lo 的世界方向
    a, b = (Vector(B[up][2]) - Vector(B[up][1])).length, (Vector(B[lo][2]) - Vector(B[lo][1])).length
    d = target - hip; d.x = 0; L = min(max(d.length, abs(a - b) + 1e-4), (a + b) * .9995); d = d.normalized()
    ca = (a * a + L * L - b * b) / (2 * a * L); ang = math.acos(max(-1, min(1, ca))) * bend
    u = Matrix.Rotation(ang, 3, 'X') @ d; k = hip + u * a; return u, (hip + d * L - k).normalized(), hip + d * L
def aim(n, direction):                                                           # 讓骨頭的世界方向 = direction(最小旋轉,從 rest 方向起)
    b = pb[n]; rest = (b.bone.tail_local - b.bone.head_local).normalized(); q = rest.rotation_difference(direction.normalized())
    R = (q.to_matrix() @ b.bone.matrix_local.to_3x3()).to_4x4(); R.translation = b.matrix.translation; b.matrix = R; bpy.context.view_layer.update()
def legs(feet):
    bpy.context.view_layer.update()
    for n in ('.L', '.R'):
        s = 1 if n == '.L' else -1
        for kind, dy, dz, pitch in (('f', *feet['f' + n]), ('h', *feet['h' + n])):
            if kind == 'f':
                tgt = Vector((0, B['flow' + n][2][1] + dy, B['flow' + n][2][2] + dz)); up, lo = 'farm' + n, 'flow' + n; hip = pb[up].head.copy(); r0 = Vector(B[up][2]) - Vector(B[up][1])
                u, l, _ = ik(up, lo, Vector((0, hip.y, hip.z)), tgt, 1); u.x = r0.x / r0.length; aim(up, u); l.x = -s * .09; aim(lo, l)
                pr_ = Vector(B['fpaw' + n][2]) - Vector(B['fpaw' + n][1]); aim('fpaw' + n, Matrix.Rotation(pitch, 3, 'X') @ pr_)
            else:
                f0 = Vector(B['meta' + n][2]); hk = Vector(B['calf' + n][2]) - f0; hk = Matrix.Rotation(pitch * .6, 3, 'X') @ hk
                foot = Vector((0, f0.y + dy, f0.z + dz)); tgt = foot + hk; tgt.x = 0; up, lo = 'thigh' + n, 'calf' + n; hip = pb[up].head.copy()
                u, l, end = ik(up, lo, Vector((0, hip.y, hip.z)), tgt, -1); aim(up, u); l.x = -s * .09; aim(lo, l); aim('meta' + n, -hk)
                pr_ = Vector(B['hpaw' + n][2]) - Vector(B['hpaw' + n][1]); aim('hpaw' + n, Matrix.Rotation(pitch, 3, 'X') @ pr_)
def key(f):
    for b in pb:
        b.keyframe_insert('rotation_quaternion', frame=f)
    pb['pelvis'].keyframe_insert('location', frame=f)
def reset():
    for b in pb: b.matrix_basis = Matrix()
def ploc(v): pb['pelvis'].location = pb['pelvis'].bone.matrix_local.to_3x3().inverted() @ Vector(v)
def tail(base, sway, curl, ph):
    for k in range(6): setrot(f'tail{k + 1}', (X, (base if k == 0 else curl * (1 if k < 3 else -.9))), (Z, sway * math.sin(ph - k * .6) * (.5 + .16 * k)))
def action(n):
    reset(); a = bpy.data.actions.new(n); rig.animation_data_create(); rig.animation_data.action = a; a.use_fake_user = True; return a
tau = math.tau; LOW = -.010
# 走路:四拍(左後、左前、右後、右前),一圈 34 格
N, S, DUTY = 34, .15, .64; action('Walk')
for f in range(N + 1):
    t = f / N; reset(); w = tau * t
    ploc((.006 * math.sin(w), 0, LOW + .004 * math.cos(2 * w)))
    setrot('pelvis', (Z, .07 * math.sin(w)), (Y, .03 * math.sin(w))); setrot('spine1', (Z, -.05 * math.sin(w))); setrot('spine2', (Z, -.05 * math.sin(w))); setrot('chest', (Z, .02 * math.sin(w)), (Y, -.04 * math.sin(w + .8)))
    setrot('neck', (X, .10 + .03 * math.cos(2 * w + .6))); setrot('head', (X, -.04 - .03 * math.cos(2 * w + .6)))
    tail(-.62, .16, .13, w)
    feet = {}
    for n, ph in (('h.L', 0), ('f.L', .25), ('h.R', .5), ('f.R', .75)):
        u = (t + ph) % 1
        if u < DUTY: k = u / DUTY; feet[n] = (-S / 2 + S * k, 0, 0 if k < .8 else (k - .8) / .2 * .45)
        else:
            k = (u - DUTY) / (1 - DUTY); e = k * k * (3 - 2 * k); feet[n] = (S / 2 - S * e, .034 * math.sin(math.pi * k), .45 + .35 * math.sin(math.pi * k) - .45 * k)
    legs(feet); key(f)
# 待機:呼吸、甩尾、轉頭看人、抖耳朵,180 格
N2 = 180; action('Idle')
def bump(t, a, b, r):                                                            # a~b 之間為 1,兩側 r 平滑
    s = lambda x: max(0, min(1, x)) ** 2 * (3 - 2 * max(0, min(1, x))); return s((t - a) / r) * (1 - s((t - b) / r))
for f in range(0, N2 + 1, 2):
    t = f / N2; w = tau * t; reset(); br = math.sin(w * 3)
    ploc((.004 * math.sin(w), 0, LOW * .6 + .0012 * br)); setrot('spine2', (X, .010 * br)); setrot('chest', (X, -.014 * br), (Z, .03 * math.sin(w)))
    yaw = .62 * bump(t, .12, .40, .07) - .5 * bump(t, .58, .80, .07); pit = .16 * bump(t, .58, .80, .07)
    setrot('neck', (Z, yaw * .5), (X, .02 * br + pit)); setrot('head', (Z, yaw * .55), (X, -.03 + pit * .4), (Y, .12 * bump(t, .2, .36, .05)))
    for n, c in (('.L', .3), ('.R', .68)):
        fl = sum(bump(t, c + d, c + d + .004, .008) for d in (0, .03)); setrot('ear' + n, (Y, (1 if n == '.L' else -1) * .28 * fl), (X, -.15 * fl))
    tail(-.75, .30, .2, w * 2); legs({k: (0, 0, 0) for k in ('f.L', 'f.R', 'h.L', 'h.R')}); key(f)
if PV:
    os.makedirs(PV, exist_ok=True); sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
    cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 60
    sun = bpy.data.objects.new('s', bpy.data.lights.new('s', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (.7, .3, .4); sc.collection.objects.link(sun)
    wd = bpy.data.worlds.new('w'); sc.world = wd; wd.use_nodes = True; wd.node_tree.nodes['Background'].inputs[0].default_value = (.4, .4, .4, 1)
    bpy.ops.mesh.primitive_plane_add(size=4); fl = bpy.context.active_object
    sc.render.resolution_x, sc.render.resolution_y = 480, 360
    for nm, fs, eye in (('Walk', (0, 4, 8, 13, 17, 21, 26, 30), (1.6, -.15, .35)), ('Idle', (0, 40, 56, 90, 120, 150), (1.1, -1.1, .5))):
        rig.animation_data.action = bpy.data.actions[nm]
        if hasattr(rig.animation_data, 'action_slot') and bpy.data.actions[nm].slots: rig.animation_data.action_slot = bpy.data.actions[nm].slots[0]
        cam.location = eye; cam.rotation_euler = (Vector((0, .03, .2)) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
        for f in fs: sc.frame_set(f); sc.render.filepath = f'{PV}/{nm}_{f:03d}.png'; bpy.ops.render.render(write_still=True)
    for o in (cam, sun, fl): bpy.data.objects.remove(o, do_unlink=True)
rig.animation_data.action = None; reset()
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS', export_yup=True, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_image_format='WEBP', export_image_quality=85)
print('MIA', os.path.getsize(OUT) // 1024, 'KB', len(body.data.polygons), 'SPEED', S / (DUTY * N / 30))
