# 大廳的打掃機器人(掃地機):白色烤漆機身 + 前方煙燻玻璃保險桿 + 頂部 LiDAR 雷達塔(藍色燈環)+ 臉部玻璃面板與兩顆眼睛 + 兩支側刷
# 會動的零件分開成獨立物件,網頁上照名字找來動:bot_brushL / bot_brushR(繞自己的軸轉)、bot_eyeL / bot_eyeR(眨眼)、bot_led(燈環呼吸)
# 單位跟網頁一樣(機身半徑 0.4,網頁再放大 1.35 倍);正面朝 Blender +Y(匯出 glTF 後 = 網頁的 -Z,也就是機器人前進方向)
# 用法:blender -b --python tools/blender/bot_build.py -- [preview out.png samples] [export out.glb]
import bpy, bmesh, sys, os, math
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def mat(name, hexc, rough=.4, metal=0.0, coat=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
    c = tuple(pow(int(hexc[i:i + 2], 16) / 255, 2.2) for i in (1, 3, 5)) + (1,)
    p.inputs['Base Color'].default_value = c; p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat
    if emit:
        e = tuple(pow(int(emit[i:i + 2], 16) / 255, 2.2) for i in (1, 3, 5)) + (1,)
        p.inputs['Emission Color'].default_value = e; p.inputs['Emission Strength'].default_value = strength
    return m
M_SHELL = mat('bot_shell', '#f6f4ef', .2, coat=.6)
M_PEARL = mat('bot_pearl', '#e9e6df', .32, coat=.3)
M_GLASS = mat('bot_glass', '#0b1120', .06, .2, coat=1.0)
M_RUBBER = mat('bot_rubber', '#3d424b', .75)
M_METAL = mat('bot_metal', '#c8ccd3', .28, 1.0)
M_BRISTLE = mat('bot_bristle', '#a7b0bb', .6)
M_LED = mat('bot_ledmat', '#7fd8ff', .3, emit='#7fd8ff', strength=8)
M_EYE = mat('bot_eyemat', '#aee6ff', .3, emit='#9ee0ff', strength=10)

def obj(o, name, m):
    o.name = name; o.data.name = name
    if m: o.data.materials.clear(); o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o
def bevel(o, w, seg=4):
    b = o.modifiers.new('bevel', 'BEVEL'); b.width = w; b.segments = seg; b.limit_method = 'ANGLE'; b.harden_normals = False
    return o
def cyl(name, r, h, loc, m, verts=96, bv=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc); o = obj(bpy.context.active_object, name, m)
    if bv: bevel(o, bv)
    return o
def torus(name, R, r, loc, m, major=128, minor=12):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=major, minor_segments=minor, location=loc)
    return obj(bpy.context.active_object, name, m)
def band(name, r, a0, a1, z0, z1, thick, m, seg=48):
    """沿著機身外圈的一段弧形板(a0~a1 是從 +Y 起算的角度)"""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rows = []
    for i in range(seg + 1):
        a = math.radians(a0 + (a1 - a0) * i / seg); x, y = math.sin(a) * r, math.cos(a) * r
        rows.append((bm.verts.new((x, y, z0)), bm.verts.new((x, y, z1))))
    for i in range(seg): bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    s = o.modifiers.new('solid', 'SOLIDIFY'); s.thickness = thick; s.offset = 1
    bevel(o, thick * .45, 3)
    return obj(o, name, m)

parts = []
# ---- 機身 ----
H0, H1 = .018, .112                                   # 機身底 / 頂高度
parts.append(cyl('bot_body', .40, H1 - H0, (0, 0, (H0 + H1) / 2), M_SHELL, bv=.032))
parts.append(cyl('bot_skirt', .375, .03, (0, 0, .022), M_RUBBER, bv=.008))
parts.append(torus('bot_seam', .352, .0045, (0, 0, H1 + .001), M_RUBBER))          # 頂面外圈的分模線
parts.append(cyl('bot_lid', .33, .012, (0, 0, H1 + .004), M_PEARL, bv=.005))          # 上蓋(稍微浮起、珍珠白)
# 前方煙燻玻璃保險桿(包住正面約 140°)+ 下緣橡膠條
parts.append(band('bot_bumper', .402, -70, 70, .04, .098, .014, M_GLASS))
parts.append(band('bot_bumper_rubber', .404, -70, 70, .026, .04, .01, M_RUBBER))
# 側邊金屬飾條
for sx in (-1, 1): parts.append(band(f'bot_trim_{sx}', .403, sx * 78, sx * 150, .062, .07, .006, M_METAL, 24))
# ---- 臉:頂部前方的橢圓玻璃面板,兩顆眼睛 ----
face = cyl('bot_face', .13, .008, (0, .19, H1 + .012), M_GLASS, verts=64, bv=.003); face.scale = (1.25, .55, 1); parts.append(face)
eyes = []
for sx, nm in ((-1, 'bot_eyeL'), (1, 'bot_eyeR')):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=.03, location=(sx * .066, .19, H1 + .017))
    e = obj(bpy.context.active_object, nm, M_EYE); e.scale = (.75, 1.45, .3); eyes.append(e)          # 直立的橢圓眼,比較有表情
# ---- LiDAR 雷達塔(偏後)+ 燈環 ----
TY = -.12
parts.append(cyl('bot_turret', .085, .05, (0, TY, H1 + .035), M_SHELL, verts=64, bv=.012))
parts.append(cyl('bot_turret_glass', .087, .016, (0, TY, H1 + .033), M_GLASS, verts=64))
parts.append(cyl('bot_turret_cap', .07, .006, (0, TY, H1 + .062), M_METAL, verts=64, bv=.002))
led = torus('bot_led', .088, .0045, (0, TY, H1 + .012), M_LED, 96, 8)
# ---- 兩顆按鈕 ----
for sx in (-1, 1):
    b = cyl(f'bot_btn_{sx}', .018, .006, (sx * .05, TY - .125, H1 + .012), M_PEARL, verts=32, bv=.002); parts.append(b)
    parts.append(torus(f'bot_btnring_{sx}', .019, .0018, (sx * .05, TY - .125, H1 + .011), M_METAL, 32, 6))
# ---- 側刷:輪軸 + 三支刷臂,每支末端一撮散開的刷毛 ----
brushes = []
for sx, nm in ((-1, 'bot_brushL'), (1, 'bot_brushR')):
    cx, cy, cz = sx * .27, .27, .014
    pieces = [cyl(nm + '_hub', .026, .012, (cx, cy, cz), M_RUBBER, verts=32, bv=.003)]
    for k in range(3):
        a = k * math.tau / 3 + (.3 if sx > 0 else 0)
        ux, uy = math.cos(a), math.sin(a)
        for j in range(7):                           # 一撮刷毛:從輪軸往外散開
            sp = (j - 3) * .07
            bx, by = math.cos(a + sp), math.sin(a + sp)
            L = .13 + (.012 if j % 2 else 0)
            bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=.0022, depth=L, location=(cx + bx * (L / 2 + .015), cy + by * (L / 2 + .015), cz - .002 - .008 * (L / .14)))
            f = bpy.context.active_object; f.rotation_euler = (0, math.radians(90 - 6), a + sp)
            pieces.append(obj(f, f'{nm}_f{k}{j}', M_BRISTLE))
    bpy.ops.object.select_all(action='DESELECT')
    for p in pieces: p.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]; bpy.ops.object.join()
    br = bpy.context.active_object; br.name = nm; br.data.name = nm
    # 原點放在輪軸上,網頁才能讓它繞自己轉
    bpy.context.scene.cursor.location = (cx, cy, cz); bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    brushes.append(br)

# 不會動的零件合成一個物件(網頁上 draw call 少)
for p in parts:
    bpy.context.view_layer.objects.active = p; p.select_set(True)
    for md in list(p.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
    p.select_set(False)
bpy.ops.object.select_all(action='DESELECT')
for p in parts: p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
body = bpy.context.active_object; body.name = 'bot_body'
for o in eyes + [led] + brushes: o.parent = None
BOT = [body, led] + eyes + brushes

mode = ARGS[0] if ARGS else 'preview'
if mode == 'preview':
    out = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else '/tmp/bot.png'
    # 白色攝影棚:亮面地板 + 兩盞柔光 + 淡藍環境
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0)); fl = obj(bpy.context.active_object, 'floor', mat('floor', '#f2f0ea', .12, coat=.5))
    for loc, en, sz in (((-1.2, -1.0, 1.6), 120, 1.6), ((1.4, .6, 1.2), 50, 1.2), ((0, 1.6, .9), 40, 1.0)):
        L = bpy.data.lights.new('l', 'AREA'); L.energy = en; L.size = sz; lo = bpy.data.objects.new('l', L); scene.collection.objects.link(lo)
        lo.location = loc; lo.rotation_mode = 'QUATERNION'; lo.rotation_quaternion = (Vector((0, 0, .05)) - Vector(loc)).to_track_quat('-Z', 'Y')
    w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (.75, .8, .88, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    cd = bpy.data.cameras.new('c'); cd.lens = 70; cam = bpy.data.objects.new('c', cd); scene.collection.objects.link(cam); scene.camera = cam
    view = ARGS[3] if len(ARGS) > 3 else 'front'
    eye = {'front': Vector((.75, 1.25, .62)), 'back': Vector((-1.0, -.9, .8)), 'site': Vector((1.1, 2.6, 1.5))}[view]
    if view == 'site': cd.lens = 50
    cam.location = eye; cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (Vector((0, .02, .06)) - eye).to_track_quat('-Z', 'Y')
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for dv in prefs.devices: dv.use = True
    scene.cycles.device = 'GPU'; scene.cycles.samples = int(ARGS[2]) if len(ARGS) > 2 else 128; scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1000
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.filepath = out; bpy.ops.render.render(write_still=True)
    print('rendered', out)
else:
    out = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'starship', 'models', 'bot.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in BOT: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_normals=True)
    print('exported', out, os.path.getsize(out) // 1024, 'KB')
