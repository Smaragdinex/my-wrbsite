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
    im.image = bpy.data.images.load(f'{SITE}/public/assets/{img}'); nt.links.new(im.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = k; nt.links.new(em.outputs['Emission'], o_.inputs['Surface'])
    bpy.ops.mesh.primitive_plane_add(size=1); sc = link(bpy.context.active_object); sc.name = name; sc.scale = (w, h, 1); sc.data.materials.append(sm)
    sc.rotation_euler = (math.radians(90), 0, rot_z); sc.location = loc
    return sc

def shell(t):
    """t: 主題 dict(floor_a / floor_b 地磚兩色、wall_a / wall_b 條紋、wains 護牆板、accent 燈色)"""
    # 地板:一塊塊有倒角的方磚,棋盤格兩色(各一個物件,各自加倒角)
    T = .5; nx, ny = int(W / T), int(D / T)
    for k, mname in enumerate(('a', 'b')):
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
    box('ceiling', (W + .6, D + .6, .2), (0, D / 2, H + .1), M_WHITE)
    for nm, size, loc in (('cove_l', (.5, D - .6, .18), (-W / 2 + .25, D / 2, H - .09)), ('cove_r', (.5, D - .6, .18), (W / 2 - .25, D / 2, H - .09)),
                          ('cove_b', (W, .5, .18), (0, D - .25, H - .09)), ('cove_f', (W, .5, .18), (0, .25, H - .09))):
        box(nm, size, loc, M_WHITE, bevel=.03)
    M_ACC = mat('accent_light', '#000000', 1, emit=t['accent'], emit_k=8)
    for nm, size, loc in (('covel_l', (.03, D - 1.2, .03), (-W / 2 + .52, D / 2, H - .16)), ('covel_r', (.03, D - 1.2, .03), (W / 2 - .52, D / 2, H - .16)),
                          ('covel_b', (W - 1.2, .03, .03), (0, D - .52, H - .16)), ('covel_f', (W - 1.2, .03, .03), (0, .52, H - .16))):
        box(nm, size, loc, M_WARM)
    box('ceil_panel', (3.6, 2.6, .04), (0, D / 2 + .3, H - .02), mat('soft_panel', '#000000', 1, emit='#fff1e2', emit_k=3.2), bevel=.01)
    box('ceil_panel_rim', (3.8, 2.8, .05), (0, D / 2 + .3, H - .01), M_TRIM)
    # 牆角燈帶(地腳線發光,跟大廳一樣)
    for nm, size, loc in (('base_b', (W - .2, .03, .03), (0, D - .07, .06)), ('base_r', (.03, D - .2, .03), (W / 2 - .07, D / 2, .06))):
        box(nm, size, loc, M_ACC)
    return M_ACC

# ================= KittyCafe =================
def kitty():
    t = dict(floor_a='#fdf3ec', floor_b='#f7c9d4', wall_a='#fbefe0', wall_b='#f6e2cc', wains='#f4a7bb', rail='#fff6f0', accent='#ff8fb0', planet_a='#e88fb6', planet_b='#fbe0c6')
    M_ACC = shell(t)
    M_PINK = mat('pink', '#f4a7bb', .35, coat=.5); M_PINK2 = mat('pink_deep', '#e9799a', .4, coat=.4)
    M_CREAM = mat('cream', '#fff4e6', .3, coat=.5); M_MARBLE = mat('marble', '#f7f3ef', .12, coat=.8)
    M_CHROME = mat('chrome', '#d8dce3', .14, metal=1.0); M_WOOD = mat('wood', '#d9a676', .45)
    M_BERRY = mat('berry', '#ff5a7a', .35); M_CUSH = mat('cushion', '#f7b8c8', .85)
    # --- 後牆:大螢幕(遊戲畫面)+ 粉紅圓角框 + 霓虹招牌 ---
    sw, sh = 4.2, 4.2 * 736 / 1600
    box('bezel_screen', (sw + .22, .1, sh + .22), (-.3, D - .1, 2.2), M_DARK, bevel=.04)
    box('frame_screen', (sw + .5, .08, sh + .5), (-.3, D - .06, 2.2), M_PINK, bevel=.06, seg=4)
    screen('screen_kitty', 'kittycafe.jpg', sw, sh, (-.3, D - .16, 2.2), 0)
    M_NEON = mat('neon_pink', '#000000', 1, emit='#ff7aa8', emit_k=16)
    text('neon_title', 'KITTY CAFÉ', (-.3, D - .08, 3.68), .46, M_NEON, extrude=.012)
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
        bm.faces.new(vs); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.025)
        mesh_obj(f'awning_{k}', bm, m)
        bm = bmesh.new(); g = bmesh.ops.create_circle(bm, cap_ends=True, segments=24, radius=w / 2)['verts']
        for v in g: v.co = Vector((0, v.co.x, v.co.y))
        bm.faces.ensure_lookup_table()
        if bm.faces: bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_outer=True)
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.02); bmesh.ops.translate(bm, vec=(aw_x1, y, aw_z1), verts=bm.verts)
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
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.025); bmesh.ops.translate(bm, vec=p + Vector((0, 0, .66)), verts=bm.verts)
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
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.015); bmesh.ops.translate(bm, vec=top - Vector((0, 0, 1.05)), verts=bm.verts)
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
    area('screen_glow', (-.3, D - .6, 2.2), 70, (1, .85, .9), 3.5, aim=(-.3, 0, 1.6), sy=1.6)

THEMES = {'kitty': kitty}
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
