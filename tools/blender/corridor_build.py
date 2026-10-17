# 機庫氣閘門 → 大廳之間的白色通道(使用者:通道要升級品質):八角形斷面、每 3 公尺一道發光肋環、天花板燈帶、牆面腰線燈、
# 地板中央藍色導引燈 + 兩側格柵、中段兩側一排看出去是太空和星球的窗、兩道厚的艙壁(網頁上的滑門卡在這裡)。
# 座標:Blender (x, y, z) = 網頁 (x, z, -y) → 通道沿 Blender +y(網頁 -z),網頁 z 16 ~ -54 = Blender y -16 ~ 54;地板 z = -2.34
# 用法:blender -b --python tools/blender/corridor_build.py -- preview out.png [samples] [view]
#       blender -b --python tools/blender/corridor_build.py -- bake [輸出 glb] [samples]
import bpy, bmesh, sys, os, math, random
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MODE = ARGS[0] if ARGS else 'preview'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
rng = random.Random(5)

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c) + (1,)
MATS = {}
def mat(name, color, rough=.4, metal=0.0, coat=0.0, emit=None, k=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = srgb(color); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat
    if emit: p.inputs['Emission Color'].default_value = srgb(emit); p.inputs['Emission Strength'].default_value = k
    MATS[name] = m; return m
def plated(name, color, rough, scale=.9, seam=.5):
    """白色面板:物件座標的 Brick 貼圖(依法線挑平面)→ 接縫壓暗 + 凹凸"""
    m = mat(name, color, rough, .05, coat=.3); nt = m.node_tree; p = nt.nodes['Principled BSDF']; L = nt.links
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs['Vector'])
    geo = nt.nodes.new('ShaderNodeNewGeometry'); ns = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], ns.inputs['Vector'])
    def absn(c):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = 'ABSOLUTE'; L.new(ns.outputs[c], n.inputs[0]); return n.outputs[0]
    ax, az = absn('X'), absn('Z')
    def brick(u, v):
        cb = nt.nodes.new('ShaderNodeCombineXYZ'); L.new(sep.outputs[v], cb.inputs['X']); L.new(sep.outputs[u], cb.inputs['Y'])
        b = nt.nodes.new('ShaderNodeTexBrick'); L.new(cb.outputs['Vector'], b.inputs['Vector'])
        b.inputs['Scale'].default_value = scale; b.inputs['Mortar Size'].default_value = .01; b.inputs['Mortar Smooth'].default_value = .15
        b.inputs['Brick Width'].default_value = 2.0; b.inputs['Row Height'].default_value = .7; b.offset = .5
        b.inputs['Color1'].default_value = (.95, .95, .95, 1); b.inputs['Color2'].default_value = (1, 1, 1, 1); b.inputs['Mortar'].default_value = (1 - seam * .6,) * 3 + (1,)
        return b
    bw, bf = brick('Z', 'Y'), brick('X', 'Y')                                   # 牆(看 y-z)、地板 / 天花板(看 y-x)
    top = nt.nodes.new('ShaderNodeMath'); top.operation = 'GREATER_THAN'; L.new(az, top.inputs[0]); L.new(ax, top.inputs[1])
    mc = nt.nodes.new('ShaderNodeMix'); mc.data_type = 'RGBA'; L.new(top.outputs[0], mc.inputs['Factor']); L.new(bw.outputs['Color'], mc.inputs[6]); L.new(bf.outputs['Color'], mc.inputs[7])
    mf = nt.nodes.new('ShaderNodeMix'); mf.data_type = 'FLOAT'; L.new(top.outputs[0], mf.inputs['Factor']); L.new(bw.outputs['Fac'], mf.inputs['A']); L.new(bf.outputs['Fac'], mf.inputs['B'])
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
    mul.inputs[6].default_value = srgb(color); L.new(mc.outputs[2], mul.inputs[7]); L.new(mul.outputs[2], p.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .4; bump.inputs['Distance'].default_value = .015; bump.invert = True
    L.new(mf.outputs['Result'], bump.inputs['Height']); L.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m
M_WALL = plated('cor_wall', '#e6e3dd', .3)
M_TRIM = mat('cor_trim', '#dcd8d0', .35, coat=.3)
M_FLOOR = plated('cor_floor', '#e9e6e0', .18, scale=.7, seam=.6)
M_DARK = mat('cor_dark', '#3a3d44', .55, .4)
M_WARM = mat('cor_warm', '#000000', 1, emit='#ffd9a8', k=9)
M_COOL = mat('cor_cool', '#000000', 1, emit='#8fd4ff', k=9)
M_HAZ = mat('cor_hazard', '#d9a23a', .5)
M_WIN = mat('cor_window', '#05070d', .05)                                       # 網頁上換成看得到太空 / 星球的材質

def obj(name, bm, m, bevel=0.0, seg=2, smooth=False):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(30)
    for p in o.data.polygons: p.use_smooth = smooth
    return o
def box(name, size, loc, m, rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    o = obj(name, bm, m, bevel); o.location = loc; o.rotation_euler = rot; return o

FLOOR, Y0, Y1 = -2.34, -16.0, 54.0
PROF = [(-2.0, FLOOR), (2.0, FLOOR), (3.2, -1.25), (3.2, 1.5), (2.1, 2.7), (-2.1, 2.7), (-3.2, 1.5), (-3.2, -1.25)]   # 通道斷面(x, z)
def scaled(prof, k, kz=None, cz=.18):
    kz = k if kz is None else kz
    return [(x * k, FLOOR if z == FLOOR else cz + (z - cz) * kz) for x, z in prof]
def shell(name, prof, y0, y1, m, inward=True, segs=1):
    """沿 y 擠出的八角管(面朝內)"""
    bm = bmesh.new(); rings = []
    for i in range(segs + 1):
        y = y0 + (y1 - y0) * i / segs; rings.append([bm.verts.new((x, y, z)) for x, z in prof])
    n = len(prof)
    for A, B in zip(rings, rings[1:]):
        for k in range(n):
            f = (A[k], B[k], B[(k + 1) % n], A[(k + 1) % n]); bm.faces.new(f if inward else f[::-1])
    return obj(name, bm, m)
def frame(name, outer, inner, y, depth, m, bevel=.03):
    """兩個斷面之間的環形實心框(肋環 / 艙壁)"""
    bm = bmesh.new(); n = len(outer)
    rows = [[bm.verts.new((x, y + dy, z)) for x, z in pr] for dy in (-depth / 2, depth / 2) for pr in (outer, inner)]
    o0, i0, o1, i1 = rows
    for k in range(n):
        k2 = (k + 1) % n
        if k == 0: continue                                                     # 地板那一邊不做(會跟地板疊在一起,烘出黑線)
        bm.faces.new((o0[k], o0[k2], i0[k2], i0[k])); bm.faces.new((o1[k], i1[k], i1[k2], o1[k2]))   # 前後兩面
        bm.faces.new((i0[k], i0[k2], i1[k2], i1[k]))                         # 內圈(外圈貼著牆、看不到,不做:不然烘光會在牆上留黑線)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, m, bevel)

# ---- 1) 外殼(分三段:牆 / 地板 / 天花板用不同材質)----
def strip_faces(name, idxs, m):
    bm = bmesh.new(); n = len(PROF)
    for k in idxs:
        (x0, z0), (x1, z1) = PROF[k], PROF[(k + 1) % n]
        v = [bm.verts.new((x0, Y0, z0)), bm.verts.new((x0, Y1, z0)), bm.verts.new((x1, Y1, z1)), bm.verts.new((x1, Y0, z1))]
        bm.faces.new(v)
    for f in bm.faces: f.normal_update()
    o = obj(name, bm, m); return o
strip_faces('cor_floor', [0], M_FLOOR); strip_faces('cor_ceiling', [4], M_WALL); strip_faces('cor_walls', [1, 2, 3, 5, 6, 7], M_WALL)
for o in [bpy.data.objects[n] for n in ('cor_floor', 'cor_ceiling', 'cor_walls')]:      # 確保面朝內(朝通道中心)
    bm = bmesh.new(); bm.from_mesh(o.data)
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.dot(Vector((0, c.y, .18)) - c) < 0: f.normal_flip()
    bm.to_mesh(o.data); bm.free()
# 兩端封口:起點是白牆,終點是一面發亮的牆(大廳的光)
for y, m in ((Y0, M_WALL), (Y1 - .01, mat('cor_endlight', '#000000', 1, emit='#fff6ea', k=6))):
    bm = bmesh.new(); vs = [bm.verts.new((x, y, z)) for x, z in PROF]; bm.faces.new(vs if y > 0 else vs[::-1]); obj('cor_end_%d' % y, bm, m)

# ---- 2) 肋環:每 3 公尺一道,內側一圈暖光 ----
DOORS = (0.0, 44.0)
ribs = [y for y in [Y0 + 2 + 3 * k for k in range(30)] if y < Y1 - 2 and all(abs(y - d) > 1.6 for d in DOORS)]
INNER = scaled(PROF, .93, .93)
for y in ribs:
    frame(f'cor_rib_{y:.0f}', [(x * 1.001, z) for x, z in PROF], INNER, y, .34, M_TRIM)
    frame(f'cor_riblight_{y:.0f}', INNER, scaled(PROF, .915, .915), y, .08, M_WARM, 0)
# ---- 3) 艙壁(門框):厚、開口小一點,開口內緣一圈暖光,門檻黃黑斜紋 ----
OPEN = [(-1.7, FLOOR), (1.7, FLOOR), (2.6, -1.4), (2.6, 1.2), (1.8, 2.1), (-1.8, 2.1), (-2.6, 1.2), (-2.6, -1.4)]
OPEN_IN = [(x * 1.03, z if z == FLOOR else .1 + (z - .1) * 1.03) for x, z in OPEN]
for d in DOORS:
    frame(f'cor_bulk_{d:.0f}', [(x * 1.001, z) for x, z in PROF], OPEN, d, 1.0, M_TRIM, .05)
    for side in (-1, 1): frame(f'cor_bulklight_{d:.0f}_{side}', OPEN_IN, OPEN, d + side * .52, .05, M_WARM, 0)
    for k in range(10):
        box(f'cor_haz_{d:.0f}_{k}', (.16, 1.0, .012), (-1.5 + k * .33, d, FLOOR + .006), M_HAZ, rot=(0, 0, math.radians(30)))
    box(f'cor_doorlabel_{d:.0f}', (1.6, .04, .18), (0, d - .52, 1.75), M_COOL)
# ---- 4) 燈帶:天花板中央、兩側腰線(在肋環之間斷開)----
cuts = sorted(ribs + list(DOORS))
segs = [(a + .25, b - .25) for a, b in zip([Y0] + cuts, cuts + [Y1]) if b - a > 1]
for a, b in segs:
    box(f'cor_ceil_light_{a:.0f}', (1.1, b - a - .3, .04), (0, (a + b) / 2, 2.68), M_WARM)
    for s in (-1, 1):
        box(f'cor_waist_{s}_{a:.0f}', (.04, b - a - .3, .06), (s * 3.18, (a + b) / 2, -.95), M_WARM)
        box(f'cor_wallpanel_{s}_{a:.0f}', (.06, b - a - .5, 1.9), (s * 3.17, (a + b) / 2, .35), M_TRIM, bevel=.03)   # 牆上微凸的大面板
# ---- 5) 地板:中央藍色導引燈、兩側深色格柵、斜牆下緣通風口 ----
y = Y0 + 1
while y < Y1 - 1:
    if all(abs(y - d) > .7 for d in DOORS): box(f'cor_guide_{y:.1f}', (.1, .35, .02), (0, y, FLOOR + .01), M_COOL)
    y += .9
for s in (-1, 1):
    box(f'cor_grate_{s}', (.32, Y1 - Y0, .02), (s * 1.78, (Y0 + Y1) / 2, FLOOR + .008), M_DARK)
    for a, b in segs[::2]:
        for k in range(6):
            box(f'cor_vent_{s}_{a:.0f}_{k}', (.04, b - a - 1.2, .04), (s * (2.25 + k * .13), (a + b) / 2, FLOOR + .2 + k * .17), M_DARK, rot=(0, s * math.radians(-40), 0))
# ---- 6) 窗:中段兩側,每一格肋環之間一扇圓角長窗(網頁上看出去是太空 + 星球)----
win_segs = [(a, b) for a, b in segs if 12 < a < 34]
for s in (-1, 1):
    for a, b in win_segs:
        yc, L = (a + b) / 2, b - a - .9
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(.02, L, 1.5), verts=bm.verts)
        o = obj(f'cor_window_{s}_{a:.0f}', bm, M_WIN); o.location = (s * 3.12, yc, .5)
        frame_bm = bmesh.new()
        box(f'cor_winframe_t_{s}_{a:.0f}', (.1, L + .2, .1), (s * 3.1, yc, 1.3), M_DARK, bevel=.02)
        box(f'cor_winframe_b_{s}_{a:.0f}', (.1, L + .2, .1), (s * 3.1, yc, -.3), M_DARK, bevel=.02)
        for e in (-1, 1): box(f'cor_winframe_s_{s}_{a:.0f}_{e}', (.1, .1, 1.7), (s * 3.1, yc + e * (L / 2 + .05), .5), M_DARK, bevel=.02)
for o in [o for o in scene.objects if o.name.startswith('cor_wallpanel_')]:
    if any(12 < float(o.name.split('_')[-1]) < 34 for _ in [0]): bpy.data.objects.remove(o, do_unlink=True)   # 有窗的那幾格不放大面板

# ---- 燈(烘光用):每一格天花板一盞面光 ----
for a, b in segs:
    L_ = bpy.data.lights.new(f'cl_{a:.0f}', 'AREA'); L_.shape = 'RECTANGLE'; L_.size = 1.0; L_.size_y = b - a - .4; L_.energy = 26 * (b - a); L_.color = (1, .95, .88)
    lo = bpy.data.objects.new(f'cl_{a:.0f}', L_); scene.collection.objects.link(lo); lo.location = (0, (a + b) / 2, 2.6)
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (.02, .02, .03, 1)

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
for dv in prefs.devices: dv.use = True
scene.cycles.device = 'GPU'
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'

if MODE == 'preview':
    out = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else '/tmp/corridor.png'
    view = ARGS[3] if len(ARGS) > 3 else 'start'
    eye, look = {'start': ((0, -13, .2), (0, 0, .1)), 'mid': ((.4, 10, .2), (-.6, 24, .3)), 'door': ((0, 38, .2), (0, 44, .2))}[view]
    cd = bpy.data.cameras.new('c'); cd.lens = 18; cam = bpy.data.objects.new('c', cd); scene.collection.objects.link(cam); scene.camera = cam
    cam.location = eye; cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y')
    for o in [o for o in scene.objects if o.name.startswith('cor_window_')]: o.data.materials[0] = mat('cor_window_prev', '#000000', 1, emit='#16243f', k=1.5)
    scene.cycles.samples = int(ARGS[2]) if len(ARGS) > 2 else 96; scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000; scene.render.filepath = out
    bpy.ops.render.render(write_still=True); print('rendered', out)
else:
    OUT = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'starship', 'models', 'corridor.glb')
    SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 384
    TMP = os.path.join(os.path.dirname(__file__), 'bake_tmp'); os.makedirs(TMP, exist_ok=True)
    def select_only(objs):
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
    wins = [o for o in scene.objects if o.type == 'MESH' and o.name.startswith('cor_window_')]
    rest = [o for o in scene.objects if o.type == 'MESH' and o not in wins]
    select_only(rest); bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
    sh = bpy.context.view_layer.objects.active; sh.name = 'cor_baked'; sh.data.name = 'cor_baked'
    me = sh.data
    while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='uv')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.004, scale_to_bounds=False)
    try: bpy.ops.uv.pack_islands(rotate=True, margin=.004, shape_method='CONCAVE')
    except Exception: bpy.ops.uv.pack_islands(rotate=True, margin=.002)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('cor_lit', 4096, 4096, float_buffer=True, alpha=False)
    for slot in sh.material_slots:
        nt = slot.material.node_tree; n = nt.nodes.new('ShaderNodeTexImage'); n.name = '__bake__'; n.image = img; nt.nodes.active = n
    bk = scene.render.bake; bk.margin = 16; bk.margin_type = 'EXTEND'; bk.target = 'IMAGE_TEXTURES'
    bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_diffuse = True; bk.use_pass_glossy = False; bk.use_pass_transmission = False; bk.use_pass_emit = True
    scene.cycles.samples = SAMPLES; select_only([sh]); print('baking ...', flush=True)
    bpy.ops.object.bake(type='COMBINED')
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_depth = '8'
    png = os.path.join(TMP, 'cor_lit.png'); img.save_render(png, scene=scene)
    m = bpy.data.materials.new('cor_baked'); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']; t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(png)
    m.node_tree.links.new(t.outputs['Color'], p.inputs['Base Color'])
    me.materials.clear(); me.materials.append(m)
    for poly in me.polygons: poly.material_index = 0
    select_only([sh] + wins)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_image_format='WEBP', export_image_quality=86)
    print('exported', OUT, os.path.getsize(OUT) // 1024, 'KB')
