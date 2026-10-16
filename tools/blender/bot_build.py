# 大廳的打掃機器人(倒 T 造型,使用者給的參考:《007 First Light》裡的清潔機器人):
#   霧黑石墨色的高方柱(頂端是尖的五角形斷面)、正面上方一道白色「︿」燈、下面一個相機圓環、正中一條細燈線、兩側直條散熱槽;
#   底下一塊寬扁底座:(從正面看)左邊一顆黑色滾筒、右邊一塊斜楔 → ⊥(正面朝 +Y,所以從正面看的左邊是 +X)
# 會動的零件分開成獨立物件,網頁上照名字找來動:bot_roller(滾筒,繞自己的軸轉)、bot_chevron(白燈,偶爾閃一下;打招呼時上下翻成笑臉 ︶)、bot_led(燈線呼吸)
# 單位跟網頁一樣(網頁再放大 1.35 倍);正面朝 Blender +Y(匯出 glTF 後 = 網頁的 -Z,也就是機器人前進方向)
# 用法:blender -b --python tools/blender/bot_build.py -- [preview out.png samples front|back|site] [export out.glb]
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
M_BODY = mat('bot_body', '#1b1d20', .5, .15)            # 霧黑石墨
M_PANEL = mat('bot_panel', '#30343a', .45, .2)
M_SLOT = mat('bot_slot', '#111316', .7)
M_RUBBER = mat('bot_rubber', '#181a1d', .8)
M_METAL = mat('bot_metal', '#8d939b', .3, 1.0)
M_GLASS = mat('bot_glass', '#07090c', .05, .2, coat=1.0)
M_CHEV = mat('bot_chevmat', '#eef6ff', .3, emit='#eef6ff', strength=9)
M_LED = mat('bot_ledmat', '#7fd8ff', .3, emit='#7fd8ff', strength=4)

def obj(o, name, m):
    o.name = name; o.data.name = name
    if m: o.data.materials.clear(); o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o
def bevel(o, w, seg=4):
    b = o.modifiers.new('bevel', 'BEVEL'); b.width = w; b.segments = seg; b.limit_method = 'ANGLE'; b.harden_normals = True
    return o
def box(name, size, loc, m, bv=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = obj(bpy.context.active_object, name, m); o.scale = size
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    if bv: bevel(o, bv)
    return o
def cyl(name, r, h, loc, m, verts=64, bv=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot); o = obj(bpy.context.active_object, name, m)
    bpy.ops.object.transform_apply(rotation=True)
    if bv: bevel(o, bv)
    return o
def prism(name, profile, y0, y1, m, bv=0.0):
    """XZ 平面上的多邊形(profile),沿 Y 從 y0 擠出到 y1"""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in profile]; b = [bm.verts.new((x, y1, z)) for x, z in profile]
    n = len(profile)
    for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(a[::-1]); bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); obj(o, name, m)
    for p in o.data.polygons: p.use_smooth = False
    if bv: bevel(o, bv, 3)
    return o
def apply_mods(o):
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = o; o.select_set(True)
    for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
def join(objs, name):
    for o in objs: apply_mods(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name; o.data.name = name; return o

parts = []
# ---- 底座:寬扁的板(左右方向)----
BH = .05                                                  # 底座板高
parts.append(box('bot_base', (.3, .2, BH), (0, 0, .012 + BH / 2), M_BODY, .012))
parts.append(box('bot_base_skirt', (.28, .18, .014), (0, 0, .007), M_RUBBER, .004))
# 斜楔(從柱子往外斜到地上,從正面看在右邊 = -X)+ 外緣一條金屬邊
parts.append(prism('bot_wedge', [(-.075, .13), (-.24, .025), (-.24, .01), (-.07, .01)], -.1, .1, M_BODY, .008))
parts.append(prism('bot_wedge_lip', [(-.2, .02), (-.25, .014), (-.25, .002), (-.2, .002)], -.098, .098, M_METAL, .003))
# ---- 柱子:五角形斷面(正面看頂端是尖的),沿前後方向擠出 ----
CW, CD, CH, PK = .15, .17, .58, .04                       # 寬、深、直身高、頂尖多高
Z0 = .012 + BH
parts.append(prism('bot_column', [(-CW / 2, Z0), (CW / 2, Z0), (CW / 2, Z0 + CH), (0, Z0 + CH + PK), (-CW / 2, Z0 + CH)], -CD / 2, CD / 2, M_BODY, .01))
# 兩側的直條散熱槽(長短不一,讓側面有層次)+ 上方一塊亮一點的面板
for sx in (-1, 1):
    for k, (yc, h) in enumerate(((-.045, .34), (.02, .22), (.058, .3))):
        parts.append(box(f'bot_slot_{sx}_{k}', (.006, .014, h), (sx * (CW / 2 + .001), yc, Z0 + .08 + h / 2), M_SLOT, .002))
    parts.append(box(f'bot_sidepanel_{sx}', (.003, CD * .82, .1), (sx * (CW / 2 + .0005), 0, Z0 + CH - .06), M_PANEL, .002))
parts.append(box('bot_backpanel', (CW * .7, .004, CH * .6), (0, -CD / 2 - .001, Z0 + CH * .45), M_PANEL, .002))
# ---- 正面(+Y):白色 ︿ 燈、相機圓環、正中細燈線 ----
FY = CD / 2 + .002
CZ = Z0 + CH - .07                                        # ︿ 燈高度
chevron = join([box(f'bot_chev_{sx}', (CW * .46, .006, .011), (sx * CW * .22, FY + .002, CZ), M_CHEV, 0, rot=(0, sx * math.radians(11), 0)) for sx in (-1, 1)], 'bot_chevron')
bpy.ops.object.select_all(action='DESELECT'); chevron.select_set(True); bpy.context.view_layer.objects.active = chevron
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')       # 原點放在燈的正中間:網頁上下翻轉就變成笑臉 ︶
RZ = CZ - .065
parts.append(cyl('bot_cam_ring', .03, .008, (0, FY + .001, RZ), M_METAL, 48, .002, rot=(math.pi / 2, 0, 0)))
parts.append(cyl('bot_cam_glass', .024, .01, (0, FY + .003, RZ), M_GLASS, 48, .002, rot=(math.pi / 2, 0, 0)))
led = box('bot_led', (.004, .004, CH * .8), (0, FY + .001, Z0 + CH * .42), M_LED)
parts.append(cyl('bot_topsensor', .018, .01, (0, .02, Z0 + CH + PK * .6), M_GLASS, 32, .002))   # 頂端的小感測器
# ---- 左邊的滾筒(軸朝前後,從正面看得到它的圓端)+ 支架 ----
RR, RX = .058, .2
roller = join([cyl('bot_roller', RR, .2, (RX, 0, RR), M_RUBBER, 48, .012, rot=(math.pi / 2, 0, 0))] +
              [cyl(f'bot_roller_g{k}', RR + .002, .004, (RX, -.085 + k * .0243, RR), M_SLOT, 48, 0, rot=(math.pi / 2, 0, 0)) for k in range(8)], 'bot_roller')
bpy.ops.object.select_all(action='DESELECT'); roller.select_set(True); bpy.context.view_layer.objects.active = roller
bpy.context.scene.cursor.location = (RX, 0, RR); bpy.ops.object.origin_set(type='ORIGIN_CURSOR')   # 原點在軸心,網頁才能讓它轉
for sy in (-1, 1): parts.append(cyl(f'bot_roller_cap_{sy}', RR * .55, .012, (RX, sy * .106, RR), M_METAL, 32, .003, rot=(math.pi / 2, 0, 0)))
parts.append(box('bot_roller_arm', (.07, .2, .03), (.15, 0, .045), M_BODY, .008))

body = join(parts, 'bot_body')            # 不會動的零件合成一個物件(網頁上 draw call 少)
BOT = [body, led, chevron, roller]

mode = ARGS[0] if ARGS else 'preview'
if mode == 'preview':
    out = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else '/tmp/bot.png'
    # 白色攝影棚:亮面地板 + 三盞柔光 + 淡藍環境
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0)); obj(bpy.context.active_object, 'floor', mat('floor', '#f2f0ea', .12, coat=.5))
    for loc, en, sz in (((-1.2, -1.0, 1.6), 120, 1.6), ((1.4, .6, 1.2), 50, 1.2), ((0, 1.6, .9), 40, 1.0)):
        L = bpy.data.lights.new('l', 'AREA'); L.energy = en; L.size = sz; lo = bpy.data.objects.new('l', L); scene.collection.objects.link(lo)
        lo.location = loc; lo.rotation_mode = 'QUATERNION'; lo.rotation_quaternion = (Vector((0, 0, .05)) - Vector(loc)).to_track_quat('-Z', 'Y')
    w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (.75, .8, .88, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    cd = bpy.data.cameras.new('c'); cd.lens = 60; cam = bpy.data.objects.new('c', cd); scene.collection.objects.link(cam); scene.camera = cam
    view = ARGS[3] if len(ARGS) > 3 else 'front'
    eye = {'front': Vector((.75, 2.0, .7)), 'back': Vector((-1.0, -1.4, .9)), 'site': Vector((1.1, 2.6, 1.5))}[view]
    look = Vector((0, 0, .32))
    if view == 'site': cd.lens = 50
    cam.location = eye; cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (look - eye).to_track_quat('-Z', 'Y')
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for dv in prefs.devices: dv.use = True
    scene.cycles.device = 'GPU'; scene.cycles.samples = int(ARGS[2]) if len(ARGS) > 2 else 128; scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1000, 1300
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
