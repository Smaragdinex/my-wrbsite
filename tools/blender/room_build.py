# 作品艙(從大廳的門走進去的房間)用 Blender 建模 + Cycles 打光,之後 room_bake.py 烘成網頁用的模型。
# 跟大廳同一套白色艦艙風格(亮面白牆、暖光燈槽、星空窗),每間依作品換主題。
# 座標(Blender,Z 朝上):房間 x -W/2~W/2、y 0(入口那面牆)~D(後牆)、z 0~H。網頁(Y 朝上)= (x, z, -y):入口在 z 0,往 -z 走進去。
# 用法:blender -b --python tools/blender/room_build.py -- <room> preview out.png [samples] [view]
#       room:kitty(先做這間;其他之後照同樣做法加)
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(ROOT, '..', '..'))
ROOM = ARGS[0] if ARGS else 'kitty'
MODE = ARGS[1] if len(ARGS) > 1 else 'preview'
OUT = ARGS[2] if len(ARGS) > 2 else '/tmp/room_preview.png'
SAMPLES = int(ARGS[3]) if len(ARGS) > 3 else 128
VIEW = ARGS[4] if len(ARGS) > 4 else 'main'

W, D, H = 10.0, 9.0, 4.2               # 房間寬、深、高
DOOR_W, DOOR_H = 2.4, 2.75              # 入口(跟大廳的門一樣大)
EYE = Vector((0, .8, 1.65))             # 網頁的鏡頭:站在入口裡面一點

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = bpy.data.collections.new('Room'); scene.collection.children.link(col)
rng = random.Random(11)

def srgb(h, k=1.0):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (lin[0] * k, lin[1] * k, lin[2] * k, 1.0)
MATS = {}
def mat(name, color, rough=.3, metal=0.0, coat=0.0, emit=None, emit_k=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = srgb(color); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    if coat: p.inputs['Coat Weight'].default_value = coat; p.inputs['Coat Roughness'].default_value = .05
    if emit: p.inputs['Emission Color'].default_value = srgb(emit); p.inputs['Emission Strength'].default_value = emit_k
    MATS[name] = m; return m
def stripes(name, a, b, n_per_m=4.0, axis='X', rough=.5):
    """直條紋壁紙(跟遊戲畫面的奶油色條紋牆一樣):用物件座標算,不用展 UV"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; mm.inputs[1].default_value = n_per_m
    fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; st = nt.nodes.new('ShaderNodeMath'); st.operation = 'GREATER_THAN'; st.inputs[1].default_value = .5
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs['A'].default_value = srgb(a); mx.inputs['B'].default_value = srgb(b)
    nt.links.new(tc.outputs['Object'], sep.inputs[0]); nt.links.new(sep.outputs[axis], mm.inputs[0]); nt.links.new(mm.outputs[0], fr.inputs[0]); nt.links.new(fr.outputs[0], st.inputs[0])
    nt.links.new(st.outputs[0], mx.inputs['Factor']); nt.links.new(mx.outputs['Result'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = rough
    return m
def star_glass():
    m = bpy.data.materials.new('star_glass'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); vor = nt.nodes.new('ShaderNodeTexVoronoi'); ramp = nt.nodes.new('ShaderNodeValToRGB'); tc = nt.nodes.new('ShaderNodeTexCoord')
    vor.feature = 'F1'; vor.inputs['Scale'].default_value = 26
    nt.links.new(tc.outputs['Object'], vor.inputs['Vector']); nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    ramp.color_ramp.elements[1].position = 0.06; ramp.color_ramp.elements[1].color = (0.006, 0.01, 0.03, 1)
    nt.links.new(ramp.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = 2.2; nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m

def link(o):
    for c in o.users_collection: c.objects.unlink(o)
    col.objects.link(o); return o
def mesh_obj(name, bm, material, bevel=0.0, seg=2, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o)
    if isinstance(material, (list, tuple)):
        for m in material: o.data.materials.append(m)
    else: o.data.materials.append(material)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(30); b.harden_normals = True
    for p in o.data.polygons: p.use_smooth = smooth
    return o
def box(name, size, loc, material, rot_z=0.0, bevel=0.0, seg=3):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts); bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rot_z, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return mesh_obj(name, bm, material, bevel, seg)
def cyl(name, r, h, loc, material, verts=48, r2=None, bevel=0.0, rot=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=h)
    if rot: bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return mesh_obj(name, bm, material, bevel, 2)
def sphere(name, r, loc, material, scale=(1, 1, 1), seg=32):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts); bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return mesh_obj(name, bm, material)
def text(name, s, loc, size, material, rot=(math.radians(90), 0, 0), extrude=.01, align='CENTER', font_bold=True):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = s; cu.size = size; cu.extrude = extrude; cu.align_x = align; cu.align_y = 'CENTER'
    try: cu.font = bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf' if font_bold else '/System/Library/Fonts/Supplemental/Arial.ttf')
    except Exception: pass
    o = bpy.data.objects.new(name, cu); col.objects.link(o); o.data.materials.append(material); o.location = loc; o.rotation_euler = rot
    return o

# 匯入 Poly Haven 模型(tools/blender/assets/,CC0);prefix 'prop' = 網頁即時打光(植物),'furn' = 跟建築一起烘
_cache = {}; _n = [0]
def asset(name):
    if name not in _cache:
        before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=f'{ROOT}/assets/{name}/{name}.gltf')
        objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        for o in [o for o in bpy.data.objects if o not in before and o not in objs]: bpy.data.objects.remove(o, do_unlink=True)
        mn = [min((o.matrix_world @ Vector(c))[i] for o in objs for c in o.bound_box) for i in range(3)]
        mx = [max((o.matrix_world @ Vector(c))[i] for o in objs for c in o.bound_box) for i in range(3)]
        off = Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]))
        for o in objs:
            o.parent = None; o.matrix_world = Matrix.Translation(-off) @ o.matrix_world
            for c in o.users_collection: c.objects.unlink(o)
        _cache[name] = objs
    return _cache[name]
def place(name, pos, rot_z=0.0, scale=1.0, prefix='prop'):
    _n[0] += 1; root = bpy.data.objects.new(f'{prefix}_{name}_{_n[0]}', None); col.objects.link(root)
    for o in asset(name):
        c = o.copy(); col.objects.link(c); c.parent = root; c.name = f'{prefix}_{name}_{_n[0]}_{o.name}'
    root.location = pos; root.rotation_euler = (0, 0, rot_z); root.scale = (scale,) * 3
    return root

# ================= 共用外殼 =================
M_WHITE = mat('cloud_dancer', '#f0eee9', .28)
M_PANEL = mat('panel', '#f5f3ef', .38)
M_TRIM = mat('trim', '#e4e0d8', .35)
M_WARM = mat('warm_light', '#000000', 1, emit='#ffd9a8', emit_k=12)
M_DARK = mat('bezel', '#15181e', .25, metal=.3)
M_STARS = star_glass()

def screen(name, img, w, h, loc, rot_z=0.0, k=1.15):
    """作品畫面:自發光貼圖平面(網頁上直接用圖,不烘)"""
    sm = bpy.data.materials.new(name); sm.use_nodes = True; nt = sm.node_tree; nt.nodes.clear()
    o_ = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); im = nt.nodes.new('ShaderNodeTexImage')
    im.image = bpy.data.images.load(img if img.startswith('/') else f'{SITE}/public/assets/{img}'); nt.links.new(im.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = k; nt.links.new(em.outputs['Emission'], o_.inputs['Surface'])
    bpy.ops.mesh.primitive_plane_add(size=1); sc = link(bpy.context.active_object); sc.name = name; sc.scale = (w, h, 1); sc.data.materials.append(sm)
    sc.rotation_euler = (math.radians(90), 0, rot_z); sc.location = loc
    return sc

def shell(t):
    """t: 主題 dict(floor_a / floor_b 地磚兩色、wall_a / wall_b 條紋、wains 護牆板、accent 燈色)"""
    # 地板:一塊塊有倒角的方磚,棋盤格兩色(各一個物件,各自加倒角)
    T = .5; nx, ny = int(W / T), int(D / T)
    if t.get('floor') == 'planks':                                             # 木地板:一條條往裡延伸的木板,長短交錯、三種木色
        PW = .2; mats = [woodmat(f'plank_{k}', *c) for k, c in enumerate(t['planks'])]; bms = [bmesh.new() for _ in mats]
        for i in range(int(W / PW)):
            y = -rng.random() * 1.6
            while y < D:
                ln = 1.2 + rng.random() * 1.2; y0_, y1_ = max(0, y), min(D, y + ln)
                if y1_ - y0_ > .05:
                    bm = bms[rng.randrange(len(bms))]; g = bmesh.ops.create_cube(bm, size=1)['verts']
                    bmesh.ops.scale(bm, vec=(PW, y1_ - y0_, .04), verts=g); bmesh.ops.translate(bm, vec=(-W / 2 + (i + .5) * PW, (y0_ + y1_) / 2, -.02), verts=g)
                y += ln
        for k, (bm, m) in enumerate(zip(bms, mats)): mesh_obj(f'tile_plank_{k}', bm, m, bevel=.004, seg=1)
    for k, mname in enumerate(('a', 'b') if t.get('floor') != 'planks' else ()):
        bm = bmesh.new()
        for i in range(nx):
            for j in range(ny):
                if (i + j) % 2 != k: continue
                g = bmesh.ops.create_cube(bm, size=1)['verts']; bmesh.ops.scale(bm, vec=(T, T, .04), verts=g)   # 磚與磚之間不留縫(縫用倒角做出來):網頁的地板倒影才不會從縫裡透出黑線
                bmesh.ops.translate(bm, vec=(-W / 2 + (i + .5) * T, (j + .5) * T, -.02), verts=g)
        mesh_obj(f'tile_{mname}', bm, mat(f'tile_{mname}', t['floor_' + mname], .14, coat=.7), bevel=.005, seg=2)
    box('floor_base', (W, D, .1), (0, D / 2, -.09), M_TRIM)
    # 牆:後牆、右牆整面;左牆中間挖大窗;前牆挖入口
    WT = .3; WIN = (2.0, 7.0, 1.05, 3.15)                                     # 左牆大窗 y0, y1, z0, z1
    box('wall_back', (W + 2 * WT, WT, H), (0, D + WT / 2, H / 2), M_PANEL)
    box('wall_right', (WT, D, H), (W / 2 + WT / 2, D / 2, H / 2), M_PANEL)
    y0, y1, z0, z1 = WIN
    box('wall_left_a', (WT, y0, H), (-W / 2 - WT / 2, y0 / 2, H / 2), M_PANEL)
    box('wall_left_b', (WT, D - y1, H), (-W / 2 - WT / 2, (y1 + D) / 2, H / 2), M_PANEL)
    box('wall_left_lo', (WT, y1 - y0, z0), (-W / 2 - WT / 2, (y0 + y1) / 2, z0 / 2), M_PANEL)
    box('wall_left_hi', (WT, y1 - y0, H - z1), (-W / 2 - WT / 2, (y0 + y1) / 2, (z1 + H) / 2), M_PANEL)
    for s in (-1, 1): box(f'wall_front_{s}', ((W - DOOR_W) / 2, WT, H), (s * (DOOR_W / 2 + (W - DOOR_W) / 4), -WT / 2, H / 2), M_PANEL)
    box('wall_front_top', (DOOR_W, WT, H - DOOR_H), (0, -WT / 2, (DOOR_H + H) / 2), M_PANEL)
    # 大窗:厚圓角白框 + 星空玻璃 + 窗外的大星球
    for nm, size, loc in (('wf_lo', (.5, y1 - y0 + .3, .14), (-W / 2 + .05, (y0 + y1) / 2, z0 - .02)), ('wf_hi', (.5, y1 - y0 + .3, .14), (-W / 2 + .05, (y0 + y1) / 2, z1 + .02)),
                          ('wf_a', (.5, .16, z1 - z0 + .3), (-W / 2 + .05, y0 - .03, (z0 + z1) / 2)), ('wf_b', (.5, .16, z1 - z0 + .3), (-W / 2 + .05, y1 + .03, (z0 + z1) / 2))):
        box(nm, size, loc, M_WHITE, bevel=.05, seg=4)
    for k in range(1, 3): box(f'wf_mull_{k}', (.12, .06, z1 - z0), (-W / 2 - .05, y0 + (y1 - y0) * k / 3, (z0 + z1) / 2), M_WHITE, bevel=.02)
    bpy.ops.mesh.primitive_plane_add(size=1); g = link(bpy.context.active_object); g.name = 'window_glass'; g.scale = (y1 - y0, z1 - z0, 1)
    g.rotation_euler = (math.radians(90), 0, math.radians(90)); g.location = (-W / 2 - .2, (y0 + y1) / 2, (z0 + z1) / 2); g.data.materials.append(M_STARS)
    # 窗外的星空 + 星球:網頁上用即時 shader 畫(依視線方向,有真的視差),這裡的星空玻璃只是預覽用、不烘
    # 護牆板(下半):直立的圓弧條(像遊戲裡吧台前面)+ 上緣飾條;上半:條紋壁紙
    M_WAINS = mat('wains', t['wains'], .32, coat=.4); M_RAIL = mat('rail', t['rail'], .3, coat=.5)
    M_STR = stripes('wallpaper', t['wall_a'], t['wall_b'], 3.2)
    def wall_run(name, p0, p1, normal, skip=None):
        L = (p1 - p0).length; d = (p1 - p0).normalized(); n = int(L / .11)
        bm = bmesh.new()
        for k in range(n):
            c = p0 + d * ((k + .5) * L / n)
            if skip and skip(c): continue
            g = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=.05, radius2=.05, depth=1.0)['verts']
            bmesh.ops.translate(bm, vec=c + normal * -.02 + Vector((0, 0, .5)), verts=g)
        mesh_obj(f'flute_{name}', bm, M_WAINS)
        mid = (p0 + p1) / 2; sz = Vector((abs(d.x) * L + abs(normal.x) * .1, abs(d.y) * L + abs(normal.y) * .1, .08))
        box(f'rail_{name}', sz, mid + normal * .02 + Vector((0, 0, 1.04)), M_RAIL, bevel=.02)
        bsz = Vector((abs(d.x) * L + abs(normal.x) * .04, abs(d.y) * L + abs(normal.y) * .04, 1.0))
        box(f'wains_back_{name}', bsz, mid + normal * -.04 + Vector((0, 0, .5)), M_WAINS)
        ssz = Vector((abs(d.x) * L + abs(normal.x) * .02, abs(d.y) * L + abs(normal.y) * .02, H - 1.08 - .35))
        box(f'paper_{name}', ssz, mid + normal * -.01 + Vector((0, 0, 1.08 + ssz.z / 2)), M_STR)
    wall_run('back', Vector((-W / 2, D - .02, 0)), Vector((W / 2, D - .02, 0)), Vector((0, -1, 0)))
    wall_run('right', Vector((W / 2 - .02, .0, 0)), Vector((W / 2 - .02, D, 0)), Vector((-1, 0, 0)))
    wall_run('left_a', Vector((-W / 2 + .02, 0, 0)), Vector((-W / 2 + .02, y0 - .1, 0)), Vector((1, 0, 0)))
    wall_run('left_b', Vector((-W / 2 + .02, y1 + .1, 0)), Vector((-W / 2 + .02, D, 0)), Vector((1, 0, 0)))
    # 天花板:白頂 + 一圈內凹燈槽(暖光)+ 中間一塊柔光板
    M_CEIL = mat(f'ceil_{ROOM}', t.get('ceil', '#f0eee9'), .28)
    box('ceiling', (W + .6, D + .6, .2), (0, D / 2, H + .1), M_CEIL)
    for nm, size, loc in (('cove_l', (.5, D - .6, .18), (-W / 2 + .25, D / 2, H - .09)), ('cove_r', (.5, D - .6, .18), (W / 2 - .25, D / 2, H - .09)),
                          ('cove_b', (W, .5, .18), (0, D - .25, H - .09)), ('cove_f', (W, .5, .18), (0, .25, H - .09))):
        box(nm, size, loc, M_CEIL, bevel=.03)
    M_ACC = mat('accent_light', '#000000', 1, emit=t['accent'], emit_k=8)
    for nm, size, loc in (('covel_l', (.03, D - 1.2, .03), (-W / 2 + .52, D / 2, H - .16)), ('covel_r', (.03, D - 1.2, .03), (W / 2 - .52, D / 2, H - .16)),
                          ('covel_b', (W - 1.2, .03, .03), (0, D - .52, H - .16)), ('covel_f', (W - 1.2, .03, .03), (0, .52, H - .16))):
        box(nm, size, loc, M_WARM)
    box('ceil_panel', (3.6, 2.6, .04), (0, D / 2 + .3, H - .02), M_STARS if t.get('ceil_panel') == 'stars' else mat('soft_panel', '#000000', 1, emit='#fff1e2', emit_k=3.2), bevel=.01)
    box('ceil_panel_rim', (3.8, 2.8, .05), (0, D / 2 + .3, H - .01), M_TRIM)
    # 牆角燈帶(地腳線發光,跟大廳一樣)
    for nm, size, loc in (('base_b', (W - .2, .03, .03), (0, D - .07, .06)), ('base_r', (.03, D - .2, .03), (W / 2 - .07, D / 2, .06))):
        box(nm, size, loc, M_ACC)
    return M_ACC

# ================= 共用家具 / 燈(Cat Street、Ocean、Tiny Planet、Wooden Rails 用)=================
def woodmat(name, a, b, scale=6.0, rough=.5):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'RINGS'; wv.inputs['Scale'].default_value = scale; wv.inputs['Distortion'].default_value = 6; wv.inputs['Detail'].default_value = 3
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, .08, 1)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], wv.inputs['Vector'])
    rp = nt.nodes.new('ShaderNodeValToRGB'); rp.color_ramp.elements[0].color = srgb(a); rp.color_ramp.elements[1].color = srgb(b)
    nt.links.new(wv.outputs['Fac'], rp.inputs['Fac']); nt.links.new(rp.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = rough
    return m
def area(name, loc, energy, color, size, aim=None, shape='RECTANGLE', sy=None):
    L_ = bpy.data.lights.new(name, 'AREA'); L_.energy = energy; L_.color = color; L_.shape = shape; L_.size = size
    if sy: L_.size_y = sy
    o = bpy.data.objects.new(name, L_); col.objects.link(o); o.location = loc
    if aim: o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y')
    return o
def base_lights(k=1.0, win=380, warm=(1, .93, .85)):
    area('ceil_soft', (0, D / 2 + .3, H - .08), 700 * k, warm, 3.4, sy=2.4)
    area('ceil_front', (0, 2.0, H - .1), 260 * k, warm, 3.0, sy=1.5)
    area('window_light', (-W / 2 - .6, 4.5, 2.1), win, (.78, .86, 1), 4.5, aim=(0, 4.5, 1.0), sy=2.0)
def hero(title, neon_hex, x=0.0, z=3.62):
    """後牆上方的霓虹店名(不放作品截圖;後牆中間放每間自己的主題擺設,點房間裡的東西就進作品)"""
    text('neon_title', title, (x, D - .08, z), .42, mat(f'neon_{ROOM}', '#000000', 1, emit=neon_hex, emit_k=16), extrude=.012)
def glowtext(name, s_, loc, size, hex_, k=2.0, align='CENTER', rot=(math.radians(90), 0, 0)):
    """不烘的發光字(網頁上直接用顏色畫,字才清楚)"""
    return text(f'neon_{name}', s_, loc, size, mat(f'glow_{hex_}', '#000000', 1, emit=hex_, emit_k=k), rot=rot, extrude=.004, align=align)
def wall_board(name, w, h, zc, board_hex, frame_hex, x=0.0):
    box(f'{name}_frame', (w + .24, .08, h + .24), (x, D - .06, zc), mat(f'{name}_fr', frame_hex, .35, coat=.5), bevel=.05, seg=4)
    box(f'{name}_board', (w, .06, h), (x, D - .11, zc), mat(f'{name}_bd', board_hex, .75), bevel=.01)
    return D - .15
def pendant(name, x, y, shade, drop=1.05, r=.26, cone=False):
    top = Vector((x, y, H - .02))
    cyl(f'{name}_cord', .006, drop, top - Vector((0, 0, drop / 2)), M_DARK, 8)
    if cone: cyl(f'{name}_shade', r, r * 1.1, top - Vector((0, 0, drop + r * .55)), shade, 40, r2=.05)
    else:
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=r)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, -1), clear_outer=True)
        bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.015); bmesh.ops.translate(bm, vec=top - Vector((0, 0, drop)), verts=bm.verts)
        mesh_obj(f'{name}_shade', bm, shade)
    zb = drop + (r * 1.1 if cone else .05)
    sphere(f'{name}_bulb', .07, top - Vector((0, 0, zb)), mat('bulb', '#000000', 1, emit='#ffe2b8', emit_k=30))
    L_ = bpy.data.lights.new(f'{name}_light', 'POINT'); L_.energy = 55; L_.color = (1, .86, .72); L_.shadow_soft_size = .12
    lo = bpy.data.objects.new(f'{name}_light', L_); col.objects.link(lo); lo.location = top - Vector((0, 0, zb + .06))
def armchair(name, p, face, m_body, m_cush):
    """圓潤的單人沙發:座、椅背、兩邊扶手(大倒角);face = 朝向(弧度)"""
    R_ = Matrix.Rotation(face - math.pi / 2, 3, 'Z')
    def part(nm, size, off, m, bv):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=size, verts=bm.verts)
        bmesh.ops.translate(bm, vec=off, verts=bm.verts); bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=R_, verts=bm.verts); bmesh.ops.translate(bm, vec=p, verts=bm.verts)
        mesh_obj(f'{name}_{nm}', bm, m, bevel=bv, seg=5)
    part('base', (.86, .8, .3), (0, 0, .2), m_body, .08)
    part('seat', (.66, .66, .14), (0, .04, .41), m_cush, .06)
    part('back', (.86, .2, .52), (0, -.33, .58), m_body, .09)
    for s_ in (-1, 1): part(f'arm{s_}', (.16, .76, .26), (s_ * .38, .02, .46), m_body, .07)
def beanbag(name, p, m):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=.5)
    for v in bm.verts:
        v.co.z *= .62 if v.co.z > 0 else .4
        if v.co.z > .1: v.co.y += .12 * v.co.z / .3                               # 後面高、前面凹一點
    bmesh.ops.translate(bm, vec=p + Vector((0, 0, .2)), verts=bm.verts); mesh_obj(name, bm, m)
def framed(name, loc, rot_z, w, h, bg, draw=None):
    """牆上的畫:白框 + 畫布;draw(c, f, side) 在畫布前面放小形狀"""
    box(f'{name}_frame', (w + .1, .05, h + .1), loc, M_WHITE, rot_z, bevel=.015)
    f = Vector((math.sin(rot_z), -math.cos(rot_z), 0)); side = Vector((math.cos(rot_z), math.sin(rot_z), 0))
    box(f'{name}_canvas', (w, .02, h), loc + f * .025, mat(f'{name}_bg', bg, .8), rot_z)
    if draw: draw(loc + f * .04, f, side)
def cat_fig(name, p, face, s=1.0, m=None):
    m = m or mat('ceramic_cat', '#fbf8f4', .12, coat=.9); f = Vector((math.cos(face), math.sin(face), 0)); side = Vector((-f.y, f.x, 0))
    sphere(f'{name}_body', .16 * s, p + Vector((0, 0, .15 * s)), m, scale=(1, 1, 1.15))
    hp = p + f * .05 * s + Vector((0, 0, .38 * s)); sphere(f'{name}_head', .12 * s, hp, m, scale=(1, 1, .9))
    for sd in (-1, 1):
        bm = bmesh.new(); g = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=.05 * s, radius2=.0, depth=.09 * s)['verts']
        bmesh.ops.translate(bm, vec=hp + side * sd * .065 * s + Vector((0, 0, .1 * s)), verts=g); mesh_obj(f'{name}_ear_{sd}', bm, m)
        sphere(f'{name}_eye_{sd}', .014 * s, hp + f * .11 * s + side * sd * .042 * s + Vector((0, 0, .01 * s)), mat('ink', '#3a2a35', .4))
def plank_table(name, c, w, d, h, top_m, leg_m):
    box(f'{name}_top', (w, d, .07), c + Vector((0, 0, h - .035)), top_m, bevel=.02)
    box(f'{name}_apron', (w - .2, d - .2, .1), c + Vector((0, 0, h - .12)), leg_m, bevel=.01)
    for sx in (-1, 1):
        for sy in (-1, 1): box(f'{name}_leg_{sx}_{sy}', (.09, .09, h - .07), c + Vector((sx * (w / 2 - .14), sy * (d / 2 - .14), (h - .07) / 2)), leg_m, bevel=.01)
def tree(name, p, s=1.0, m_leaf=None):
    cyl(f'{name}_trunk', .025 * s, .12 * s, p + Vector((0, 0, .06 * s)), mat('trunk', '#8a5a3a', .7), 12)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=.11 * s, radius2=0, depth=.3 * s)
    bmesh.ops.translate(bm, vec=p + Vector((0, 0, .27 * s)), verts=bm.verts); mesh_obj(f'{name}_leaf', bm, m_leaf or mat('leaf', '#4fae5c', .6), smooth=False)
def house(name, p, s, wall_hex, roof_hex, rot=0.0):
    box(f'{name}_body', (.22 * s, .2 * s, .16 * s), p + Vector((0, 0, .08 * s)), mat(f'house_{wall_hex}', wall_hex, .6), rot, bevel=.01)
    bm = bmesh.new(); g = bmesh.ops.create_cone(bm, cap_ends=True, segments=3, radius1=.14 * s, radius2=.14 * s, depth=.26 * s)['verts']
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'Y') @ Matrix.Rotation(math.radians(90), 3, 'Z'), verts=g)
    bmesh.ops.scale(bm, vec=(1, 1, .55), verts=g); bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'), verts=g)
    bmesh.ops.translate(bm, vec=p + Vector((0, 0, .2 * s)), verts=g); mesh_obj(f'{name}_roof', bm, mat(f'roof_{roof_hex}', roof_hex, .5), smooth=False)

# ================= KittyCafe =================
def kitty():
    t = dict(floor_a='#fdf3ec', floor_b='#f7c9d4', wall_a='#fbefe0', wall_b='#f6e2cc', wains='#f4a7bb', rail='#fff6f0', accent='#ff8fb0', planet_a='#e88fb6', planet_b='#fbe0c6')
    M_ACC = shell(t)
    M_PINK = mat('pink', '#f4a7bb', .35, coat=.5); M_PINK2 = mat('pink_deep', '#e9799a', .4, coat=.4)
    M_CREAM = mat('cream', '#fff4e6', .3, coat=.5); M_MARBLE = mat('marble', '#f7f3ef', .12, coat=.8)
    M_CHROME = mat('chrome', '#d8dce3', .14, metal=1.0); M_WOOD = mat('wood', '#d9a676', .45)
    M_BERRY = mat('berry', '#ff5a7a', .35); M_CUSH = mat('cushion', '#f7b8c8', .85)
    # --- 後牆:菜單黑板(粉紅框;左右兩欄品項 + 價錢,中間一隻貓臉)+ 霓虹招牌 ---
    yb = wall_board('menu', 3.9, 1.85, 2.22, '#3a2a35', '#f4a7bb', -.3)
    glowtext('menu_head', 'MENU', (-.3, yb, 2.86), .26, '#ffd1dc', 2)
    for k, (a_, b_) in enumerate((('LATTE', '120'), ('MATCHA', '140'), ('TAIYAKI', '90'))): glowtext(f'menu_l{k}', f'{a_}  {b_}', (-1.35, yb, 2.42 - k * .34), .16, '#fff1e0', 1.6)
    for k, (a_, b_) in enumerate((('ICE CREAM', '110'), ('STRAWBERRY', '130'), ('CAT COOKIE', '80'))): glowtext(f'menu_r{k}', f'{a_}  {b_}', (.85, yb, 2.42 - k * .34), .16, '#fff1e0', 1.6)
    cf = Vector((-.3, yb, 2.1)); M_CF = mat('menu_cat', '#fff4e6', .5)
    sphere('menu_cat_head', .26, cf, M_CF, scale=(1, .12, .85))
    for sd in (-1, 1):
        bm = bmesh.new(); g = bmesh.ops.create_cone(bm, cap_ends=True, segments=3, radius1=.11, radius2=0, depth=.02)['verts']
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'), verts=g); bmesh.ops.translate(bm, vec=cf + Vector((sd * .15, 0, .23)), verts=g); mesh_obj(f'menu_cat_ear_{sd}', bm, M_CF)
        sphere(f'menu_cat_eye_{sd}', .03, cf + Vector((sd * .09, -.03, .03)), mat('ink', '#3a2a35', .4), seg=12)
        sphere(f'menu_cat_blush_{sd}', .035, cf + Vector((sd * .15, -.03, -.06)), mat('blush', '#f7a3bc', .6), scale=(1, .3, .6), seg=12)
    M_NEON = mat('neon_pink', '#000000', 1, emit='#ff7aa8', emit_k=16)
    text('neon_title', 'KITTY CAFÉ', (-.3, D - .08, 3.6), .46, M_NEON, extrude=.012)
    # --- 右邊:吧台(粉紅圓弧條前板 + 大理石檯面)+ 遮陽棚 + 後櫃 ---
    cx, cy0, cy1 = 3.55, 2.6, 7.6; L = cy1 - cy0
    box('counter_body', (.9, L, 1.0), (cx, (cy0 + cy1) / 2, .5), M_CREAM, bevel=.03)
    bm = bmesh.new()
    for k in range(int(L / .1)):
        g = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=.045, radius2=.045, depth=.86)['verts']
        bmesh.ops.translate(bm, vec=(cx - .46, cy0 + (k + .5) * .1, .5), verts=g)
    mesh_obj('counter_flutes', bm, M_PINK)
    box('counter_top', (1.1, L + .16, .07), (cx - .04, (cy0 + cy1) / 2, 1.035), M_MARBLE, bevel=.02)
    box('counter_kick', (.84, L - .04, .08), (cx + .02, (cy0 + cy1) / 2, .04), M_PINK2)
    box('backbar', (.5, L + .4, .95), (W / 2 - .3, (cy0 + cy1) / 2, .475), M_CREAM, bevel=.02)
    box('backbar_top', (.56, L + .5, .05), (W / 2 - .3, (cy0 + cy1) / 2, .975), M_MARBLE, bevel=.015)
    for z in (1.75, 2.25):
        box(f'shelf_{z}', (.32, L, .04), (W / 2 - .18, (cy0 + cy1) / 2, z), M_WOOD, bevel=.01)
        for k in range(14):
            y = cy0 + .3 + k * (L - .6) / 13
            if k % 3 == 0: cyl(f'jar_{z}_{k}', .07, .2, (W / 2 - .2, y, z + .12), mat('jar', '#fbe7d3', .2, coat=.6), 24)
            else: cyl(f'cup_{z}_{k}', .055, .09, (W / 2 - .2, y, z + .065), mat(f'cup{k % 2}', ['#ffffff', '#ffd1dc'][k % 2], .25, coat=.5), 24)
    # 遮陽棚:粉白相間的斜板 + 扇形下緣(遊戲畫面的招牌元素)
    aw_z0, aw_z1, aw_x0, aw_x1 = 3.05, 2.6, W / 2 - .02, 2.9
    n = 12
    for k in range(n):
        y = cy0 - .2 + (k + .5) * (L + .4) / n; m = M_PINK if k % 2 == 0 else M_CREAM
        bm = bmesh.new(); w = (L + .4) / n
        vs = [bm.verts.new(v) for v in ((aw_x0, y - w / 2, aw_z0), (aw_x0, y + w / 2, aw_z0), (aw_x1, y + w / 2, aw_z1), (aw_x1, y - w / 2, aw_z1))]
        bm.faces.new(vs); bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.025)
        mesh_obj(f'awning_{k}', bm, m)
        bm = bmesh.new(); g = bmesh.ops.create_circle(bm, cap_ends=True, segments=24, radius=w / 2)['verts']
        for v in g: v.co = Vector((0, v.co.x, v.co.y))
        bm.faces.ensure_lookup_table()
        if bm.faces: bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_outer=True)
        bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.02); bmesh.ops.translate(bm, vec=(aw_x1, y, aw_z1), verts=bm.verts)
        mesh_obj(f'awning_scallop_{k}', bm, m)
    for y in (cy0 - .2, cy1 + .2): cyl(f'awning_rod_{y}', .025, 1.0, (aw_x1 + .2, y, aw_z1 + .15), M_CHROME, 16, rot=Matrix.Rotation(math.radians(90), 3, 'X') @ Matrix.Rotation(0, 3, 'Z'))
    # 吧台上:咖啡機、貓咪造型烤吐司機、蛋糕架、杯子
    em = Vector((cx - .05, 3.4, 1.07))
    box('espresso', (.55, .7, .45), em + Vector((0, 0, .225)), M_CHROME, bevel=.04)
    box('espresso_top', (.52, .66, .05), em + Vector((0, 0, .47)), M_PINK, bevel=.015)
    for dy in (-.17, .17):
        cyl(f'grouphead_{dy}', .045, .1, em + Vector((-.3, dy, .3)), M_CHROME, 24)
        cyl(f'espcup_{dy}', .045, .07, em + Vector((-.32, dy, .035)), mat('cup0', '#ffffff', .25, coat=.5), 24)
    box('espresso_panel', (.01, .3, .1), em + Vector((-.28, 0, .38)), mat('lcd', '#000000', 1, emit='#9fffd0', emit_k=3))
    tp = Vector((cx - .05, 4.6, 1.07))
    box('toaster', (.42, .58, .3), tp + Vector((0, 0, .15)), M_CREAM, bevel=.08, seg=5)
    for dy in (-.18, .18):
        bm = bmesh.new(); g = bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=.09, radius2=.0, depth=.14)['verts']
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(45), 3, 'Z'), verts=g); bmesh.ops.translate(bm, vec=tp + Vector((0, dy, .35)), verts=g)
        mesh_obj(f'toaster_ear_{dy}', bm, M_CREAM, bevel=.015)
        sphere(f'toaster_eye_{dy}', .022, tp + Vector((-.21, dy * .4, .18)), mat('ink', '#3a2a35', .4))
    for k, (y, cols) in enumerate(((5.7, ('#fff2c4', '#ff9fb8', '#bfe4ff')), (6.8, ('#d9c4ff', '#ffd59a', '#ffb3c6')))):
        st = Vector((cx - .05, y, 1.07))
        cyl(f'stand_stem_{k}', .02, .55, st + Vector((0, 0, .275)), M_CHROME, 16)
        for j, (z, r) in enumerate(((.08, .32), (.32, .24), (.54, .16))):
            cyl(f'stand_plate_{k}_{j}', r, .02, st + Vector((0, 0, z)), M_MARBLE, 40)
            for q in range(4 - j):
                a = q / (4 - j) * math.tau + .3; c = st + Vector((math.cos(a) * r * .55, math.sin(a) * r * .55, z + .055))
                cyl(f'cake_{k}_{j}_{q}', .06, .08, c, mat(f'cake{(j + q) % 3}{k}', cols[(j + q) % 3], .55), 24)
                sphere(f'berry_{k}_{j}_{q}', .022, c + Vector((0, 0, .055)), M_BERRY)
    # 吧台椅(鉻腳 + 粉紅坐墊)
    for k in range(4):
        p = Vector((cx - 1.05, cy0 + .6 + k * 1.25, 0))
        cyl(f'stool_base_{k}', .22, .03, p + Vector((0, 0, .015)), M_CHROME, 32)
        cyl(f'stool_post_{k}', .035, .7, p + Vector((0, 0, .38)), M_CHROME, 16)
        cyl(f'stool_ring_{k}', .17, .02, p + Vector((0, 0, .3)), M_CHROME, 32)
        cyl(f'stool_seat_{k}', .2, .09, p + Vector((0, 0, .77)), M_PINK, 32, bevel=.03)
    # --- 中間:三張大理石小圓桌 + 鬱金香椅 ---
    def tulip_chair(name, p, face):
        cyl(f'{name}_base', .22, .025, p + Vector((0, 0, .012)), M_CHROME, 32)
        cyl(f'{name}_stem', .03, .4, p + Vector((0, 0, .22)), M_CHROME, 16)
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=.3)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, .06), plane_no=(0, 0, 1), clear_outer=True)
        for v in bm.verts:                                                         # 椅背:後面那半圈拉高
            back = max(0, (v.co.x * math.cos(face) + v.co.y * math.sin(face)) / .3)        # 離桌子遠的那一側
            if v.co.z > -.05: v.co.z += back ** 1.6 * .2 * (v.co.z + .05) / .11
        bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.025); bmesh.ops.translate(bm, vec=p + Vector((0, 0, .66)), verts=bm.verts)
        mesh_obj(f'{name}_shell', bm, M_CREAM, bevel=.008)
        cyl(f'{name}_cushion', .24, .06, p + Vector((0, 0, .44)), M_CUSH, 32, bevel=.025)
    tables = [(-2.1, 3.6), (1.0, 4.3), (-2.6, 6.3)]
    for k, (x, y) in enumerate(tables):
        p = Vector((x, y, 0))
        cyl(f'table_base_{k}', .26, .03, p + Vector((0, 0, .015)), M_CHROME, 40)
        cyl(f'table_stem_{k}', .035, .7, p + Vector((0, 0, .37)), M_CHROME, 16)
        cyl(f'table_top_{k}', .45, .04, p + Vector((0, 0, .74)), M_MARBLE, 64, bevel=.012)
        cyl(f'table_cup_{k}', .045, .08, p + Vector((.12, -.05, .8)), mat('cup1', '#ffd1dc', .25, coat=.5), 24)
        cyl(f'table_plate_{k}', .11, .015, p + Vector((-.13, .06, .768)), M_MARBLE, 32)
        sphere(f'table_macaron_{k}', .045, p + Vector((-.13, .06, .8)), mat(f'mac{k}', ['#ffb3c6', '#bfe4ff', '#d9f2c4'][k], .5), scale=(1, 1, .55))
        for j, a in enumerate((0.4 + k, math.pi + .4 + k)):
            cp = p + Vector((math.cos(a) * .72, math.sin(a) * .72, 0))
            tulip_chair(f'chair_{k}_{j}', cp, a)
        # 吊燈:圓頂燈罩 + 燈泡(真的點光)
        top = Vector((x, y, H - .02))
        cyl(f'pend_cord_{k}', .006, 1.05, top - Vector((0, 0, .52)), M_DARK, 8)
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=.26)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, -1), clear_outer=True)
        bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.015); bmesh.ops.translate(bm, vec=top - Vector((0, 0, 1.05)), verts=bm.verts)
        mesh_obj(f'pend_shade_{k}', bm, M_PINK if k != 1 else M_CREAM)
        sphere(f'pend_bulb_{k}', .07, top - Vector((0, 0, 1.1)), mat('bulb', '#000000', 1, emit='#ffe2b8', emit_k=30))
        L_ = bpy.data.lights.new(f'pend_light_{k}', 'POINT'); L_.energy = 55; L_.color = (1, .86, .72); L_.shadow_soft_size = .12
        lo = bpy.data.objects.new(f'pend_light_{k}', L_); col.objects.link(lo); lo.location = top - Vector((0, 0, 1.16))
    # --- 左邊:窗邊座位(長坐墊 + 抱枕)+ 貓跳台 + 陶瓷貓 ---
    y0, y1 = 2.0, 7.0
    box('seat_base', (.75, y1 - y0, .42), (-W / 2 + .4, (y0 + y1) / 2, .21), M_CREAM, bevel=.03)
    box('seat_kick', (.7, y1 - y0 - .04, .06), (-W / 2 + .42, (y0 + y1) / 2, .03), M_PINK2)
    for k in range(3):
        yc = y0 + (k + .5) * (y1 - y0) / 3
        box(f'seat_cush_{k}', (.7, (y1 - y0) / 3 - .04, .16), (-W / 2 + .42, yc, .5), M_CUSH, bevel=.06, seg=5)
    for k, (y, c, r) in enumerate(((2.6, '#ffffff', .3), (3.1, '#ffd1dc', -.2), (5.4, '#fbe7d3', .25), (6.3, '#ffffff', -.3))):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=4, use_grid_fill=True)
        for v in bm.verts: v.co = v.co.normalized() * .5 * .55 + v.co * .45                  # 方中帶圓的抱枕
        bmesh.ops.scale(bm, vec=(.14, .42, .38), verts=bm.verts); bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(r, 3, 'X'), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(-W / 2 + .2, y, .76), verts=bm.verts)
        mesh_obj(f'pillow_{k}', bm, mat(f'pillow{k}', c, .9))
    # 貓跳台(左後角):麻繩柱 + 平台 + 貓窩 + 小洞屋
    M_SISAL = bpy.data.materials.new('sisal'); M_SISAL.use_nodes = True; nt = M_SISAL.node_tree; p = nt.nodes['Principled BSDF']
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'Z'; wv.inputs['Scale'].default_value = 60; wv.inputs['Distortion'].default_value = 2
    rp = nt.nodes.new('ShaderNodeValToRGB'); rp.color_ramp.elements[0].color = srgb('#b08a5c'); rp.color_ramp.elements[1].color = srgb('#e2c9a0')
    nt.links.new(wv.outputs['Fac'], rp.inputs['Fac']); nt.links.new(rp.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = .95
    ct = Vector((-W / 2 + 1.0, D - 1.0, 0))
    box('ct_base', (1.1, 1.1, .1), ct + Vector((0, 0, .05)), M_CREAM, bevel=.03)
    for k, (dx, dy, h) in enumerate(((-.3, -.3, 1.0), (.32, .3, 1.7), (-.3, .32, 2.3))):
        cyl(f'ct_post_{k}', .07, h, ct + Vector((dx, dy, h / 2 + .1)), M_SISAL, 24)
    box('ct_cube', (.6, .6, .5), ct + Vector((.2, -.2, .35)), M_PINK, bevel=.05, seg=4)
    cyl('ct_hole', .16, .05, ct + Vector((.2, -.505, .38)), mat('hole', '#3a2a35', .9), 32, rot=Matrix.Rotation(math.radians(90), 3, 'X'))
    for k, (dz, dx, dy, w) in enumerate(((1.1, -.2, -.25, .6), (1.8, .25, .2, .62), (2.4, -.25, .3, .55))):
        cyl(f'ct_plat_{k}', w / 2, .06, ct + Vector((dx, dy, dz + .03)), M_CREAM, 40, bevel=.02)
        if k == 2:
            bpy.ops.mesh.primitive_torus_add(major_radius=w / 2 - .08, minor_radius=.06, major_segments=48, minor_segments=12, location=ct + Vector((dx, dy, dz + .1)))
            tr = link(bpy.context.active_object); tr.name = 'ct_bed'; tr.data.materials.append(M_CUSH)
            for pp in tr.data.polygons: pp.use_smooth = True
    # 陶瓷貓(亮面白):身體、頭、耳朵、尾巴
    M_CAT = mat('ceramic_cat', '#fbf8f4', .12, coat=.9); M_CAT2 = mat('ceramic_cat_pink', '#f7b8c8', .15, coat=.9)
    def cat(name, p, face, s=1.0, m=M_CAT):
        f = Vector((math.cos(face), math.sin(face), 0))
        sphere(f'{name}_body', .16 * s, p + Vector((0, 0, .15 * s)), m, scale=(1, 1, 1.15))
        hp = p + f * .05 * s + Vector((0, 0, .38 * s)); sphere(f'{name}_head', .12 * s, hp, m, scale=(1, 1, .9))
        side = Vector((-f.y, f.x, 0))
        for sd in (-1, 1):
            bm = bmesh.new(); g = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=.05 * s, radius2=.0, depth=.09 * s)['verts']
            bmesh.ops.translate(bm, vec=hp + side * sd * .065 * s + Vector((0, 0, .1 * s)), verts=g); mesh_obj(f'{name}_ear_{sd}', bm, m)
            sphere(f'{name}_eye_{sd}', .014 * s, hp + f * .11 * s + side * sd * .042 * s + Vector((0, 0, .01 * s)), mat('ink', '#3a2a35', .4))
        bpy.ops.mesh.primitive_torus_add(major_radius=.12 * s, minor_radius=.025 * s, major_segments=32, minor_segments=8, location=p - f * .1 * s + Vector((0, 0, .05 * s)))
        tl = link(bpy.context.active_object); tl.name = f'{name}_tail'; tl.scale = (1, 1, .5); tl.data.materials.append(m)
    cat('cat_a', ct + Vector((-.25, .3, 2.47)), -.6, .9)
    cat('cat_b', Vector((-W / 2 + .45, 4.4, .58)), 0.0, .85, M_CAT2)
    cat('cat_c', Vector((cx - .05, 7.25, 1.07)), math.pi, .6)
    # 側牆(左邊入口旁、右邊吧台旁)掛幾幅貓咪畫:白框 + 粉彩色塊上一隻貓的剪影(用簡單形狀拼)
    def art(name, loc, rot_z, w, h, bg, fg):
        box(f'{name}_frame', (w + .1, .05, h + .1), loc, M_WHITE, rot_z, bevel=.015)
        f = Vector((-math.sin(rot_z), math.cos(rot_z), 0)) * -1; side = Vector((math.cos(rot_z), math.sin(rot_z), 0))
        box(f'{name}_canvas', (w, .02, h), loc + f * .025, mat(f'{name}_bg', bg, .8), rot_z)
        M_F = mat(f'{name}_fg', fg, .7); c = loc + f * .04
        sphere(f'{name}_cbody', h * .22, c + Vector((0, 0, -h * .15)), M_F, scale=(1, .1, 1.1))
        sphere(f'{name}_chead', h * .15, c + Vector((0, 0, h * .15)), M_F, scale=(1, .1, .9))
        for sd in (-1, 1):
            bm = bmesh.new(); g = bmesh.ops.create_cone(bm, cap_ends=True, segments=3, radius1=h * .07, radius2=0, depth=.01)['verts']
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'), verts=g)
            bmesh.ops.translate(bm, vec=c + side * sd * h * .09 + Vector((0, 0, h * .28)), verts=g); mesh_obj(f'{name}_cear_{sd}', bm, M_F)
    art('art_a', Vector((-W / 2 + .05, 1.0, 2.3)), math.radians(-90), .7, .9, '#bfe4ff', '#f7f3ef')
    art('art_b', Vector((-W / 2 + .05, 8.0, 2.4)), math.radians(-90), .6, .6, '#ffd59a', '#e9799a')
    art('art_c', Vector((W / 2 - .05, 1.5, 2.3)), math.radians(90), .8, 1.0, '#d9c4ff', '#ffffff')
    # 植物(網頁即時打光)
    place('potted_plant_02', (W / 2 - .7, D - .7, 0), 0.6, 1.05)
    place('potted_plant_01', (-W / 2 + .6, 1.3, 0), 2.0, .9)
    place('calathea_orbifolia_01', (1.9, D - .55, 0), 1.0, 1.1)
    # 燈:中間柔光板往下、吧台遮陽棚下暖光、窗外的星球冷光、螢幕的光
    def area(name, loc, energy, color, size, aim=None, shape='RECTANGLE', sy=None):
        L_ = bpy.data.lights.new(name, 'AREA'); L_.energy = energy; L_.color = color; L_.shape = shape; L_.size = size
        if sy: L_.size_y = sy
        o = bpy.data.objects.new(name, L_); col.objects.link(o); o.location = loc
        if aim: o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y')
        return o
    area('ceil_soft', (0, D / 2 + .3, H - .08), 700, (1, .93, .85), 3.4, sy=2.4)
    area('ceil_front', (0, 2.0, H - .1), 260, (1, .95, .9), 3.0, sy=1.5)
    area('awning_light', (cx - .2, (cy0 + cy1) / 2, 2.5), 160, (1, .88, .76), .6, sy=L)
    area('window_light', (-W / 2 - .6, 4.5, 2.1), 380, (.78, .86, 1), 4.5, aim=(0, 4.5, 1.0), sy=2.0)
    area('board_glow', (-.3, D - 1.2, 3.6), 60, (1, .9, .9), 3.0, aim=(-.3, D, 2.2), sy=.6)

# ================= Cat Street Stocks:桌遊交誼廳(薄荷綠)=================
def stocks():
    t = dict(floor_a='#f4f8f3', floor_b='#cfe9d6', wall_a='#eef6f0', wall_b='#e3efe7', wains='#7fc79a', rail='#f7fbf8', accent='#7fe0a0')
    shell(t); base_lights(1.0)
    hero('CAT STREET', '#1fc46a')
    # 後牆:行情看板(發光折線 + K 線 + 指數)
    yb = wall_board('market', 4.0, 2.0, 2.25, '#112a22', '#7fc79a')
    glowtext('mk_head', 'CAT INDEX', (-1.55, yb, 3.0), .2, '#9fffc8', 2, align='LEFT'); glowtext('mk_val', '+7.2%', (1.65, yb, 3.0), .22, '#7fffb0', 3, align='RIGHT')
    for k in range(4): box(f'neon_mk_grid_{k}', (3.6, .01, .008), (0, yb, 1.55 + k * .38), mat('glow_grid', '#000000', 1, emit='#2c5a48', emit_k=1))
    rr = random.Random(5); v = 1.75; pts = []
    for k in range(16):
        v = max(1.45, min(2.75, v + (rr.random() - .4) * .22)); x = -1.75 + k * .233; pts.append(Vector((x, yb - .005, v)))
        o = v - (rr.random() - .5) * .18
        box(f'neon_mk_candle_{k}', (.09, .01, max(.04, abs(v - o) + .05)), (x, yb, (o + v) / 2 - .2), mat('glow_up' if v >= o else 'glow_dn', '#000000', 1, emit='#3fe08a' if v >= o else '#ff5a6a', emit_k=2))
    for k in range(15):
        a_, b_ = pts[k], pts[k + 1]; d_ = b_ - a_
        cyl(f'neon_mk_line_{k}', .012, d_.length, (a_ + b_) / 2, mat('glow_line', '#000000', 1, emit='#9fffc8', emit_k=3), 8, rot=Vector((0, 0, 1)).rotation_difference(d_).to_matrix())
    M_OAK = woodmat('oak', '#c99a64', '#a87a48'); M_DARKW = mat('walnut', '#6b4a33', .5)
    M_FELT = mat('felt', '#8fd49a', .9); M_POND = mat('pond', '#6cc6ff', .15, coat=.8)
    # 跑馬燈:右牆上方一條黑色 LED 條 + 綠色字
    box('ticker_body', (.08, 7.4, .36), (W / 2 - .06, 4.6, 3.55), M_DARK, bevel=.02)
    text('neon_ticker', 'CATS +7.2%    FISH +3.8%    BIRD +0.9%    MOUSE +12%', (W / 2 - .11, 4.6, 3.55), .2, mat('neon_tick', '#000000', 1, emit='#7fffb0', emit_k=14), rot=(math.radians(90), 0, math.radians(-90)), extrude=.006)
    # 中間:大桌 + 立體棋盤(一圈彩色格子、草地、小房子、樹、池塘、骰子、貓棋子)
    c = Vector((.2, 4.7, 0)); plank_table('gt', c, 3.4, 2.5, .78, M_OAK, M_DARKW)
    box('board_felt', (3.0, 2.1, .04), c + Vector((0, 0, .8)), M_FELT, bevel=.01)
    cols = ['#ff8fa3', '#ffd166', '#6cc6ff', '#b48bff', '#5cc77a', '#ff9f5a']
    per = [(-1.3, -.9), (1.3, -.9), (1.3, .9), (-1.3, .9)]; n = 0
    for k in range(4):
        (x0, y0), (x1, y1) = per[k], per[(k + 1) % 4]; m_ = 8 if k % 2 == 0 else 6
        for j in range(m_):
            u = j / m_; x, y = x0 + (x1 - x0) * u, y0 + (y1 - y0) * u
            box(f'tile_board_{n}', (.26, .26, .04), c + Vector((x, y, .84)), mat(f'bt{n % 6}', cols[n % 6], .45, coat=.4), bevel=.012); n += 1
    cyl('board_pond', .32, .02, c + Vector((-.25, .1, .83)), M_POND, 48)
    for k, (x, y, wc, rc) in enumerate(((.5, .35, '#fff4e6', '#ff8fa3'), (.75, -.3, '#e8f4ff', '#6cc6ff'), (-.7, -.35, '#fff7d6', '#ffd166'))): house(f'bh_{k}', c + Vector((x, y, .82)), 1.0, wc, rc, k * .4)
    for k, (x, y) in enumerate(((.15, -.45), (.35, .55), (-.75, .45), (.95, .3), (-.2, .55), (-.55, -.05))): tree(f'bt_{k}', c + Vector((x, y, .82)), .9)
    for k, (x, y, r) in enumerate(((.05, -.1, .3), (.28, .02, -.4))):
        box(f'die_{k}', (.12, .12, .12), c + Vector((x, y, .88)), mat('die', '#ffffff', .3, coat=.6), r, bevel=.025, seg=4)
        sphere(f'pip_{k}', .016, c + Vector((x, y, .945)), mat('pip', '#2b2f3a', .4))
    # 貓棋子:不烘光(prop_*,網頁上即時打光),每隻的零件掛在一個空物件 prop_cat_N 底下(原點在腳底)→ 網頁上整隻跳起來轉圈
    for k, (x, y, hx) in enumerate(((-1.3, -.9, '#fbf8f4'), (1.3, .9, '#f7c08a'), (1.04, -.9, '#c9c3ff'))):
        nm, base = f'prop_cat_{k}', c + Vector((x, y, .86))
        cat_fig(nm, base, -math.pi / 2, .35, mat(f'piece{k}', hx, .2, coat=.8))
        e = bpy.data.objects.new(nm, None); col.objects.link(e); e.location = base; bpy.context.view_layer.update()
        for o in [o for o in col.objects if o.name.startswith(nm + '_')]: o.parent = e; o.matrix_parent_inverse = e.matrix_world.inverted()
    for k, (dx, dy, hx) in enumerate(((-2.15, 0, '#7fc79a'), (2.15, 0, '#b48bff'), (0, 1.65, '#6cc6ff'))):
        cyl(f'pouf_{k}', .3, .45, c + Vector((dx, dy, .225)), mat(f'pouf{k}', hx, .85), 40, bevel=.06)
    pendant('pd_a', c.x - .8, c.y, mat('shade_g', '#7fc79a', .35, coat=.5), 1.1); pendant('pd_b', c.x + .8, c.y, mat('shade_w', '#f7fbf8', .3, coat=.5), 1.1)
    # 窗邊:兩個懶骨頭 + 小邊桌
    beanbag('bean_a', Vector((-4.0, 3.2, 0)), mat('bean_g', '#7fc79a', .9)); beanbag('bean_b', Vector((-4.1, 5.4, 0)), mat('bean_p', '#b9a6ef', .9))
    cyl('side_t', .25, .5, Vector((-4.2, 4.3, .25)), mat('side_w', '#f7fbf8', .3, coat=.5), 40, bevel=.03)
    # 右邊:桌遊櫃(彩色盒子)(角落的街機使用者不要,拿掉了)
    sx = W / 2 - .3
    box('shelf_body', (.5, 2.4, 2.2), (sx, 2.2, 1.1), M_OAK, bevel=.02)
    for k, z in enumerate((.45, 1.1, 1.75)):
        box(f'shelf_slot_{k}', (.46, 2.24, .5), (sx - .04, 2.2, z + .02), mat('slot', '#3b2a1e', .7))
        for j in range(6):
            hx = cols[(j + k * 2) % 6]; hh = .22 + (j % 3) * .06
            box(f'gamebox_{k}_{j}', (.36, .09 + (j % 2) * .03, hh), (sx - .08, 1.25 + j * .36, z - .23 + hh / 2 + .02), mat(f'gb{(j + k) % 6}', hx, .45), bevel=.008)
    framed('art_chart', Vector((-W / 2 + .05, 1.0, 2.3)), math.radians(-90), .8, .6, '#123026',
           lambda p, f, sd: [box(f'art_chart_seg_{k}', (.2, .012, .02), p + sd * (-.3 + k * .15) + Vector((0, 0, -.15 + [0, .1, .04, .2, .14][k])), mat('chart', '#000000', 1, emit='#7fffb0', emit_k=4), math.radians(-90)) for k in range(5)])
    place('potted_plant_02', (-W / 2 + .7, D - .7, 0), .4, 1.05); place('calathea_orbifolia_01', (2.2, D - .55, 0), 1.0, 1.1)

# ================= Ocean Cleanup:海邊交誼廳 + 水族箱牆(沙色 + 海藍)=================
def ocean():
    t = dict(floor_a='#f3ead8', floor_b='#e8dbbd', wall_a='#eaf6fb', wall_b='#dcf0f8', wains='#5ab7e0', rail='#f5fbfd', accent='#5ad0ff')
    shell(t); base_lights(1.0)
    hero('OCEAN CLEANUP', '#109fe0')
    # 後牆:一幅層層海浪的浮雕壁畫(天空 + 太陽 + 四層浪 + 小帆船)
    yb = wall_board('mural', 4.2, 2.1, 2.25, '#dff3fb', '#5ab7e0')
    cyl('mural_sun', .28, .02, (1.2, yb - .02, 2.85), mat('sun', '#ffd38a', .6), 48, rot=Matrix.Rotation(math.radians(90), 3, 'X'))
    for k, (hx, base, amp, ph) in enumerate((('#9fd8f0', 2.35, .1, 0), ('#5ab7e0', 2.05, .12, 1.3), ('#2f8fc8', 1.75, .1, 2.4), ('#1b5f9a', 1.45, .08, .7))):
        bm = bmesh.new(); vs = [bm.verts.new((-2.08, 0, 1.22))]
        for j in range(49): x = -2.08 + 4.16 * j / 48; vs.append(bm.verts.new((x, 0, base + amp * math.sin(x * 3.2 + ph) + amp * .4 * math.sin(x * 7 + ph))))
        vs.append(bm.verts.new((2.08, 0, 1.22))); bm.faces.new(vs); bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.02)
        bmesh.ops.translate(bm, vec=(0, yb - .045 - k * .022, 0), verts=bm.verts); mesh_obj(f'mural_wave_{k}', bm, mat(f'wave{k}', hx, .5), bevel=.006)   # 每層往前一點,不要埋進板子裡
    bm = bmesh.new(); vs = [bm.verts.new(v) for v in ((-1.05, 0, 2.3), (-.65, 0, 2.3), (-.72, 0, 2.2), (-.98, 0, 2.2))]; bm.faces.new(vs)
    bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.03); bmesh.ops.translate(bm, vec=(0, yb - .14, 0), verts=bm.verts); mesh_obj('mural_boat', bm, mat('boat', '#ffffff', .5))
    bm = bmesh.new(); vs = [bm.verts.new(v) for v in ((-.85, 0, 2.32), (-.85, 0, 2.72), (-.62, 0, 2.34))]; bm.faces.new(vs)
    bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.02); bmesh.ops.translate(bm, vec=(0, yb - .14, 0), verts=bm.verts); mesh_obj('mural_sail', bm, mat('sail', '#ff8f7a', .5))
    M_SAND = mat('sand', '#efdcb2', .95)
    # 右牆:大水族箱(白框 + 發光的海水背板 + 魚、海草、珊瑚、氣泡)
    ax0, ay0, ay1, az0, az1 = W / 2 - .02, 2.0, 7.6, .55, 3.1
    box('tank_base', (1.0, ay1 - ay0 + .3, .55), (ax0 - .5, (ay0 + ay1) / 2, .275), mat('tank_base', '#f5fbfd', .3, coat=.5), bevel=.03)
    box('tank_cap', (1.0, ay1 - ay0 + .3, .25), (ax0 - .5, (ay0 + ay1) / 2, az1 + .125), mat('tank_base', '#f5fbfd', .3, coat=.5), bevel=.03)
    for k, y in enumerate((ay0 - .1, ay1 + .1)): box(f'tank_post_{k}', (1.0, .14, az1 - az0), (ax0 - .5, y, (az0 + az1) / 2), mat('tank_base', '#f5fbfd', .3), bevel=.02)
    wm = bpy.data.materials.new('water_back'); wm.use_nodes = True; nt = wm.node_tree; nt.nodes.clear()
    o_ = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); rp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], rp.inputs['Fac'])
    rp.color_ramp.elements[0].color = srgb('#0b3d7a'); rp.color_ramp.elements[1].color = srgb('#7fe0ff'); nt.links.new(rp.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = 2.2; nt.links.new(em.outputs['Emission'], o_.inputs['Surface'])
    box('tank_water', (.06, ay1 - ay0, az1 - az0), (ax0 - .05, (ay0 + ay1) / 2, (az0 + az1) / 2), wm)
    box('tank_sand', (.9, ay1 - ay0, .12), (ax0 - .5, (ay0 + ay1) / 2, az0 + .06), M_SAND)
    r = random.Random(4)
    for k in range(14):
        y = ay0 + .3 + r.random() * (ay1 - ay0 - .6); h = .5 + r.random() * .9
        cyl(f'kelp_{k}', .03, h, (ax0 - .25 - r.random() * .5, y, az0 + .12 + h / 2), mat('kelp', '#2fae6a', .6, emit='#1f8a50', emit_k=.4), 8, r2=.012)
    for k in range(5): sphere(f'coral_{k}', .12 + r.random() * .08, (ax0 - .35, ay0 + .6 + k * 1.1, az0 + .15), mat(f'coral{k % 3}', ['#ff8f7a', '#ffb3c6', '#ffd166'][k % 3], .7), scale=(1, 1, .7), seg=16)
    for k in range(12):
        y = ay0 + .4 + r.random() * (ay1 - ay0 - .8); z = az0 + .5 + r.random() * 1.8; hx = ['#ffa24a', '#ffd166', '#ff6b9a', '#9fe8ff'][k % 4]
        f = sphere(f'fish_{k}', .07, (ax0 - .4, y, z), mat(f'fish{k % 4}', '#000000', 1, emit=hx, emit_k=1.6), scale=(.5, 1.6, 1), seg=16)
        bm = bmesh.new(); g = bmesh.ops.create_cone(bm, cap_ends=True, segments=3, radius1=.06, radius2=0, depth=.08)['verts']
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'), verts=g); bmesh.ops.translate(bm, vec=(ax0 - .4, y - .14, z), verts=g); mesh_obj(f'fish_tail_{k}', bm, mat(f'fish{k % 4}', '#000000', 1), smooth=False)
    for k in range(18): sphere(f'bubble_{k}', .015 + r.random() * .02, (ax0 - .3, ay0 + .5 + r.random() * (ay1 - ay0 - 1), az0 + .4 + r.random() * 2.1), mat('bubble', '#000000', 1, emit='#dff8ff', emit_k=2), seg=10)
    area('tank_light', (ax0 - 1.2, (ay0 + ay1) / 2, 1.8), 220, (.6, .85, 1), 1.2, aim=(-2, (ay0 + ay1) / 2, 1.0), sy=5.0)
    # 中間偏左:沙灘(一片沙 + 兩張條紋躺椅 + 陽傘 + 海灘球 + 貝殼 + 海星)
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=1.0)
    for v in bm.verts: a = math.atan2(v.co.y, v.co.x); k = 1 + .12 * math.sin(a * 3 + 1) + .07 * math.sin(a * 5); v.co.x *= 2.3 * k; v.co.y *= 1.6 * k
    bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.06); bmesh.ops.translate(bm, vec=(-2.2, 4.6, .06), verts=bm.verts); mesh_obj('beach_sand', bm, M_SAND, bevel=.03)
    for k, (x, y, rz) in enumerate(((-3.0, 3.9, -.3), (-1.6, 3.8, .3))):
        p = Vector((x, y, .1)); Rz = Matrix.Rotation(rz, 3, 'Z')
        for j in range(7):
            bm = bmesh.new(); g = bmesh.ops.create_cube(bm, size=1)['verts']; bmesh.ops.scale(bm, vec=(.62, .2, .03), verts=g)
            yy = -.6 + j * .2; zz = .32 + (max(0, j - 4) * .2); rx = .9 if j > 4 else 0
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(-rx, 3, 'X'), verts=g); bmesh.ops.translate(bm, vec=(0, yy + (.05 if j > 4 else 0), zz), verts=g)
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Rz, verts=g); bmesh.ops.translate(bm, vec=p, verts=g)
            mesh_obj(f'chair_{k}_{j}', bm, mat(f'stripe{j % 2}', ['#5ab7e0', '#ffffff'][j % 2], .6), bevel=.008)
        for sx in (-1, 1):
            for sy in (-.55, .45): cyl(f'chair_leg_{k}_{sx}_{sy}', .015, .3, p + Rz @ Vector((sx * .28, sy, .15)), mat('chrome2', '#d8dce3', .2), 8)
    um = Vector((-3.1, 5.3, .1)); cyl('umb_pole', .025, 2.3, um + Vector((0, 0, 1.15)), mat('pole', '#ffffff', .3), 12)
    for j in range(8):
        a0 = j / 8 * math.tau; bm = bmesh.new()
        vs = [bm.verts.new(um + Vector((0, 0, 2.35))), bm.verts.new(um + Vector((math.cos(a0) * 1.15, math.sin(a0) * 1.15, 1.95))), bm.verts.new(um + Vector((math.cos(a0 + math.tau / 8) * 1.15, math.sin(a0 + math.tau / 8) * 1.15, 1.95)))]
        bm.faces.new(vs); bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.015); mesh_obj(f'umb_{j}', bm, mat(f'umb{j % 2}', ['#ff8f7a', '#ffffff'][j % 2], .6), smooth=False)
    sphere('beach_ball', .2, (-.9, 5.5, .32), mat('ball', '#ffd166', .4, coat=.6))
    for k in range(7): sphere(f'shell_{k}', .05, (-3.6 + k * .45, 5.9 - (k % 2) * .5, .14), mat(f'shell{k % 3}', ['#ffffff', '#ffc7d1', '#ffe0a8'][k % 3], .4), scale=(1, 1, .5), seg=12)
    bm = bmesh.new(); vs = []
    for j in range(10): a = j / 10 * math.tau; rr = .16 if j % 2 == 0 else .07; vs.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, 0)))
    bm.faces.new(vs); bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.03); bmesh.ops.translate(bm, vec=(-1.5, 5.8, .13), verts=bm.verts); mesh_obj('starfish', bm, mat('starfish', '#ff8f5a', .6), bevel=.01)
    # 中間:淺藍圓地毯 + 漂流木矮桌(上面貝殼、玻璃瓶)+ 兩個坐墊
    cc = Vector((.9, 5.0, 0)); M_DRIFT = woodmat('drift', '#cdb89a', '#a99272', 4, .8)
    cyl('ocean_rug', 1.6, .02, cc + Vector((0, 0, .011)), mat('orug', '#a9dcf2', .95), 96)
    for k in range(3):
        bpy.ops.mesh.primitive_torus_add(major_radius=.6 + k * .32, minor_radius=.012, major_segments=96, minor_segments=6, location=cc + Vector((0, 0, .025)))
        rg = link(bpy.context.active_object); rg.name = f'orug_ring_{k}'; rg.scale = (1, 1, .3); rg.data.materials.append(mat('orug_ring', '#ffffff', .9))
    cyl('drift_table', .55, .1, cc + Vector((0, 0, .4)), M_DRIFT, 48, bevel=.03)
    cyl('drift_base', .2, .35, cc + Vector((0, 0, .175)), M_DRIFT, 24, r2=.28, bevel=.02)
    for k in range(3): sphere(f'tshell_{k}', .05, cc + Vector((-.2 + k * .15, .1 - k * .08, .47)), mat(f'shell{k % 3}', ['#ffffff', '#ffc7d1', '#ffe0a8'][k % 3], .4), scale=(1, 1, .5), seg=12)
    cyl('jar', .08, .24, cc + Vector((.25, -.15, .57)), mat('jar_glass', '#cfeff7', .05, coat=1), 32)
    for k, (dx, dy, hx) in enumerate(((-.95, .5, '#5ab7e0'), (.95, .55, '#ffd166'))): cyl(f'cush_{k}', .32, .2, cc + Vector((dx, dy, .1)), mat(f'cush{k}', hx, .85), 40, bevel=.07)
    # 回收桶(三色)+ 救生圈 + 衝浪板
    for k, hx in enumerate(('#5cc77a', '#6cc6ff', '#ffd166')):
        p = Vector((1.6 + k * .62, D - .55, 0)); cyl(f'bin_{k}', .25, .72, p + Vector((0, 0, .36)), mat(f'bin{k}', hx, .45, coat=.3), 40, r2=.22, bevel=.02)
        cyl(f'bin_lid_{k}', .27, .06, p + Vector((0, 0, .75)), mat(f'bin{k}', hx, .45), 40, bevel=.02)
    bpy.ops.mesh.primitive_torus_add(major_radius=.32, minor_radius=.08, major_segments=48, minor_segments=16, location=(W / 2 - .1, 1.2, 2.2), rotation=(0, math.radians(90), 0))
    lb = link(bpy.context.active_object); lb.name = 'lifebuoy'; lb.data.materials.append(mat('buoy', '#ff6b5a', .4))
    for pp in lb.data.polygons: pp.use_smooth = True
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=1.0); bmesh.ops.scale(bm, vec=(.3, .06, 1.1), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(-.18, 3, 'Y'), verts=bm.verts); bmesh.ops.translate(bm, vec=(-W / 2 + .45, 8.2, 1.15), verts=bm.verts); mesh_obj('surfboard', bm, mat('surf', '#5ad0ff', .25, coat=.8))
    pendant('pd_a', -2.4, 3.0, mat('rattan', '#d9b98a', .7), 1.0); pendant('pd_b', 1.2, 5.6, mat('rattan', '#d9b98a', .7), 1.0)
    place('potted_plant_01', (-W / 2 + .6, 1.3, 0), 2.0, .9); place('potted_plant_02', (.6, D - .6, 0), .6, 1.0)

# ================= Tiny Planet:觀測室(深紫夜空色)=================
def planet():
    t = dict(floor_a='#2b2652', floor_b='#352e66', wall_a='#3a3172', wall_b='#332a68', wains='#5b4aa8', rail='#9a86ea', accent='#b48bff', ceil='#2e2860', ceil_panel='stars')
    shell(t); base_lights(.55, win=520, warm=(.88, .86, 1))
    hero('TINY PLANET', '#c9a8ff', x=.4, z=3.63)                                 # 跟下面的圓窗(中心 x = .4)對齊;字往下,離天花板的邊遠一點
    # 後牆:一面大圓形觀景窗(網頁上畫窗外的星空 + 星球),厚白框 + 一圈紫光 + 螺栓
    wc = Vector((.4, D - .02, 2.12)); RW = 1.12
    bpy.ops.mesh.primitive_torus_add(major_radius=RW, minor_radius=.13, major_segments=96, minor_segments=24, location=wc + Vector((0, -.08, 0)), rotation=(math.radians(90), 0, 0))
    rf = link(bpy.context.active_object); rf.name = 'round_window_frame'; rf.data.materials.append(mat('rw_frame', '#e9e4ff', .3, coat=.6))
    for pp in rf.data.polygons: pp.use_smooth = True
    bpy.ops.mesh.primitive_torus_add(major_radius=RW + .17, minor_radius=.015, major_segments=96, minor_segments=6, location=wc + Vector((0, -.05, 0)), rotation=(math.radians(90), 0, 0))
    rl = link(bpy.context.active_object); rl.name = 'round_window_glow'; rl.data.materials.append(mat('accent_light', '#000000', 1))
    for k in range(8): a = k / 8 * math.tau; box(f'round_window_bolt_{k}', (.06, .04, .06), wc + Vector((math.cos(a) * RW, -.21, math.sin(a) * RW)), mat('rw_bolt', '#b9a6ef', .3, metal=.5), bevel=.01)
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=96, radius=RW - .1)
    for v in bm.verts: v.co = Vector((v.co.x, 0, v.co.y))
    bmesh.ops.translate(bm, vec=wc + Vector((0, -.06, 0)), verts=bm.verts); mesh_obj('window_round', bm, M_STARS)   # 在壁紙前面(壁紙在 D - .04)
    area('round_window_light', wc + Vector((0, -.3, 0)), 140, (.7, .75, 1), 2.2, aim=wc + Vector((0, -5, -1)), shape='DISK')
    # 左後方:投影台座(上面浮著網頁加的全息地球儀)
    c = Vector((-2.2, 5.4, 0))
    cyl('ped_base', .75, .12, c + Vector((0, 0, .06)), mat('ped', '#e9e4ff', .3, coat=.5), 64, bevel=.03)
    cyl('ped_col', .45, .5, c + Vector((0, 0, .37)), mat('ped', '#e9e4ff', .3), 64, r2=.38, bevel=.02)
    cyl('ped_ring', .4, .03, c + Vector((0, 0, .63)), mat('ped_glow', '#000000', 1, emit='#b48bff', emit_k=10), 64)
    pc = c + Vector((0, 0, 1.75))
    # 台座上方的星球不在這裡建:網頁上放大廳搬過來的全息地球儀(globe.mjs),這裡只留它打在房間裡的光
    area('holo_light', pc + Vector((0, -1.2, .6)), 60, (.75, .7, 1), 1.0, aim=pc)
    L_ = bpy.data.lights.new('planet_glow', 'POINT'); L_.energy = 80; L_.color = (.7, .6, 1); L_.shadow_soft_size = .6
    lo = bpy.data.objects.new('planet_glow', L_); col.objects.link(lo); lo.location = pc   # 光從全息地球的位置發出
    # 地毯:深紫圓毯 + 一圈發光星點
    cyl('rug', 1.9, .02, c + Vector((0, 0, .012)), mat('rug', '#41377f', .95), 96)
    for k in range(24): a = k / 24 * math.tau; sphere(f'rug_star_{k}', .02, c + Vector((math.cos(a) * 1.65, math.sin(a) * 1.65, .03)), mat('rugstar', '#000000', 1, emit='#e0d0ff', emit_k=6), scale=(1, 1, .3), seg=8)
    # 望遠鏡(窗邊,對著窗外)
    tp = Vector((-3.9, 6.8, 0))
    for k in range(3):
        a = k / 3 * math.tau + .3; foot = tp + Vector((math.cos(a) * .45, math.sin(a) * .45, 0)); top = tp + Vector((0, 0, 1.15))
        d = (top - foot); cyl(f'tel_leg_{k}', .02, d.length, (foot + top) / 2, mat('brass', '#c9a46a', .3, metal=.8), 12, rot=Vector((0, 0, 1)).rotation_difference(d).to_matrix())
    tube_dir = Vector((-1, .25, .55)).normalized(); tc_ = tp + Vector((0, 0, 1.25))
    cyl('tel_tube', .09, 1.1, tc_, mat('tel', '#f2f0ff', .25, coat=.6), 32, r2=.12, rot=Vector((0, 0, 1)).rotation_difference(tube_dir).to_matrix())
    cyl('tel_ring', .13, .06, tc_ + tube_dir * .45, mat('brass', '#c9a46a', .3, metal=.8), 32, rot=Vector((0, 0, 1)).rotation_difference(tube_dir).to_matrix())
    # 右邊:兩張扶手椅 + 落地燈 + 星圖
    for k, (y, f) in enumerate(((3.2, math.radians(160)), (6.3, math.radians(200)))): armchair(f'arm_{k}', Vector((3.4, y, 0)), f, mat('arm_body', '#8f7ae0', .8), mat('arm_cush', '#b9a6ef', .85))
    lp = Vector((4.3, 4.75, 0)); cyl('lamp_base', .18, .03, lp + Vector((0, 0, .015)), M_DARK, 32); cyl('lamp_pole', .015, 1.5, lp + Vector((0, 0, .77)), M_DARK, 8)
    cyl('lamp_shade', .2, .3, lp + Vector((0, 0, 1.6)), mat('lshade', '#f3ecff', .6, emit='#ffe8c8', emit_k=1.5), 32, r2=.14)
    L_ = bpy.data.lights.new('lamp_l', 'POINT'); L_.energy = 45; L_.color = (1, .85, .7); lo = bpy.data.objects.new('lamp_l', L_); col.objects.link(lo); lo.location = lp + Vector((0, 0, 1.55))
    def stars_draw(p, f, sd):
        rr = random.Random(3); pts = [p + sd * (rr.random() - .5) * .9 + Vector((0, 0, (rr.random() - .5) * .9)) for _ in range(14)]
        for k, q in enumerate(pts): sphere(f'map_star_{k}', .018, q, mat('mapstar', '#000000', 1, emit='#ffffff', emit_k=6), scale=(1, .3, 1), seg=8)
        for k in range(6):
            a, b_ = pts[k], pts[k + 1]; d = b_ - a
            cyl(f'map_line_{k}', .004, d.length, (a + b_) / 2, mat('mapline', '#000000', 1, emit='#b48bff', emit_k=4), 6, rot=Vector((0, 0, 1)).rotation_difference(d).to_matrix())
    framed('art_map', Vector((W / 2 - .05, 1.6, 2.3)), math.radians(90), 1.1, 1.1, '#141a3a', stars_draw)
    place('potted_plant_02', (-W / 2 + .7, D - .7, 0), .4, 1.0)

# ================= Wooden Rails:玩具木工房(暖木色)=================
def rails():
    t = dict(floor='planks', planks=[('#c9925c', '#b37d4a'), ('#d9a676', '#c08a58'), ('#b9824e', '#9e6b3e')], wall_a='#fbf2e3', wall_b='#f4e6cf', wains='#d9a676', rail='#fff7ea', accent='#ffb35c')
    shell(t); base_lights(1.0)
    hero('WOODEN RAILS', '#ff7f1f')
    # 後牆:軌道展示板(綠毛氈 + 一圈木軌 + 小房子剪影)
    yb = wall_board('trackboard', 4.0, 2.0, 2.25, '#8fd07a', '#b8844e')
    M_TRK = woodmat('track_w', '#e2b380', '#cf9d68', 12)
    def tp_(u): a = u * math.tau; return Vector((-.2 + math.cos(a) * 1.45, 0, 2.25 + math.sin(a) * .72 * (1 + .25 * math.sin(a * 2))))
    for k in range(56):
        p0, p1 = tp_(k / 56), tp_((k + 1) / 56); d_ = p1 - p0; ang = math.atan2(d_.z, d_.x)
        bm = bmesh.new(); g = bmesh.ops.create_cube(bm, size=1)['verts']; bmesh.ops.scale(bm, vec=(d_.length + .006, .03, .14), verts=g)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(-ang, 3, 'Y'), verts=g); bmesh.ops.translate(bm, vec=(p0 + p1) / 2 + Vector((0, yb - .015, 0)), verts=g)
        mesh_obj(f'trackboard_seg_{k}', bm, M_TRK, bevel=.005, seg=1)
    for k, (x, z, hx) in enumerate(((1.6, 2.9, '#e65a4f'), (1.55, 1.6, '#5cb7f0'), (-.2, 2.3, '#ffd166'))):
        box(f'trackboard_house_{k}', (.24, .05, .2), (x, yb - .03, z), mat(f'tbh{k}', '#fff4e6', .6), bevel=.01)
        bm = bmesh.new(); vs = [bm.verts.new(v) for v in ((x - .15, 0, z + .1), (x + .15, 0, z + .1), (x, 0, z + .24))]; bm.faces.new(vs)
        bm.normal_update(); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.05); bmesh.ops.translate(bm, vec=(0, yb - .005, 0), verts=bm.verts); mesh_obj(f'trackboard_roof_{k}', bm, mat(f'tbr{k}', hx, .5))
    M_OAK = woodmat('oak', '#d8a36a', '#b8844e'); M_LEG = woodmat('leg', '#8a6040', '#6e4a30'); M_TRACK = woodmat('track', '#e2b380', '#cf9d68', 12)
    M_GRASS = mat('grass', '#8fd07a', .9)
    # 中間:火車桌(綠色桌面 + 木軌道一圈 + 小火車 + 小房子、樹、河、橋)
    c = Vector((.2, 4.6, 0)); plank_table('tt', c, 3.8, 2.6, .76, M_OAK, M_LEG)
    box('tt_grass', (3.5, 2.3, .04), c + Vector((0, 0, .78)), M_GRASS, bevel=.01)
    box('tt_river', (3.5, .32, .045), c + Vector((0, -.55, .785)), mat('river', '#6cc6ff', .15, coat=.8))
    rx, ry, n = 1.25, .72, 64
    def track_pt(u):
        a = u * math.tau; return Vector((math.cos(a) * rx, math.sin(a) * ry, 0))
    for k in range(n):
        p0, p1 = track_pt(k / n), track_pt((k + 1) / n); d = (p1 - p0); mid = (p0 + p1) / 2; ang = math.atan2(d.y, d.x)
        box(f'track_{k}', (d.length + .006, .2, .035), c + mid + Vector((0, 0, .815)), M_TRACK, ang, bevel=.006, seg=2)
        nrm = Vector((-d.y, d.x, 0)).normalized()
        for sd in (-1, 1): box(f'groove_{k}_{sd}', (d.length + .006, .018, .008), c + mid + nrm * sd * .05 + Vector((0, 0, .834)), mat('groove', '#8a6040', .7), ang)
    box('bridge', (.5, .34, .06), c + Vector((-.3, -.55 - .17 + .17, .84)), M_OAK, 0, bevel=.01)
    u0 = .1
    for k, (hx, ln) in enumerate((('#e65a4f', .3), ('#5cb7f0', .24), ('#ffd166', .24))):
        u = u0 - k * .055; p = track_pt(u); p2 = track_pt(u + .01); ang = math.atan2(p2.y - p.y, p2.x - p.x)
        box(f'train_{k}', (ln, .16, .14), c + p + Vector((0, 0, .9)), mat(f'train{k}', hx, .35, coat=.5), ang, bevel=.025)
        for sd in (-1, 1):
            nrm = Vector((-math.sin(ang), math.cos(ang), 0))
            for e in (-1, 1): cyl(f'wheel_{k}_{sd}_{e}', .035, .02, c + p + nrm * sd * .085 + Vector((math.cos(ang), math.sin(ang), 0)) * e * ln * .3 + Vector((0, 0, .85)), M_DARK, 16, rot=Matrix.Rotation(math.pi / 2, 3, 'X') @ Matrix.Rotation(0, 3, 'Z') if False else Matrix.Rotation(ang, 3, 'Z') @ Matrix.Rotation(math.pi / 2, 3, 'X'))
        if k == 0: cyl('chimney', .03, .1, c + p + Vector((math.cos(ang), math.sin(ang), 0)) * .08 + Vector((0, 0, 1.01)), M_DARK, 16)
    for k, (x, y, wc, rc) in enumerate(((-.6, .3, '#fff4e6', '#e65a4f'), (.55, .35, '#fff7d6', '#5cb7f0'), (1.4, -.85, '#ffffff', '#ffd166'), (-1.45, .85, '#fff4e6', '#7fc79a'))): house(f'th_{k}', c + Vector((x, y, .8)), 1.1, wc, rc, k * .5)
    for k, (x, y) in enumerate(((0, .1), (-.2, .35), (.95, .05), (-1.0, -.1), (1.55, .85), (-1.55, -.95), (.3, -.95))): tree(f'tt_tree_{k}', c + Vector((x, y, .8)), 1.0)
    for k, (dx, dy) in enumerate(((-2.2, -.4), (-2.2, .6), (2.2, .2))): cyl(f'stool_{k}', .24, .5, c + Vector((dx, dy, .25)), M_OAK, 32, bevel=.03)
    # 右邊:工作台 + 洞洞板(工具)
    wb = Vector((W / 2 - .45, 5.0, 0)); plank_table('wb', wb, .8, 2.8, .92, M_OAK, M_LEG)
    box('pegboard', (.04, 2.6, 1.2), (W / 2 - .04, 5.0, 1.9), mat('peg', '#e8c9a0', .7), bevel=.01)
    for k in range(9): box(f'tool_{k}', (.03, .05, .3 + (k % 3) * .1), (W / 2 - .08, 4.0 + k * .25, 1.95), mat(f'tool{k % 3}', ['#9aa4b8', '#e65a4f', '#ffd166'][k % 3], .4, metal=.3 if k % 3 == 0 else 0), bevel=.008)
    box('vise', (.2, .25, .18), wb + Vector((-.25, -1.1, 1.0)), mat('vise', '#5a6a80', .4, metal=.5), bevel=.02)
    for k in range(6): box(f'block_{k}', (.16, .16, .16), wb + Vector((-.1 + (k % 2) * .2, -.2 + k * .2, 1.0)), mat(f'blk{k % 4}', ['#ff8fa3', '#ffd166', '#6cc6ff', '#5cc77a'][k % 4], .45), k * .3, bevel=.02)
    for k in range(5): box(f'plank_wb_{k}', (.6, .1, .02), wb + Vector((0, .8, .97 + k * .022)), M_OAK, .1 * k, bevel=.004)
    # 左後:玩具層架
    sh = Vector((-W / 2 + .3, 8.0, 0))
    for k, z in enumerate((.6, 1.3, 2.0)):
        box(f'toy_shelf_{k}', (.4, 1.6, .05), sh + Vector((0, 0, z)), M_OAK, bevel=.01)
        for j in range(4): box(f'toy_{k}_{j}', (.18, .18, .18), sh + Vector((0, -.55 + j * .37, z + .115)), mat(f'toy{(j + k) % 4}', ['#e65a4f', '#ffd166', '#5cb7f0', '#7fc79a'][(j + k) % 4], .45), (j + k) * .4, bevel=.03)
    for sd in (-1, 1): box(f'toy_side_{sd}', (.4, .04, 2.1), sh + Vector((0, sd * .8, 1.05)), M_OAK, bevel=.01)
    pendant('pd_a', c.x - .9, c.y, mat('ind_shade', '#2b2f3a', .4, metal=.4), 1.15, .24, cone=True); pendant('pd_b', c.x + .9, c.y, mat('ind_shade', '#2b2f3a', .4), 1.15, .24, cone=True)
    place('potted_plant_02', (-W / 2 + .7, 1.3, 0), .4, 1.0); place('calathea_orbifolia_01', (2.3, D - .55, 0), 1.0, 1.1)

THEMES = {'kitty': kitty, 'stocks': stocks, 'ocean': ocean, 'planet': planet, 'rails': rails}
THEMES[ROOM]()

world = bpy.data.worlds.new('space'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.004, 0.006, 0.014, 1)

# ---------------- 鏡頭:跟網頁一樣,站在入口往裡看 ----------------
cam_d = bpy.data.cameras.new('cam'); cam_d.sensor_fit = 'VERTICAL'; cam_d.clip_start = .05
cam = bpy.data.objects.new('cam', cam_d); col.objects.link(cam); scene.camera = cam
eye, look, fov = EYE, Vector((0, D, 1.35)), 56
if VIEW == 'counter': eye, look, fov = Vector((-.5, 2.2, 1.6)), Vector((3.6, 4.6, 1.1)), 50
elif VIEW == 'window': eye, look, fov = Vector((1.2, 2.0, 1.6)), Vector((-4.6, 4.8, 1.2)), 52
elif VIEW == 'cattree': eye, look, fov = Vector((-1.6, 5.2, 1.7)), Vector((-4.0, 8.0, 1.3)), 50
cam_d.angle = math.radians(fov); cam.location = eye
cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (look - eye).to_track_quat('-Z', 'Y')

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
for dv in prefs.devices: dv.use = True
scene.cycles.device = 'GPU'; scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'
for lk in ('AgX - Medium High Contrast', 'Medium High Contrast', 'AgX - Base Contrast'):
    try: scene.view_settings.look = lk; break
    except Exception: pass
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.render.filepath = OUT; scene.render.image_settings.file_format = 'PNG'
if MODE == 'preview':
    bpy.ops.render.render(write_still=True); print('RENDERED', OUT)
