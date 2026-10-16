# 大廳的打掃機器人(倒 T 造型,使用者給的參考:《007 First Light》裡的清潔機器人):
#   霧黑石墨色的高方柱(頂端是尖的五角形斷面)、正面上方一道白色「︿」燈、下面一個相機圓環、正中一條細燈線、兩側直條散熱槽;
#   寬面上有 [ ] 括號燈框、頭下面一圈燈帶、頭上小螢幕;底下一塊扁底座:前面(-X)斜楔、後面(+X)橫跨整個寬面的滾筒 + 兩顆小輪子
#   從臉那側看是 ⊥;機器人是「橫著走」:前進方向 = 斜楔那頭(-X)
# 會動的零件分開成獨立物件,網頁上照名字找來動:bot_roller(滾筒,繞自己的軸轉)、bot_chevron(臉那側的 ︿ 燈,偶爾閃一下)、bot_frame(燈帶 + [ ] 括號燈框,變色)、bot_led(燈線 + 螢幕小字,呼吸)
# 單位跟網頁一樣(網頁再放大 1.35 倍);臉在 Blender +Y、前進方向是 -X(網頁那邊整組轉 -90° 對齊前進方向)
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
# 方向:前進方向 = ±X(寬面朝前後;斜楔那頭在前、滾筒那頭在後),窄面 ±Y 是左右兩側,臉(︿ 燈 + 相機)在 +Y 那一側
# ---- 柱子:窄 CW(沿前進方向)× 寬 CD(左右);五角形斷面 → 從窄面看頂端是尖的、從寬面看是斜屋頂 ----
CW, CD, CH, PK = .13, .22, .47, .04                       # 窄、寬、直身高、頂尖多高
BH = .05                                                  # 底座板高
Z0 = .012 + BH
# ---- 底座:扁板 + 斜楔(-X,前)+ 滾筒(+X,後)----
parts.append(box('bot_base', (.26, CD + .02, BH), (0, 0, .012 + BH / 2), M_BODY, .012))
parts.append(box('bot_base_skirt', (.24, CD, .014), (0, 0, .007), M_RUBBER, .004))
WY = CD / 2 + .01
parts.append(prism('bot_wedge', [(-.06, .13), (-.21, .025), (-.21, .01), (-.055, .01)], -WY, WY, M_BODY, .008))
parts.append(prism('bot_wedge_lip', [(-.17, .02), (-.22, .014), (-.22, .002), (-.17, .002)], -WY + .002, WY - .002, M_METAL, .003))
parts.append(prism('bot_column', [(-CW / 2, Z0), (CW / 2, Z0), (CW / 2, Z0 + CH), (0, Z0 + CH + PK), (-CW / 2, Z0 + CH)], -CD / 2, CD / 2, M_BODY, .01))
# 頭:比柱身寬一點、切角的帽子(一樣是五角形斷面)
HW, HD, H0 = CW / 2 + .009, CD / 2 + .009, Z0 + CH - .1
parts.append(prism('bot_head', [(-HW, H0), (HW, H0), (HW, Z0 + CH + .004), (0, Z0 + CH + PK + .008), (-HW, Z0 + CH + .004)], -HD, HD, M_BODY, .014))
# 頭的兩個寬面上各一塊小狀態螢幕(深色玻璃)
for sx in (-1, 1): parts.append(box(f'bot_screen_{sx}', (.004, CD * .62, .03), (sx * (HW + .001), 0, Z0 + CH - .035), M_GLASS, .003))
# 背面(-Y 窄面)的直條散熱槽
for k, (xc, h) in enumerate(((-.03, .3), (0, .22), (.03, .26))):
    parts.append(box(f'bot_slot_{k}', (.012, .006, h), (xc, -CD / 2 - .001, Z0 + .08 + h / 2), M_SLOT, .002))
# ---- 燈:頭下面繞一圈的燈帶(寬面是直線、窄面是 ︿)+ 兩個寬面上的 [ ] 括號燈框 → bot_frame(網頁上控制顏色:走的時候白、停下來琥珀色)----
FY = CD / 2 + .002
CZ = H0 - .015                                            # 燈帶高度
chev = lambda name, y: join([box(f'{name}_{sx}', (CW * .46, .006, .011), (sx * CW * .22, y, CZ), M_CHEV, 0, rot=(0, sx * math.radians(11), 0)) for sx in (-1, 1)], name)
frame = [chev('bot_chev_back', -FY - .002)]
L, T = .009, .004                                         # 燈線粗細、凸出多少
for sx in (-1, 1):
    X = sx * (CW / 2 + T / 2 + .001)
    frame.append(box(f'bot_band_{sx}', (T, CD * .9, L), (X, 0, CZ), M_CHEV))
    zb, zt, yo, arm = Z0 + .1, H0 - .07, CD / 2 - .022, .035
    for sy in (-1, 1):
        frame.append(box(f'bot_br_v_{sx}_{sy}', (T, L, zt - zb), (X, sy * yo, (zb + zt) / 2), M_CHEV))
        for z in (zb, zt): frame.append(box(f'bot_br_h_{sx}_{sy}_{z:.2f}', (T, arm, L), (X, sy * (yo - arm / 2 + L / 2), z), M_CHEV))
    for z in (zb, zt): frame.append(box(f'bot_br_dash_{sx}_{z:.2f}', (T, .03, L), (X, 0, z), M_CHEV))
frame = join(frame, 'bot_frame')
# ---- 臉那一側(+Y 窄面):白色 ︿(跟燈帶接在一起)、相機圓環、正中細燈線 ----
chevron = chev('bot_chevron', FY + .002)
bpy.ops.object.select_all(action='DESELECT'); chevron.select_set(True); bpy.context.view_layer.objects.active = chevron
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
RZ = CZ - .06
parts.append(cyl('bot_cam_ring', .03, .008, (0, FY + .001, RZ), M_METAL, 48, .002, rot=(math.pi / 2, 0, 0)))
parts.append(cyl('bot_cam_glass', .024, .01, (0, FY + .003, RZ), M_GLASS, 48, .002, rot=(math.pi / 2, 0, 0)))
# 細燈線 + 狀態螢幕上的幾格小字(都用藍色 LED 材質,網頁上一起呼吸)
lz0, lz1 = Z0 + .03, RZ - .04
glyphs = [box('bot_led', (.004, .004, lz1 - lz0), (0, FY + .001, (lz0 + lz1) / 2), M_LED)]
for sx in (-1, 1):
    y = -CD * .26
    for k, w in enumerate((.012, .02, .008, .016, .01, .014)):
        glyphs.append(box(f'bot_glyph_{sx}_{k}', (.002, w, .006), (sx * (HW + .0035), y + w / 2, Z0 + CH - .035 + (.006 if k % 3 == 1 else 0)), M_LED)); y += w + .006
led = join(glyphs, 'bot_led')
# ---- 滾筒(+X,後):軸朝左右、橫跨整個寬面,兩端各一顆小輪子 ----
RR, RX = .056, .135
RL = CD + .02
roller = join([cyl('bot_roller', RR, RL, (RX, 0, RR), M_RUBBER, 48, .012, rot=(math.pi / 2, 0, 0))] +
              [cyl(f'bot_roller_g{k}', RR + .002, .004, (RX, -RL / 2 + .015 + k * (RL - .03) / 9, RR), M_SLOT, 48, 0, rot=(math.pi / 2, 0, 0)) for k in range(10)], 'bot_roller')
bpy.ops.object.select_all(action='DESELECT'); roller.select_set(True); bpy.context.view_layer.objects.active = roller
bpy.context.scene.cursor.location = (RX, 0, RR); bpy.ops.object.origin_set(type='ORIGIN_CURSOR')   # 原點在軸心,網頁才能讓它轉
for sy in (-1, 1):
    parts.append(cyl(f'bot_wheel_{sy}', .04, .022, (RX - .03, sy * (RL / 2 + .016), .04), M_RUBBER, 32, .006, rot=(math.pi / 2, 0, 0)))
    parts.append(cyl(f'bot_hub_{sy}', .018, .024, (RX - .03, sy * (RL / 2 + .016), .04), M_METAL, 24, .003, rot=(math.pi / 2, 0, 0)))
parts.append(box('bot_roller_arm', (.06, RL, .03), (.095, 0, .045), M_BODY, .008))

body = join(parts, 'bot_body')            # 不會動的零件合成一個物件(網頁上 draw call 少)
BOT = [body, led, chevron, frame, roller]

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
    eye = {'front': Vector((.75, 2.0, .7)), 'wide': Vector((2.0, .55, .75)), 'back': Vector((-1.0, -1.4, .9)), 'site': Vector((1.1, 2.6, 1.5))}[view]
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
