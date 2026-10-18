# 中央大廳的建築(地板、艙壁、柱子、門框、天花板、吊柱)用 Blender 建模 + Cycles 打光。
# 尺寸跟 public/assets/starship/hall.mjs 一致(HALL_R 8、牆高 5.4、五道門平均排在後半圈 150°)。
# 座標:Blender 是 Z 朝上;three.js 的 (x, y, z) = Blender 的 (x, -y... 這裡統一用「方位角 b」:
#   門在 Blender 的 (sin b * R, cos b * R),面向大廳中心。
# 用法:blender -b --python tools/blender/hall_build.py -- preview out.png   (渲染一張預覽)
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(ROOT, '..', '..'))
SHOTS = ['kittycafe.jpg', 'cat-board.jpg', 'oceancleanup.jpg', 'tinyplanet.jpg', 'woodenrails.jpg']
MODE = ARGS[0] if ARGS else 'preview'
OUT = ARGS[1] if len(ARGS) > 1 else '/tmp/hall_preview.png'

HALL_R, WALL_T, WALL_H = 8.0, 0.5, 5.4
DOOR_W, DOOR_H, FD = 2.4, 2.75, 1.1
CEIL_Y = WALL_H + 3.0
N_DOORS, SPAN = 5, math.radians(150)
BEARINGS = [-SPAN / 2 + SPAN * (i + .5) / N_DOORS for i in range(N_DOORS)]
ACCENTS = ['#ff8fb0', '#7fe0a0', '#5ad0ff', '#b48bff', '#ffb35c']

# ---------------- 場景 ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col_root = bpy.data.collections.new('Hall'); scene.collection.children.link(col_root)

def srgb(h, k=1.0):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (lin[0] * k, lin[1] * k, lin[2] * k, 1.0)

MATS = {}
def mat(name, color, rough=.3, metal=0.0, coat=0.0, emit=None, emit_k=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = srgb(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if coat: p.inputs['Coat Weight'].default_value = coat; p.inputs['Coat Roughness'].default_value = .05
    if emit: p.inputs['Emission Color'].default_value = srgb(emit); p.inputs['Emission Strength'].default_value = emit_k
    MATS[name] = m; return m

M_WHITE = mat('cloud_dancer', '#f0eee9', .28)
M_PANEL = mat('panel', '#f5f3ef', .38)
M_TRIM = mat('trim', '#d3cdc2', .45)
M_TRIM2 = mat('trim2', '#e4e0d8', .35)
M_FLOOR = mat('floor_tile', '#efece6', .12, coat=.6)
M_METAL = mat('metal_inlay', '#b9b2a4', .28, metal=1.0)
M_SCREW = mat('screw_satin', '#cdc8bf', .38)                                     # 牆板螺絲:不用全金屬(烘光不算反射,全金屬會烘成一顆顆黑點)
M_DARK = mat('dark_glass', '#2a2a2e', .6)
def star_glass():
    m = bpy.data.materials.new('star_glass'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); vor = nt.nodes.new('ShaderNodeTexVoronoi'); ramp = nt.nodes.new('ShaderNodeValToRGB'); tc = nt.nodes.new('ShaderNodeTexCoord')
    vor.feature = 'F1'; vor.inputs['Scale'].default_value = 34
    nt.links.new(tc.outputs['Object'], vor.inputs['Vector']); nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    ramp.color_ramp.elements[1].position = 0.075; ramp.color_ramp.elements[1].color = (0.006, 0.01, 0.03, 1)
    nt.links.new(ramp.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = 2.4; nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m
M_STARS = star_glass()
M_WARM = mat('warm_light', '#000000', 1, emit='#ffd9a8', emit_k=14)
M_COOL = mat('cool_light', '#000000', 1, emit='#8fd4ff', emit_k=10)
M_PAD = mat('holo_pad', '#0c1a36', .2, emit='#1a4a8a', emit_k=.6)

def link(o):
    for c in o.users_collection: c.objects.unlink(o)
    col_root.objects.link(o); return o

def mesh_obj(name, bm, material, bevel=0.0, seg=2, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col_root.objects.link(o)
    o.data.materials.append(material)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(30)
        b.harden_normals = True
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    return o

def at(b, r, z=0.0): return Vector((math.sin(b) * r, math.cos(b) * r, z))

# 圓環的一段(實心),方位角 b0→b1、半徑 r0→r1、高度 z0→z1
def sector(name, r0, r1, b0, b1, z0, z1, material, bevel=0.0, seg=None):
    seg = seg or max(4, int(abs(b1 - b0) / math.radians(2.5)))
    bm = bmesh.new()
    ring = [];
    for k in range(seg + 1):
        b = b0 + (b1 - b0) * k / seg; ring.append((b,))
    vin = [bm.verts.new(at(b, r0, z0)) for (b,) in ring]; vout = [bm.verts.new(at(b, r1, z0)) for (b,) in ring]
    vin2 = [bm.verts.new(at(b, r0, z1)) for (b,) in ring]; vout2 = [bm.verts.new(at(b, r1, z1)) for (b,) in ring]
    for k in range(seg):
        bm.faces.new((vin[k], vin[k + 1], vout[k + 1], vout[k]))          # 底
        bm.faces.new((vin2[k], vout2[k], vout2[k + 1], vin2[k + 1]))      # 頂
        bm.faces.new((vin[k], vin2[k], vin2[k + 1], vin[k + 1]))          # 內面
        bm.faces.new((vout[k], vout[k + 1], vout2[k + 1], vout2[k]))      # 外面
    bm.faces.new((vin[0], vout[0], vout2[0], vin2[0])); bm.faces.new((vin[-1], vin2[-1], vout2[-1], vout[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, material, bevel)

def box(name, size, loc, material, rot_z=0.0, bevel=0.0, seg=3):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    o = mesh_obj(name, bm, material, bevel, seg)
    o.location = loc; o.rotation_euler = (0, 0, rot_z); return o

# 物件放在「門的區域座標」:x = 切線、y = 往大廳中心、z = 上;回傳世界座標的位置與旋轉
def door_frame(b, local):
    rot = Matrix.Rotation(math.pi - b, 4, 'Z'); base = at(b, HALL_R)
    return base + (rot @ Vector(local)), math.pi - b

def rounded_rect(cx, cy, w, h, r, n=10):
    pts = []
    for (x, y, a0) in [(cx + w / 2 - r, cy + h / 2 - r, 0), (cx - w / 2 + r, cy + h / 2 - r, 90), (cx - w / 2 + r, cy - h / 2 + r, 180), (cx + w / 2 - r, cy - h / 2 + r, 270)]:
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n); pts.append((x + math.cos(a) * r, y + math.sin(a) * r))
    return pts

# 有洞的圓角框(門框):2D 曲線填滿外框減內框,往厚度方向擠出 + 圓角
def frame_curve(name, ow, oh, iw, ih, r, depth, material, oy=0.0):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    cu.extrude = depth / 2; cu.bevel_depth = .035; cu.bevel_resolution = 3
    for pts in (rounded_rect(0, oy + oh / 2, ow, oh, r), rounded_rect(0, oy + oh / 2, iw, ih, r * .75)):
        sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, (x, y) in enumerate(pts): sp.points[i].co = (x, y, 0, 1)
        sp.use_cyclic_u = True
    o = bpy.data.objects.new(name, cu); col_root.objects.link(o); o.data.materials.append(material)
    return o

# ---------------- 地板:一塊塊有倒角的地磚(縫隙看得出來)----------------
BANDS = [(2.1, 2.72, 12), (2.72, 3.62, 16), (3.67, 4.3, 18), (4.36, 5.6, 24), (5.6, 6.8, 32), (6.8, 8.5, 40)]
GAP = .012
for bi, (r0, r1, nseg) in enumerate(BANDS):
    for k in range(nseg):
        b0 = k / nseg * 2 * math.pi + GAP / r0; b1 = (k + 1) / nseg * 2 * math.pi - GAP / r0
        sector(f'tile_{bi}_{k}', r0 + GAP, r1 - GAP, b0, b1, -.05, 0.0, M_FLOOR, bevel=.006)
sector('floor_base', 0, 8.6, 0, 2 * math.pi, -.12, -.04, M_TRIM2, seg=128)
for r in (5.6, 6.8):   # 金屬嵌條
    sector(f'inlay_{r}', r - .02, r + .02, 0, 2 * math.pi, -.05, .004, M_METAL, seg=160)
for r in (3.645, 4.33):  # 中央的暖光環
    sector(f'warm_ring_{r}', r - .022, r + .022, 0, 2 * math.pi, -.05, .003, M_WARM, seg=160)
# 中央:留白(使用者參考圖 A:移除中央裝置,只留地板的圓形設計)—— 一整片白地磚(邊緣只是一般的磚縫)
pad = bpy.data.objects.new('pad', bpy.data.meshes.new('pad')); col_root.objects.link(pad)
bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, radius=2.1 - GAP, segments=128); bm.to_mesh(pad.data); bm.free(); pad.location.z = 0.0; pad.data.materials.append(M_FLOOR)

# ---------------- 艙壁:整圈牆(門洞挖空)+ 一格格面板 + 腰帶 + 燈槽 ----------------
wall = sector('wall', HALL_R, HALL_R + WALL_T, 0, 2 * math.pi, 0, WALL_H, M_WHITE, seg=240)
cutters = bpy.data.collections.new('cutters'); scene.collection.children.link(cutters)
for i, b in enumerate(BEARINGS):
    p, rz = door_frame(b, (0, -.25, DOOR_H / 2))
    c = box(f'cut_{i}', (DOOR_W + .02, 2.0, DOOR_H), p, M_WHITE, rz); c.users_collection[0].objects.unlink(c); cutters.objects.link(c)
bo = wall.modifiers.new('doors', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.operand_type = 'COLLECTION'; bo.collection = cutters; bo.solver = 'EXACT'
cutters.hide_render = True; cutters.hide_viewport = True
# 面板:門與門之間、前半圈,每 1.6 公尺一片(下:護牆板、中:大面板、上:窄條),都有倒角、微凸
half = (DOOR_W / 2 + .55) / HALL_R
def free_arc(b):
    return all(abs(math.atan2(math.sin(b - d), math.cos(b - d))) > half + .05 for d in BEARINGS)
step = 1.62 / HALL_R
k = 0; b = 0.0
while b < 2 * math.pi:
    if free_arc(b) and free_arc(b + step):
        for (z0, z1, m, inset) in [(.42, 1.12, M_TRIM2, .03), (1.22, 3.35, M_PANEL, .035), (3.45, 4.6, M_PANEL, .03)]:
            sector(f'panel_{k}_{z0}', HALL_R - inset, HALL_R + .01, b + .012, b + step - .012, z0, z1, m, bevel=.012, seg=6)
        # 大面板裡再一圈淺淺的內框(雙層的感覺)+ 下半部一排通風格柵 + 四角螺絲
        e = .09 / HALL_R
        sector(f'panel_in_{k}', HALL_R - .05, HALL_R - .035, b + e, b + step - e, 1.45, 3.1, M_TRIM2, bevel=.008, seg=6)
        for v in range(5): sector(f'vent_{k}_{v}', HALL_R - .045, HALL_R - .03, b + step * .3, b + step * .7, .58 + v * .1, .62 + v * .1, M_TRIM, seg=4)
        for (bb, zz) in [(b + e * .6, 1.3), (b + step - e * .6, 1.3), (b + e * .6, 3.26), (b + step - e * .6, 3.26)]:
            sector(f'screw_{k}_{bb:.3f}_{zz}', HALL_R - .05, HALL_R - .036, bb - .004, bb + .004, zz - .03, zz + .03, M_SCREW, seg=2)
        sector(f'reveal_{k}', HALL_R - .006, HALL_R + .02, b - .0028, b + .0028, .38, 4.66, M_TRIM, seg=2)   # 面板之間的細縫(淺灰,不要像管子)
        k += 1
    b += step
for (z0, z1, m) in [(0, .34, M_TRIM), (4.72, 4.86, M_TRIM2), (WALL_H - .12, WALL_H, M_TRIM2)]:
    sector(f'band_{z0}', HALL_R - .07, HALL_R + .01, 0, 2 * math.pi, z0, z1, m, bevel=.01, seg=240)
for z in (.37, 4.9):
    sector(f'cove_{z}', HALL_R - .05, HALL_R - .03, 0, 2 * math.pi, z, z + .035, M_WARM, seg=240)

# ---------------- 柱子(門與門之間):倒角大的白柱 + 中間一道內凹燈槽 ----------------
pillars = [BEARINGS[0] - SPAN / N_DOORS / 2 + SPAN / N_DOORS * k for k in range(N_DOORS + 1)]
for i, b in enumerate(pillars):
    p, rz = door_frame(b, (0, .3, WALL_H / 2))
    box(f'pillar_{i}', (.78, .6, WALL_H), p, M_WHITE, rz, bevel=.09, seg=4)
    p2, _ = door_frame(b, (0, .61, WALL_H / 2 + .2)); box(f'pillar_groove_{i}', (.16, .06, WALL_H - 1.0), p2, M_TRIM, rz, bevel=.02)
    p3, _ = door_frame(b, (0, .64, WALL_H / 2 + .2)); box(f'pillar_light_{i}', (.045, .02, WALL_H - 1.3), p3, M_WARM, rz)
    p4, _ = door_frame(b, (0, .85, .3)); box(f'planter_{i}', (.86, .74, .6), p4, M_WHITE, rz, bevel=.08, seg=4)

# ---------------- 五道門:厚圓角門框 + 內凹槽 + 燈帶 + 門後的艙(該艙顏色的光)----------------
for i, b in enumerate(BEARINGS):
    p, rz = door_frame(b, (0, 0, 0))
    fr = frame_curve(f'door_frame_{i}', DOOR_W + .95, DOOR_H + .55, DOOR_W, DOOR_H + .1, .5, FD, M_WHITE, oy=-.05)
    fr.rotation_euler = (math.radians(90), 0, rz); fr.location = door_frame(b, (0, FD / 2 - .3, 0))[0]
    gl = frame_curve(f'door_light_{i}', DOOR_W + .24, DOOR_H + .2, DOOR_W + .06, DOOR_H + .08, .44, .02, M_WARM, oy=-.01)
    gl.data.bevel_depth = 0; gl.rotation_euler = (math.radians(90), 0, rz); gl.location = door_frame(b, (0, FD - .28, 0))[0]
    # 門口小平台
    box(f'door_step_{i}', (DOOR_W + .35, .8, .08), door_frame(b, (0, 1.15, .04))[0], M_TRIM2, rz, bevel=.02)
    # 艙:內壁、天花板、後牆發該艙的顏色
    # 展示艙:白色內壁 + 該艙顏色的燈條 + 後牆一面大螢幕(播那個作品的畫面)
    acc = ACCENTS[i]; M_ACC = mat(f'cabin_strip_{i}', '#000000', 1, emit=acc, emit_k=8)
    box(f'cabin_back_{i}', (DOOR_W + .4, .05, DOOR_H + .3), door_frame(b, (0, -2.95, (DOOR_H + .3) / 2))[0], M_PANEL, rz)
    for s in (-1, 1):
        box(f'cabin_side_{i}_{s}', (.1, 2.9, DOOR_H + .4), door_frame(b, (s * (DOOR_W / 2 + .25), -1.5, (DOOR_H + .4) / 2))[0], M_WHITE, rz)
        box(f'cabin_strip_{i}_{s}', (.03, 2.7, .035), door_frame(b, (s * (DOOR_W / 2 + .19), -1.5, .3))[0], M_ACC, rz)
        box(f'cabin_strip_top_{i}_{s}', (.03, 2.7, .035), door_frame(b, (s * (DOOR_W / 2 + .19), -1.5, DOOR_H + .25))[0], M_ACC, rz)
    box(f'cabin_ceil_{i}', (DOOR_W + .6, 3.1, .1), door_frame(b, (0, -1.5, DOOR_H + .42))[0], M_WHITE, rz)
    box(f'cabin_floor_{i}', (DOOR_W + .5, 3.0, .05), door_frame(b, (0, -1.5, .025))[0], M_TRIM2, rz)
    SW, SH = DOOR_W + .1, (DOOR_W + .1) * 9 / 16
    box(f'screen_bezel_{i}', (SW + .12, .08, SH + .12), door_frame(b, (0, -2.88, 1.5))[0], mat('bezel', '#15181e', .25, metal=.3), rz, bevel=.02)
    scm = bpy.data.materials.new(f'screen_{i}'); scm.use_nodes = True; nt = scm.node_tree; nt.nodes.clear()
    o_ = nt.nodes.new('ShaderNodeOutputMaterial'); em_ = nt.nodes.new('ShaderNodeEmission'); im_ = nt.nodes.new('ShaderNodeTexImage')
    im_.image = bpy.data.images.load(f'{SITE}/public/assets/{SHOTS[i]}'); nt.links.new(im_.outputs['Color'], em_.inputs['Color']); em_.inputs['Strength'].default_value = 1.1; nt.links.new(em_.outputs['Emission'], o_.inputs['Surface'])
    bpy.ops.mesh.primitive_plane_add(size=1); sc = link(bpy.context.active_object); sc.name = f'screen_{i}'; sc.scale = (SW, SH, 1); sc.data.materials.append(scm)
    sc.rotation_euler = (math.radians(90), 0, rz + math.pi); sc.location = door_frame(b, (0, -2.835, 1.5))[0]
    lp = bpy.data.lights.new(f'cabin_light_{i}', 'AREA'); lp.energy = 60; lp.color = srgb(acc)[:3]; lp.size = 1.6
    lo = bpy.data.objects.new(f'cabin_light_{i}', lp); col_root.objects.link(lo); lo.location = door_frame(b, (0, -1.4, DOOR_H + .3))[0]
    # 招牌底板(字留給網頁)
    box(f'sign_{i}', (3.2, .16, 1.05), door_frame(b, (0, .45, DOOR_H + 1.25))[0], M_PANEL, rz, bevel=.06, seg=4)
    sm = bpy.data.materials.new(f'sign_tex_{i}'); sm.use_nodes = True; pb = sm.node_tree.nodes['Principled BSDF']; pb.inputs['Roughness'].default_value = .45
    it = sm.node_tree.nodes.new('ShaderNodeTexImage'); it.image = bpy.data.images.load(f'{ROOT}/tex/sign_{i}.png'); sm.node_tree.links.new(it.outputs['Color'], pb.inputs['Base Color'])
    bpy.ops.mesh.primitive_plane_add(size=1); pl = link(bpy.context.active_object); pl.name = f'signtext_{i}'; pl.scale = (3.02, .99, 1); pl.data.materials.append(sm)
    pl.rotation_euler = (math.radians(90), 0, rz + math.pi); pl.location = door_frame(b, (0, .535, DOOR_H + 1.25))[0]

# ---------------- 天花板:斜面一圈窗(16 根樑 + 上下圈梁)+ 頂板 + 放射狀樑 + 天窗 + 中央吊柱 ----------------
def beam(name, p0, p1, w, h, material, bevel=.03):
    d = p1 - p0; L = d.length; o = box(name, (w, L, h), (p0 + p1) / 2, material, 0, bevel)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(d.normalized()); return o
R0, R1 = HALL_R + .45, 5.6
for k in range(16):
    b = k / 16 * 2 * math.pi
    beam(f'rib_{k}', at(b, R0, WALL_H), at(b, R1, CEIL_Y), .28, .32, M_WHITE)
    beam(f'rib_light_{k}', at(b, R0 - .17, WALL_H + .05), at(b, R1 - .12, CEIL_Y - .05), .035, .03, M_WARM, 0)
# 窗玻璃(深色,看出去是太空)
cone = bpy.data.objects.new('clerestory_glass', bpy.data.meshes.new('cg')); col_root.objects.link(cone)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=96, radius1=R0 + .05, radius2=R1 + .05, depth=CEIL_Y - WALL_H); bm.to_mesh(cone.data); bm.free()
cone.location.z = (WALL_H + CEIL_Y) / 2; cone.data.materials.append(M_STARS)
sector('ring_low', R0 - .3, R0 + .25, 0, 2 * math.pi, WALL_H - .05, WALL_H + .3, M_WHITE, bevel=.03, seg=240)
sector('ring_high', R1 - .25, R1 + .2, 0, 2 * math.pi, CEIL_Y - .2, CEIL_Y + .1, M_WHITE, bevel=.03, seg=240)
sector('ceiling', 3.0, R1, 0, 2 * math.pi, CEIL_Y, CEIL_Y + .15, M_WHITE, seg=240)
for k in range(12):
    b = k / 12 * 2 * math.pi + math.pi / 12
    beam(f'ceil_beam_{k}', at(b, 3.1, CEIL_Y - .14), at(b, R1 - .2, CEIL_Y - .14), .3, .26, M_TRIM2)
    beam(f'ceil_beam_light_{k}', at(b, 3.2, CEIL_Y - .28), at(b, R1 - .3, CEIL_Y - .28), .06, .02, M_WARM, 0)
bpy.ops.mesh.primitive_torus_add(major_radius=3.0, minor_radius=.22, major_segments=128, minor_segments=24, location=(0, 0, CEIL_Y + .1)); o = link(bpy.context.active_object); o.name = f'oculus_frame'; o.data.materials.append(M_WHITE)
bpy.ops.mesh.primitive_torus_add(major_radius=2.78, minor_radius=.03, major_segments=128, minor_segments=8, location=(0, 0, CEIL_Y - .05)); o = link(bpy.context.active_object); o.name = f'oculus_light'; o.data.materials.append(M_WARM)
bpy.ops.mesh.primitive_circle_add(vertices=96, radius=3.0, fill_type='NGON', location=(0, 0, CEIL_Y + .5)); o = link(bpy.context.active_object); o.name = f'oculus_glass'; o.data.materials.append(M_STARS)
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.34, depth=CEIL_Y + .5 - 6.4, location=(0, 0, (CEIL_Y + .5 + 6.4) / 2)); o = link(bpy.context.active_object); o.name = f'column'; o.data.materials.append(M_WHITE)
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.55, depth=.4, location=(0, 0, 6.25)); o = link(bpy.context.active_object); o.name = f'emitter_base'; o.data.materials.append(M_WHITE)
bpy.ops.mesh.primitive_torus_add(major_radius=.62, minor_radius=.035, major_segments=64, minor_segments=8, location=(0, 0, 6.05)); o = link(bpy.context.active_object); o.name = f'emitter_ring'; o.data.materials.append(M_COOL)
for o in col_root.objects:
    if o.type == 'MESH':
        for p in o.data.polygons: p.use_smooth = True


# ---------------- 植物與家具(Poly Haven CC0 模型,tools/blender/assets/)----------------
_cache = {}
_placed = []
def asset(name, keep=None):
    # 匯入一次,之後每次放置都複製(共用網格);keep = 只留名字包含這些字的物件
    if name not in _cache:
        before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=f'{ROOT}/assets/{name}/{name}.gltf')
        new = [o for o in bpy.data.objects if o not in before]
        objs = [o for o in new if o.type == 'MESH' and (not keep or any(k in o.name for k in keep))]
        for o in new:
            if o not in objs: bpy.data.objects.remove(o, do_unlink=True)
        # 只留下的那幾個,把它們的中心(xy)移到原點、底部貼地
        mn = [min((o.matrix_world @ Vector(c))[i] for o in objs for c in o.bound_box) for i in range(3)]
        mx = [max((o.matrix_world @ Vector(c))[i] for o in objs for c in o.bound_box) for i in range(3)]
        off = Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]))
        for o in objs:
            o.parent = None; o.matrix_world = Matrix.Translation(-off) @ o.matrix_world
            for c in o.users_collection: c.objects.unlink(o)
        _cache[name] = objs
    return _cache[name]
def place(name, pos, rot_z=0.0, scale=1.0, keep=None, recolor=None, prefix='prop'):
    """prefix='furn':不會動的家具,跟建築一起烘光(網站上看起來跟渲染圖一樣);拆掉父物件、直接留世界座標,烘焙時才合得起來"""
    root = bpy.data.objects.new(f'{prefix}_{name}_{len(_placed)}', None); col_root.objects.link(root); _placed.append(root)
    kids = []
    for o in asset(name, keep):
        c = o.copy(); col_root.objects.link(c); c.parent = root; c.name = f'{prefix}_{name}_{len(_placed)}_{o.name}'; kids.append(c)
        if recolor:
            for slot in c.material_slots:
                if slot.material and any(k in slot.material.name for k in recolor[0]): c.material_slots[slot.slot_index].link = 'OBJECT'; c.material_slots[slot.slot_index].material = recolor[1]
    root.location = pos; root.rotation_euler = (0, 0, rot_z); root.scale = (scale,) * 3
    if prefix == 'furn':
        bpy.context.view_layer.update()
        for c in kids: mw = c.matrix_world.copy(); c.parent = None; c.matrix_world = mw
        _placed.remove(root); bpy.data.objects.remove(root, do_unlink=True); return None
    return root
M_CERAMIC = mat('ceramic_white', '#f4f2ee', .18, coat=.4)
# 花盆土:白色花盆上緣往下挖一個淺槽(布林),填一層深色泥土 + 表面一些小土塊(使用者:植物都要有土)
import random
rng = random.Random(7)
def soil_mat():
    m = mat('soil', '#2b1f17', .96); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 90; nz.inputs['Detail'].default_value = 8
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = srgb('#1f1610'); ramp.color_ramp.elements[1].color = srgb('#4a3626')
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .9
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m
M_SOIL = soil_mat()
soil_cut = bpy.data.collections.new('soil_cutters'); scene.collection.children.link(soil_cut)
def dig(planter, cutter):
    for c in list(cutter.users_collection): c.objects.unlink(cutter)
    soil_cut.objects.link(cutter)
    bo = planter.modifiers.new('soil', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = cutter; bo.solver = 'EXACT'
M_PEBBLES = [mat('pebble_white', '#ebe7e0', .42), mat('pebble_grey', '#b9b5ae', .48), mat('pebble_beige', '#d6c8b2', .5)]
def clumps(name, pts, top, spread=None):
    """土面鋪一層裝飾用的鵝卵石(米白 / 淺灰 / 米色三種,扁圓、大小不一)。
    叫 prop_*:不烘光、網頁上即時打光(之前是幾顆很小的土塊跟建築一起烘,貼圖只分到幾個像素 → 變成一顆顆黑點)"""
    if spread: pts = [spread() for _ in range(len(pts) * 9)]                  # 鋪滿:原本 26~30 顆土塊 → 230~270 顆石頭(看起來是一層石頭,不是一顆顆白點)
    bms = [bmesh.new() for _ in M_PEBBLES]
    for x, y in pts:
        r = rng.uniform(.014, .032); k = rng.choices((0, 1, 2), (.5, .25, .25))[0]; bm = bms[k]
        g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        bmesh.ops.scale(bm, vec=(rng.uniform(1, 1.35), 1, rng.uniform(.42, .58)), verts=g['verts'])
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rng.uniform(0, math.tau), 3, 'Z'), verts=g['verts'])
        bmesh.ops.translate(bm, vec=(x, y, top + r * .22), verts=g['verts'])
    return [mesh_obj(f'prop_{name}_{k}', bm, M_PEBBLES[k], smooth=True) for k, bm in enumerate(bms)]
DEPTH, SOIL_DOWN = .06, .025                                  # 槽深、土面比花盆上緣低多少
# 柱腳方形花盆(.86 × .74,上緣 z = .6)
for i, b in enumerate(pillars):
    pl = bpy.data.objects[f'planter_{i}']
    p, rz = door_frame(b, (0, .85, .6))
    dig(pl, box(f'cut_soil_{i}', (.86 - .12, .74 - .12, DEPTH * 2), p, M_WHITE, rz))
    top = .6 - SOIL_DOWN
    s_ = box(f'soil_{i}', (.86 - .125, .74 - .125, DEPTH - SOIL_DOWN), (p.x, p.y, .6 - DEPTH + (DEPTH - SOIL_DOWN) / 2), M_SOIL, rz)
    def sq(p=p, rz=rz):                                                     # 方盆土面上的隨機一點
        lx_, ly_ = rng.uniform(-.335, .335), rng.uniform(-.275, .275)
        return (p.x + lx_ * math.cos(rz) - ly_ * math.sin(rz), p.y + lx_ * math.sin(rz) + ly_ * math.cos(rz))
    clumps(f'pebbles_{i}', [0] * 26, top, sq)
    # 植物種在土面上:輪流放火鶴花 / 肖竹芋
    pp = Vector((p.x, p.y, top - .01))
    if i % 2 == 0: place('anthurium_botany_01', pp, rz, 1.45, keep=['anthurium_botany_01_a'])
    else: place('calathea_orbifolia_01', pp, rz, 2.1, keep=['calathea_orbifolia_01_a'])
# 入口兩側:大白色圓花盆(上緣 z = .62)+ 發財樹;花盆本身不烘光(見下面 prop_ 的說明)
for sx in (-1, 1):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=.5, depth=.62, location=(sx * 3.6, -5.6, .31)); o = link(bpy.context.active_object); o.name = f'prop_planter_round_{sx}'; o.data.materials.append(M_CERAMIC)   # prop_:不烘光、網頁即時打光(烘的時候圓角邊緣分到的貼圖太細,會出現黑色髒邊)
    for pl in o.data.polygons: pl.use_smooth = True                      # 即時打光看得到每一面 → 平滑著色、128 段(不然側面一條條)
    bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = .04; bv.segments = 4; bv.limit_method = 'ANGLE'; bv.harden_normals = True
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=.44, depth=DEPTH * 2, location=(sx * 3.6, -5.6, .62)); dig(o, bpy.context.active_object); bpy.context.active_object.name = f'cut_soil_round_{sx}'
    top = .62 - SOIL_DOWN
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=.437, depth=DEPTH - SOIL_DOWN, location=(sx * 3.6, -5.6, .62 - DEPTH + (DEPTH - SOIL_DOWN) / 2))
    so = link(bpy.context.active_object); so.name = f'soil_round_{sx}'; so.data.materials.append(M_SOIL)
    def rd(sx=sx):                                                          # 圓盆土面上的隨機一點
        a_, r_ = rng.uniform(0, math.tau), .41 * math.sqrt(rng.random())
        return (sx * 3.6 + math.cos(a_) * r_, -5.6 + math.sin(a_) * r_)
    clumps(f'pebbles_round_{sx + 1}', [0] * 30, top, rd)
    place('pachira_aquatica_01', (sx * 3.6, -5.6, top - .04), sx * .8, 1.0, keep=['_d'])
soil_cut.hide_render = True; soil_cut.hide_viewport = True
# 左側休息區:弧形沙發 + 未來感茶几(在右側沙發後面蓋,因為要用到 curve_obj)
# 右側休息區:中古風躺椅 + 腳凳 + 邊桌 + 小盆栽
# 布面沙發、大理石桌面叫 furn_*:跟建築一起烘光(網頁上看起來跟渲染圖一樣);金屬零件叫 prop_*(即時打光,金屬烘不出來)
# 右側休息區:北歐輕奢的「豌豆沙發」(使用者給的參考圖):S 形的豆子坐墊 + 一長一短兩條圓滾滾的靠背 + 左端嵌一片古銅色圓托盤、
# 兩條靠背中間後面一張古銅小圓几。全部米白圈圈紗(boucle)。(前面的小圓桌 + 盆栽使用者不要,拿掉了)
# 先在「沙發自己的座標」蓋(x = 長邊、-y = 正面),最後整組轉到大廳裡,正面朝大廳中央偏入口(玩家站的地方)
def boucle(name, color):
    m = mat(name, color, .95)
    p = m.node_tree.nodes['Principled BSDF']; nt = m.node_tree
    p.inputs['Sheen Weight'].default_value = .8; p.inputs['Sheen Roughness'].default_value = .5
    vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 160; bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .6
    nt.links.new(vor.outputs['Distance'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m
M_BOUCLE = boucle('sofa_boucle', '#cfc1a8')
M_BRONZE = mat('bronze', '#9a8058', .32, metal=1.0)
def catmull(pts, n):
    """過控制點的平滑曲線"""
    out = []; pts = [(x, y, 0.0) for x, y in pts]
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = (Vector(P[j]) for j in (i - 1, i, i + 1, i + 2))
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(Vector(pts[-1])); return out
SPINE = catmull([(-1.35, .02), (-.8, .12), (-.1, .04), (.5, -.12), (1.05, -.06), (1.35, .08)], 14)   # 坐墊中線:S 形
def spine_frame(i):
    p = SPINE[i]; q = SPINE[min(i + 1, len(SPINE) - 1)] - SPINE[max(i - 1, 0)]; q.normalize()
    return p, Vector((-q.y, q.x, 0))                                             # 法線指向後方(+y 那側)
def width(u): return .92 - .1 * u                                               # 左邊深、右邊淺一點
def seat_outline():
    n = len(SPINE); back, front = [], []
    for i in range(n):
        p, nv = spine_frame(i); w = width(i / (n - 1)) / 2
        back.append(p + nv * w); front.append(p - nv * w)
    ring = back[:]
    p, nv = spine_frame(n - 1); t = Vector((nv.y, -nv.x, 0)); w = width(1) / 2
    ring += [p + nv * math.cos(a) * w + t * math.sin(a) * w for a in [math.pi * k / 12 for k in range(1, 12)]]   # 右端半圓
    ring += front[::-1]
    p, nv = spine_frame(0); t = Vector((-nv.y, nv.x, 0)); w = width(0) / 2
    ring += [p - nv * math.cos(a) * w + t * math.sin(a) * w for a in [math.pi * k / 12 for k in range(1, 12)]]   # 左端半圓
    return ring
def curve_obj(name, pts, cyclic, bevel, extrude=0.0, fill='BOTH', z=0.0, material=None, res=6, caps=True):
    cd = bpy.data.curves.new(name, 'CURVE'); cd.dimensions = '2D' if extrude else '3D'
    sp = cd.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for k, v in enumerate(pts): sp.points[k].co = (v.x, v.y, v.z if not extrude else 0, 1)
    sp.use_cyclic_u = cyclic; cd.bevel_depth = bevel; cd.bevel_resolution = res; cd.extrude = extrude
    if extrude: cd.fill_mode = fill
    else: cd.use_fill_caps = caps
    o = bpy.data.objects.new(name, cd); col_root.objects.link(o); o.location.z = z
    if material: o.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH'); o = bpy.context.active_object
    for pl in o.data.polygons: pl.use_smooth = True
    return o
sofa = []
# 坐墊:豆子形的厚墊,邊緣整圈圓角(高 0.46)
sofa.append(curve_obj('furn_sofa_seat', seat_outline(), True, .13, extrude=.1, z=.23, material=M_BOUCLE))
# 底下一圈內縮的深色踢腳,看起來輕一點
sofa.append(curve_obj('furn_sofa_kick', [v * .94 for v in seat_outline()], True, .0, extrude=.04, z=.04, material=mat('sofa_kick', '#4a4642', .5)))
def bolster(name, i0, i1, r, inset, wrap=0):
    """沿坐墊後緣的一條圓滾靠背;wrap > 0 = 在右端再繞過半圓往前包"""
    pts = []
    for i in range(i0, i1 + 1):
        p, nv = spine_frame(i); pts.append(p + nv * (width(i / (len(SPINE) - 1)) / 2 - inset))
    if wrap:
        p, nv = spine_frame(len(SPINE) - 1); t = Vector((nv.y, -nv.x, 0)); w = width(1) / 2 - inset
        pts += [p + nv * math.cos(a) * w + t * math.sin(a) * w for a in [math.radians(wrap) * k / 8 for k in range(1, 9)]]
    ZC, SZ = .62, 1.35                                                          # 靠背中心高度、上下拉長(胖胖的橢圓斷面,下半部埋進坐墊)
    for v in pts: v.z = 0
    o = curve_obj(name, pts, False, r, material=M_BOUCLE, res=8, caps=False)
    o.scale.z = SZ; o.location.z = ZC; bpy.ops.object.transform_apply(location=True, scale=True)
    # 兩端收成半球,剛好接在管子的斷面上(不用整顆球疊進去,烘光時重疊的地方會出現一條黑線)
    for v, w in ((pts[0], pts[1]), (pts[-1], pts[-2])):
        t = (v - w).normalized(); bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=18, radius=r)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=t, clear_inner=True)
        for vv in bm.verts: vv.co.z *= SZ; vv.co += Vector((v.x, v.y, ZC))
        e = mesh_obj(name + '_cap', bm, M_BOUCLE); sofa.append(e)
    sofa.append(o)
N = len(SPINE) - 1
bolster('furn_sofa_back_long', 2, int(N * .58), .2, .2)
bolster('furn_sofa_back_short', int(N * .76), N, .19, .19, wrap=100)
# 左端嵌的古銅托盤 + 兩條靠背中間後面的古銅小圓几
p, nv = spine_frame(0); t = (SPINE[0] - SPINE[1]).normalized()
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=.3, depth=.022, location=(p.x + t.x * .3 - nv.x * .1, p.y + t.y * .3 - nv.y * .1, .47)); e = link(bpy.context.active_object); e.data.materials.append(M_BRONZE); e.name = 'prop_sofa_tray'; sofa.append(e)
bv = e.modifiers.new('bevel', 'BEVEL'); bv.width = .008; bv.segments = 3
p, nv = spine_frame(int(N * .68)); tx, ty = p.x + nv.x * .62, p.y + nv.y * .62
for nm, r, d, z in (('top', .26, .02, .55), ('stem', .02, .54, .27), ('foot', .16, .015, .008)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64 if r > .05 else 24, radius=r, depth=d, location=(tx, ty, z)); e = link(bpy.context.active_object); e.data.materials.append(M_BRONZE); e.name = f'prop_sofa_sidetable_{nm}'; sofa.append(e)
# 整組擺進大廳:沙發中心 C(沿著大廳的圓,往入口那邊挪,方位角 116°、半徑 5.87),正面(-y)朝大廳中心、背靠牆(順著圓弧)
SOFA_B, SOFA_R = math.radians(116), 5.87
Cx, Cy = math.sin(SOFA_B) * SOFA_R, math.cos(SOFA_B) * SOFA_R
fx, fy = -Cx, -Cy; _n = math.hypot(fx, fy); fx, fy = fx / _n, fy / _n
th = math.atan2(fx, -fy)
M_SOFA = Matrix.Translation((Cx, Cy, 0)) @ Matrix.Rotation(th, 4, 'Z')
for o in sofa: o.matrix_world = M_SOFA @ o.matrix_world

# ---------------- 左側休息區(使用者參考圖):弧形皮沙發環抱一張未來感茶几 ----------------
# 茶几:亮白烤漆的水滴形矮几、上緣下方一圈金色燈縫、香檳金底座,一端有一個架高的圓形小桌(喇叭形腳);上面放兩本書、煙燻玻璃球、黃銅小碟
# 沙發:奶白皮革、弧形、分段坐墊與靠墊、兩端圓頭、內縮的金屬踢腳,米色 + 炭灰兩顆抱枕。全部 furn_*:跟建築一起烘光
def arc_block(name, cx, cy, r0, r1, a0, a1, z0, z1, material, lean=0.0, seg=64, bevel=0.0, bseg=4):
    """以 (cx, cy) 為圓心的一段環形實心塊;角度 a 從 +X 逆時針算;lean > 0 = 頂面內緣往外退(椅背往後仰)"""
    bm = bmesh.new(); rings = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg; c, s_ = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((cx + c * r, cy + s_ * r, z)) for r, z in ((r0, z0), (r1, z0), (r1, z1), (r0 + lean, z1))])
    for i in range(seg):
        A, B = rings[i], rings[i + 1]
        for k in range(4): bm.faces.new((A[k], B[k], B[(k + 1) % 4], A[(k + 1) % 4]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, material, bevel=bevel, seg=bseg)
def leather():
    m = mat('leather_cream', '#e0d7c9', .42, coat=.15); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 140; bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .12
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal']); return m
def rug_mat():
    m = mat('rug_gray', '#8f8a84', .98); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 260; nz.inputs['Detail'].default_value = 10
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = srgb('#77726c'); ramp.color_ramp.elements[1].color = srgb('#aaa49c')
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .8
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal']); return m
M_LEATHER = leather(); M_RUG = rug_mat()
M_LACQUER = mat('lacquer_white', '#f6f4f0', .12, coat=.8)
M_CHAMPAGNE = mat('champagne', '#c9b48e', .3, metal=1.0)
M_CHROME = mat('chrome', '#c4c6ca', .2, metal=1.0)
M_GOLDLED = mat('gold_led', '#000000', 1, emit='#ffc26b', emit_k=18)
LOUNGE_B, LOUNGE_R = math.radians(-116), 5.17                                 # 茶几中心:沿著大廳的圓往入口那邊挪(跟右邊沙發對稱)
TX, TY = math.sin(LOUNGE_B) * LOUNGE_R, math.cos(LOUNGE_B) * LOUNGE_R
fx, fy = -TX, -TY; _n = math.hypot(fx, fy); fx, fy = fx / _n, fy / _n          # 朝大廳中心:弧形沙發包在牆那一側(順著圓弧)
ab = math.atan2(-fy, -fx); SP = math.radians(72); A0, A1 = ab - SP, ab + SP     # 沙發包在玩家的反方向
# (使用者:左邊沙發不需要地毯)
# 沙發
R0, RS, R1 = 1.32, 1.95, 2.22                                                  # 坐墊前緣、靠墊內緣、靠背外緣
arc_block('furn_arc_kick', TX, TY, R0 + .07, R1 - .06, A0 + .02, A1 - .02, .0, .1, M_CHROME, seg=96, bevel=.01, bseg=2)
arc_block('furn_arc_base', TX, TY, R0, R1, A0, A1, .1, .27, M_LEATHER, seg=96, bevel=.05, bseg=4)
n, gap = 4, math.radians(.9); w = (A1 - A0 - gap * (n - 1)) / n
for k in range(n):
    a = A0 + k * (w + gap)
    arc_block(f'furn_arc_seat_{k}', TX, TY, R0 + .02, RS + .02, a, a + w, .27, .42, M_LEATHER, seg=24, bevel=.065, bseg=5)
    arc_block(f'furn_arc_back_{k}', TX, TY, RS, R1 - .02, a, a + w, .27, .76, M_LEATHER, lean=.07, seg=24, bevel=.08, bseg=5)
# 兩端圓頭:半圓柱,平的那面剛好貼在弧形的端面上、往外凸(不跟坐墊重疊,烘光才不會有黑縫)
for k, (a, sgn) in enumerate(((A0, -1), (A1, 1))):
    rm, rr = (R0 + R1) / 2, (R1 - R0) / 2
    cxe, cye = TX + math.cos(a) * rm, TY + math.sin(a) * rm
    out = Vector((-math.sin(a), math.cos(a), 0)) * sgn                         # 往弧形外面的切線方向
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=rr, radius2=rr, depth=.32)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=out, clear_inner=True)
    bmesh.ops.contextual_create(bm, geom=[e for e in bm.edges if e.is_boundary])   # 補上切開的平面
    bmesh.ops.translate(bm, vec=(cxe, cye, .26), verts=bm.verts)
    mesh_obj(f'furn_arc_end_{k}', bm, M_LEATHER, bevel=.06, seg=5)
for k, (da, col) in enumerate(((-.3, '#d9cfc1'), (.05, '#4b4946'), (.36, '#d9cfc1'))):   # 抱枕
    a = ab + da; bpy.ops.mesh.primitive_cube_add(size=1, location=(TX + math.cos(a) * (RS - .08), TY + math.sin(a) * (RS - .08), .58))
    o = link(bpy.context.active_object); o.name = f'furn_arc_pillow_{k}'; o.scale = (.13, .46, .34); o.rotation_euler = (0, -.3, a)
    o.data.materials.append(mat(f'arc_pillow_{col}', col, .85))
    bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = .09; bv.segments = 6
    for pl in o.data.polygons: pl.use_smooth = True
# 茶几(在自己的座標蓋:x = 長邊、-y = 朝玩家),最後轉進大廳
def drop(sc=1.0, n=96):
    pts = []
    for k in range(n):
        t = math.tau * k / n; c = math.cos(t)
        pts.append(Vector((.8 * c * sc, .47 * math.sin(t) * (1 - .4 * max(0.0, c) ** 2) * sc, 0)))
    return pts
table = []
table.append(curve_obj('furn_tbl_top', drop(1.0), True, .03, extrude=.025, z=.285, material=M_LACQUER))     # .23 ~ .34
table.append(curve_obj('furn_tbl_body', drop(.8), True, .03, extrude=.035, z=.13, material=M_LACQUER))      # .065 ~ .195(內縮,上緣下方留一道發光的縫)
table.append(curve_obj('furn_tbl_led', drop(.86), True, .009, z=.212, material=M_GOLDLED))
table.append(curve_obj('furn_tbl_led_low', drop(.76), True, .006, z=.062, material=M_GOLDLED))   # 底座上緣也一圈
table.append(curve_obj('furn_tbl_plinth', drop(.72), True, .012, extrude=.02, z=.035, material=M_CHAMPAGNE))
PX = .6                                                                        # 架高小圓桌的位置(水滴尖的那頭)
bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=.12, radius2=.2, depth=.12, location=(PX, 0, .4)); o = link(bpy.context.active_object); o.name = 'furn_tbl_neck'; o.data.materials.append(M_LACQUER); table.append(o)
bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = .02; bv.segments = 3
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.31, depth=.07, location=(PX, 0, .495)); o = link(bpy.context.active_object); o.name = 'furn_tbl_tier'; o.data.materials.append(M_LACQUER); table.append(o)
bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = .028; bv.segments = 5
bpy.ops.mesh.primitive_torus_add(major_radius=.24, minor_radius=.005, major_segments=96, minor_segments=8, location=(PX, 0, .458)); o = link(bpy.context.active_object); o.name = 'furn_tbl_tier_led'; o.data.materials.append(M_GOLDLED); table.append(o)
# 擺飾:兩本書 + 煙燻玻璃球 + 黃銅小碟
for k, (sz, col, z) in enumerate((((.24, .17, .024), '#1e1e23', .352), ((.22, .155, .02), '#2f2d33', .374))):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-.25, .03, z)); o = link(bpy.context.active_object); o.name = f'furn_tbl_book_{k}'; o.scale = sz; o.rotation_euler = (0, 0, .12 * (k * 2 - 1))
    o.data.materials.append(mat(f'book_{k}', col, .6)); bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = .004; bv.segments = 2; table.append(o)
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=.065, location=(-.23, .04, .449)); o = link(bpy.context.active_object); o.name = 'furn_tbl_sphere'; o.data.materials.append(mat('smoke_glass', '#7d8188', .08, coat=1.0)); table.append(o)
for pl in o.data.polygons: pl.use_smooth = True
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.055, depth=.016, location=(.02, -.1, .348)); o = link(bpy.context.active_object); o.name = 'furn_tbl_dish'; o.data.materials.append(mat('brass', '#b8955a', .3, metal=1.0)); table.append(o)
bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = .006; bv.segments = 2
th2 = math.atan2(fx, -fy)
M_TBL = Matrix.Translation((TX, TY, 0)) @ Matrix.Rotation(th2, 4, 'Z')
for o in table: o.matrix_world = M_TBL @ o.matrix_world

# ---------------- 燈光:天窗冷光 + 暖光補 + 世界(太空的深藍)----------------
sky = bpy.data.lights.new('skylight', 'AREA'); sky.shape = 'DISK'; sky.size = 5.6; sky.energy = 1500; sky.color = (0.86, 0.92, 1.0)
so = bpy.data.objects.new('skylight', sky); col_root.objects.link(so); so.location = (0, 0, CEIL_Y + .3)
fill = bpy.data.lights.new('fill', 'AREA'); fill.size = 10; fill.energy = 380; fill.color = (1.0, 0.94, 0.86)
fo = bpy.data.objects.new('fill', fill); col_root.objects.link(fo); fo.location = (0, -2, 7.8)
world = bpy.data.worlds.new('space'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.004, 0.006, 0.014, 1); world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1

# ---------------- 鏡頭:跟網頁一樣站在入口平視 ----------------
cam_d = bpy.data.cameras.new('cam'); cam_d.sensor_fit = 'VERTICAL'; cam_d.angle = math.radians(56); cam_d.clip_start = .05
cam = bpy.data.objects.new('cam', cam_d); col_root.objects.link(cam); scene.camera = cam
VIEW = ARGS[3] if len(ARGS) > 3 else 'main'
eye, look, fov = (Vector((0, -7.4, 2.2)), Vector((0, 3.0, 1.55)), 56)
if VIEW == 'bay':      # 第二道門的展示艙特寫
    b = BEARINGS[1]; eye, look, fov = at(b, 4.6, 1.75), at(b, 8.6, 1.9), 48
elif VIEW == 'lounge': # 左邊休息區(弧形沙發 + 茶几)
    eye, look, fov = Vector((-2.0, -4.4, 1.6)), Vector((-5.3, -.9, .45)), 52
elif VIEW == 'planter': # 柱腳花盆特寫(看土)
    b = pillars[2]; eye, look, fov = at(b, HALL_R - 2.4, 1.6), at(b, HALL_R - .9, .5), 45
elif VIEW == 'entry': # 入口的大圓花盆(發財樹)
    eye, look, fov = Vector((1.6, -3.6, 1.9)), Vector((3.6, -5.6, .45)), 45
elif VIEW == 'rlounge': # 右邊休息區(躺椅)
    eye, look, fov = Vector((2.2, -4.6, 1.5)), Vector((5.6, -.4, .9)), 50
cam_d.angle = math.radians(fov); cam.location = eye
d = look - eye; cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = d.to_track_quat('-Z', 'Y')

# ---------------- 渲染設定 ----------------
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
for dv in prefs.devices: dv.use = True
scene.cycles.device = 'GPU'; scene.cycles.samples = int(ARGS[2]) if len(ARGS) > 2 else 160
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'
for lk in ('AgX - Medium High Contrast', 'Medium High Contrast', 'AgX - Base Contrast'):
    try: scene.view_settings.look = lk; break
    except Exception: pass
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.render.filepath = OUT; scene.render.image_settings.file_format = 'PNG'
bpy.ops.wm.save_as_mainfile(filepath=OUT.rsplit('.', 1)[0] + '.blend')
if MODE == 'preview':
    bpy.ops.render.render(write_still=True)
    print('RENDERED', OUT)
