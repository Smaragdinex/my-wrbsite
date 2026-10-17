# 首頁外觀的星際戰艦(使用者參考圖:白色流線艦身 + 中央玻璃穹頂花園 + 貫穿的高塔 + 環繞的弧形環臂 + 艦首大環):
#   座標:Blender +Y = 艦首(匯出 glTF 後 = 網頁的 -Z)、+Z = 上。單位跟網頁一樣。
#   機庫口在艦身兩側 x = ±6.6、y = -9 ~ 3(網頁 z = -3 ~ 9),這一段側面保持平的,機庫門 / 發光框 / 點擊範圍仍由網頁 exterior.mjs 蓋。
#   環臂只繞在艦尾那半圈(y < -12),不擋鏡頭飛進機庫的路線。
# 用法:blender -b --python tools/blender/ship_build.py -- [preview out.png samples hero|side|top|back] [export out.glb]
import bpy, bmesh, sys, os, math, random
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
rng = random.Random(11)

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c) + (1,)
MATS = {}
def mat(name, color, rough=.4, metal=0.0, coat=0.0, emit=None, k=0.0, alpha=1.0, trans=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = srgb(color); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat
    if emit: p.inputs['Emission Color'].default_value = srgb(emit); p.inputs['Emission Strength'].default_value = k
    if trans: p.inputs['Transmission Weight'].default_value = trans
    if alpha < 1: p.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    MATS[name] = m; return m
def tri_brick(nt, scale, width, row, mortar, msize, c1=(.9, .9, .9, 1), c2=(1, 1, 1, 1), offset=.37):
    """依法線挑 xy / yz / xz 平面的 Brick 貼圖(物件座標)→ 回傳 (Color, Fac)"""
    L = nt.links
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs['Vector'])
    geo = nt.nodes.new('ShaderNodeNewGeometry'); ns = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], ns.inputs['Vector'])
    def absn(c):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = 'ABSOLUTE'; L.new(ns.outputs[c], n.inputs[0]); return n.outputs[0]
    ax, ay, az = absn('X'), absn('Y'), absn('Z')
    def brick(u, v):
        cb = nt.nodes.new('ShaderNodeCombineXYZ'); L.new(sep.outputs[u], cb.inputs['X']); L.new(sep.outputs[v], cb.inputs['Y'])
        b = nt.nodes.new('ShaderNodeTexBrick'); L.new(cb.outputs['Vector'], b.inputs['Vector'])
        b.inputs['Scale'].default_value = scale; b.inputs['Mortar Size'].default_value = msize; b.inputs['Mortar Smooth'].default_value = .15
        b.inputs['Brick Width'].default_value = width; b.inputs['Row Height'].default_value = row; b.offset = offset
        b.inputs['Color1'].default_value = c1; b.inputs['Color2'].default_value = c2; b.inputs['Mortar'].default_value = mortar
        return b
    bxy, byz, bxz = brick('X', 'Y'), brick('Y', 'Z'), brick('X', 'Z')
    side = nt.nodes.new('ShaderNodeMath'); side.operation = 'GREATER_THAN'; L.new(ax, side.inputs[0]); L.new(ay, side.inputs[1])
    top = nt.nodes.new('ShaderNodeMath'); top.operation = 'GREATER_THAN'; L.new(az, top.inputs[0]); top.inputs[1].default_value = .6
    def pick(out, typ):
        A, B, R = ('A', 'B', 'Result') if typ == 'FLOAT' else (6, 7, 2)
        m1 = nt.nodes.new('ShaderNodeMix'); m1.data_type = typ; L.new(side.outputs[0], m1.inputs['Factor'])
        L.new(bxz.outputs[out], m1.inputs[A]); L.new(byz.outputs[out], m1.inputs[B])
        m2 = nt.nodes.new('ShaderNodeMix'); m2.data_type = typ; L.new(top.outputs[0], m2.inputs['Factor'])
        L.new(m1.outputs[R], m2.inputs[A]); L.new(bxy.outputs[out], m2.inputs[B])
        return m2.outputs[R]
    return pick('Color', 'RGBA'), pick('Fac', 'FLOAT')
def plated(name, color, rough, metal, coat=.35, scale=.42, seam=.6):
    """白色裝甲板:長方形板塊(接縫壓暗 + 凹凸、每塊深淺不同)+ 角落縫隙的髒污(AO)+ 板邊微亮(Bevel)"""
    m = mat(name, color, rough, metal, coat=coat); nt = m.node_tree; p = nt.nodes['Principled BSDF']; L = nt.links
    col, fac = tri_brick(nt, scale, 2.4, .8, (1 - seam * .7,) * 3 + (1,), .012)
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
    mul.inputs[6].default_value = srgb(color); L.new(col, mul.inputs[7])
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = .8; ao.samples = 12
    grime = nt.nodes.new('ShaderNodeMapRange'); grime.inputs['To Min'].default_value = .62; L.new(ao.outputs['AO'], grime.inputs['Value'])
    mul2 = nt.nodes.new('ShaderNodeMix'); mul2.data_type = 'RGBA'; mul2.blend_type = 'MULTIPLY'; mul2.inputs['Factor'].default_value = 1
    L.new(mul.outputs[2], mul2.inputs[6]); L.new(grime.outputs['Result'], mul2.inputs[7])
    bev = nt.nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = .05; geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; L.new(bev.outputs['Normal'], dot.inputs[0]); L.new(geo.outputs['Normal'], dot.inputs[1])
    edge = nt.nodes.new('ShaderNodeMapRange'); edge.inputs['From Min'].default_value = .985; edge.inputs['From Max'].default_value = 1; edge.inputs['To Min'].default_value = 1; edge.inputs['To Max'].default_value = 0
    L.new(dot.outputs['Value'], edge.inputs['Value'])
    lit = nt.nodes.new('ShaderNodeMix'); lit.data_type = 'RGBA'; lit.blend_type = 'SCREEN'
    em = nt.nodes.new('ShaderNodeMath'); em.operation = 'MULTIPLY'; em.inputs[1].default_value = .35; L.new(edge.outputs['Result'], em.inputs[0]); L.new(em.outputs[0], lit.inputs['Factor'])
    L.new(mul2.outputs[2], lit.inputs[6]); lit.inputs[7].default_value = (1, 1, 1, 1); L.new(lit.outputs[2], p.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .45; bump.inputs['Distance'].default_value = .02; bump.invert = True
    L.new(fac, bump.inputs['Height']); L.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m
def facade(name):
    """深色玻璃立面 + 上千個小窗:Brick 每格隨機亮或暗(像夜裡的城市),窗框是暗的"""
    m = mat(name, '#11161e', .08, .3, coat=1.0); nt = m.node_tree; p = nt.nodes['Principled BSDF']; L = nt.links
    col, fac = tri_brick(nt, 3.0, 1.2, .95, (0, 0, 0, 1), .22, c1=(0, 0, 0, 1), c2=(1, 1, 1, 1), offset=.5)
    sep = nt.nodes.new('ShaderNodeSeparateColor'); L.new(col, sep.inputs['Color'])
    lit = nt.nodes.new('ShaderNodeMapRange'); lit.inputs['From Min'].default_value = .26; lit.inputs['From Max'].default_value = .3; lit.inputs['To Min'].default_value = .07   # 約七成亮,暗的那幾格也有一點微光
    L.new(sep.outputs[0], lit.inputs['Value'])
    warm = nt.nodes.new('ShaderNodeMix'); warm.data_type = 'RGBA'; L.new(sep.outputs[0], warm.inputs['Factor'])
    warm.inputs[6].default_value = srgb('#ffc98a'); warm.inputs[7].default_value = srgb('#fff1d6')
    L.new(warm.outputs[2], p.inputs['Emission Color'])
    mask = nt.nodes.new('ShaderNodeMath'); mask.operation = 'MULTIPLY'; L.new(lit.outputs['Result'], mask.inputs[0])
    inside = nt.nodes.new('ShaderNodeMapRange'); inside.inputs['From Min'].default_value = .5; inside.inputs['From Max'].default_value = .9; L.new(fac, inside.inputs['Value'])   # 窗框(mortar)不發光
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; L.new(inside.outputs['Result'], inv.inputs[1]); L.new(inv.outputs[0], mask.inputs[1])
    k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 4.2; L.new(mask.outputs[0], k.inputs[0]); L.new(k.outputs[0], p.inputs['Emission Strength'])
    return m
M_HULL = plated('ship_white', '#ecebe7', .26, .2, coat=.45)
M_HULL2 = plated('ship_pearl', '#cfd3da', .32, .45, coat=.25, scale=.6)
M_FACADE = facade('ship_facade')
M_DARK = mat('ship_dark', '#2f343d', .5, .5)
M_WIN = mat('ship_window', '#000000', 1, emit='#ffd49a', k=7)
M_GOLD = mat('ship_goldglow', '#000000', 1, emit='#ffbe63', k=12)
M_BLUE = mat('ship_blueglow', '#000000', 1, emit='#7cc8ff', k=8)
M_GLASS = mat('ship_glass', '#dcecff', .03, 0, trans=1.0)
M_LAWN = mat('ship_lawn', '#4a7236', .95)
M_TREE = mat('ship_tree', '#3b6a33', .85)
M_TREE2 = mat('ship_tree2', '#557f3a', .85)
M_METAL = mat('ship_metal', '#b9bcc2', .25, 1.0)

def obj(name, bm, m, bevel=0.0, seg=2, smooth=True, angle=35):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(angle); b.harden_normals = True
    for p in o.data.polygons: p.use_smooth = smooth
    return o
def box(name, size, loc, m, rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    o = obj(name, bm, m, bevel); o.location = loc; o.rotation_euler = rot; return o
def octa(w, h, c):
    c = min(c, w / 2 - .01, h / 2 - .01)
    return [(-w / 2 + c, -h / 2), (w / 2 - c, -h / 2), (w / 2, -h / 2 + c), (w / 2, h / 2 - c), (w / 2 - c, h / 2), (-w / 2 + c, h / 2), (-w / 2, h / 2 - c), (-w / 2, -h / 2 + c)]
def loft(name, secs, m, bevel=.12):
    """沿 Y 的斷面放樣:secs = [(y, 寬, 高, 中心 z, 切角)]"""
    bm = bmesh.new(); rings = []
    for y, w, h, zc, c in secs: rings.append([bm.verts.new((x, y, zc + z)) for x, z in octa(w, h, c)])
    for A, B in zip(rings, rings[1:]):
        for k in range(8): bm.faces.new((A[k], A[(k + 1) % 8], B[(k + 1) % 8], B[k]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, m, bevel, 2, smooth=False)
def arc(name, cx, cy, R, wr, h, zc, a0, a1, m, taper=0.0, seg=160, bevel=.1, lean=0.0):
    """以 (cx, cy) 為圓心的一段實心弧(斷面:徑向寬 wr、高 h);taper = 兩端多少度內逐漸收尖"""
    bm = bmesh.new(); rings = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg
        k = 1.0
        if taper:
            d = min(a - a0, a1 - a) / math.radians(taper)
            if d < 1: k = .12 + .88 * math.sin(d * math.pi / 2)
        ca, sa = math.cos(a), math.sin(a); ww, hh = wr * k, h * (.4 + .6 * k)
        pts = [(R - ww / 2, -hh / 2), (R + ww / 2, -hh / 2), (R + ww / 2 + lean * k, hh / 2), (R - ww / 2 + lean * k, hh / 2)]
        rings.append([bm.verts.new((cx + ca * r, cy + sa * r, zc + z)) for r, z in pts])
    for A, B in zip(rings, rings[1:]):
        for k in range(4): bm.faces.new((A[k], B[k], B[(k + 1) % 4], A[(k + 1) % 4]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, m, bevel, 2, smooth=False)
def cyl(name, r, depth, loc, m, rot=(0, 0, 0), verts=64, bevel=0.0, r2=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    o = obj(name, bm, m, bevel, 2); o.location = loc; o.rotation_euler = rot; return o
def torus(name, R, r, loc, m, rot=(0, 0, 0), seg=128, mseg=16):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=mseg, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o

# ================= 1) 主艦身:箭頭形(艦首 +Y 收尖),機庫那段側面平直 =================
HULL = [  # (y, 寬, 高, 中心 z, 切角)
    (-26, 9.6, 5.4, 0, 1.4), (-22, 12.2, 6.0, 0, 1.6), (-10, 13.2, 6.2, 0, 1.5), (4, 13.2, 6.2, 0, 1.5),
    (14, 11.6, 5.6, .1, 1.6), (24, 8.2, 4.4, .2, 1.6), (32, 4.6, 2.8, .3, 1.2), (38, 1.4, 1.0, .35, .4), (41, .2, .2, .4, .05)]
loft('hull', HULL, M_HULL)
def hull_half_width(y, z):
    for (y0, w0, h0, z0, c0), (y1, w1, h1, z1, c1) in zip(HULL, HULL[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0); w = w0 + (w1 - w0) * t; h = h0 + (h1 - h0) * t; c = c0 + (c1 - c0) * t
            return w / 2 - max(0, abs(z) - (h / 2 - c))
    return 0
# 上方疊兩層較窄的裝甲甲板(像參考圖一層層的白色板),最上層收得更尖
loft('deck1', [(-24, 9.4, 1.2, 3.4, .5), (6, 10.4, 1.2, 3.4, .5), (20, 7.2, 1.0, 3.3, .45), (33, 2.6, .7, 3.0, .3), (37, .3, .2, 2.8, .1)], M_HULL2, .08)
loft('deck2', [(-12, 6.0, .9, 4.4, .4), (8, 6.8, .9, 4.4, .4), (22, 3.6, .7, 4.2, .3), (30, .4, .2, 4.0, .1)], M_HULL, .06)
# 艦身兩側刀鋒狀的層疊板:往外突出、往艦首延伸成尖(參考圖那種一片片的白色長板),機庫口下方那片剛好在門下緣
for s_ in (-1, 1):
    for k, (z, out, th, y0, y1, m) in enumerate(((-2.55, 1.3, .38, -23, 31.5, M_HULL2), (2.75, .9, .32, 6, 27.5, M_HULL), (-.9, .7, .3, 6, 29.5, M_HULL2))):
        bm = bmesh.new(); ys = [y0 + (y1 - y0) * i / 24 for i in range(25)]; rows = []
        for y in ys:
            hw = hull_half_width(min(max(y, -25.9), 40.9), z) if y < 40.9 else 0
            t = (y - y0) / (y1 - y0); o_ = out * (1 - max(0, t - .6) / .4 * .97)
            rows.append([bm.verts.new((s_ * (hw - .3), y, z - th / 2)), bm.verts.new((s_ * (hw + o_), y, z - th / 2 + .05)), bm.verts.new((s_ * (hw + o_), y, z + th / 2 - .05)), bm.verts.new((s_ * (hw - .3), y, z + th / 2))])
        for A, B in zip(rows, rows[1:]):
            for q in range(4): bm.faces.new((A[q], B[q], B[(q + 1) % 4], A[(q + 1) % 4]))
        bm.faces.new(rows[0][::-1]); bm.faces.new(rows[-1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        obj(f'blade_{s_}_{k}', bm, m, .05, 2, smooth=False)
        # 刀鋒下緣一條暖光
        bm = bmesh.new(); rows = []
        for y in ys[2:-3]:
            hw = hull_half_width(min(max(y, -25.9), 40.9), z); t = (y - y0) / (y1 - y0); o_ = out * (1 - max(0, t - .7) / .3 * .9)
            rows.append([bm.verts.new((s_ * (hw + o_ * .5), y, z - th / 2 - .02)), bm.verts.new((s_ * (hw + o_ - .05), y, z - th / 2 + .03))])
        for A, B in zip(rows, rows[1:]): bm.faces.new((A[0], A[1], B[1], B[0]))
        obj(f'blade_glow_{s_}_{k}', bm, M_WIN, smooth=False)
# 面板接縫:甲板頂面每隔一段一道深色細縫 + 甲板上的小結構(管線箱、散熱片、天線座)
for y in range(-22, 32, 3):
    hw = hull_half_width(y, 3.0)
    if hw > 1: box(f'seam_top_{y}', (min(9.6, hw * 2 - .6), .07, .05), (0, y + .5, 4.03 if y < 20 else 3.85), M_DARK)
for s_ in (-1, 1):
    for y in range(-22, 30, 4):
        if -11 < y < 5: continue
        hw = hull_half_width(y, 0)
        box(f'seam_side_{s_}_{y}', (.05, .07, 3.0), (s_ * (hw + .01), y + .3, .2), M_DARK)
for i in range(70):
    y = rng.uniform(-21, 26); hw = hull_half_width(y, 4.4) - 1.0
    if hw < .6 or -1 < y + 17 < 1: continue
    x = rng.uniform(-hw, hw)
    if abs(x) < .7: continue
    sz = (rng.uniform(.25, .9), rng.uniform(.3, 1.4), rng.uniform(.12, .45))
    box(f'greeble_{i}', sz, (x, y, (4.9 if y < 22 else 4.4) + sz[2] / 2), rng.choice((M_HULL2, M_DARK, M_HULL)), bevel=.03)
# 艦腹龍骨
loft('keel', [(-24, 6.4, 1.6, -3.6, .6), (4, 7.2, 1.6, -3.6, .6), (22, 4.0, 1.2, -3.2, .5), (32, .6, .3, -2.4, .1)], M_HULL2, .08)
# 甲板中央的深色溝 + 藍色導航燈線
box('deck_trench', (.9, 26, .12), (0, 18, 4.88), M_DARK)
box('deck_blue', (.08, 24, .06), (0, 18, 4.96), M_BLUE)

# 側面:一層層的深色玻璃立面帶(上千個小窗在材質裡,隨機亮暗),機庫那段 y = -10 ~ 4 跳過
def facade_band(tag, s_, zr, y0, y1, hgt):
    bm = bmesh.new(); rows = []
    ys = [y0 + (y1 - y0) * i / 40 for i in range(41)]
    for y in ys:
        hw = hull_half_width(y, zr) + .015
        rows.append([bm.verts.new((s_ * hw, y, zr - hgt / 2)), bm.verts.new((s_ * hw, y, zr + hgt / 2))])
    for A, B in zip(rows, rows[1:]): bm.faces.new((A[0], B[0], B[1], A[1]) if s_ > 0 else (A[1], B[1], B[0], A[0]))
    obj(f'facade_{tag}', bm, M_FACADE, smooth=False)
for s in (-1, 1):
    for k, (zr, hgt) in enumerate(((-1.55, .55), (-.55, .5), (.5, .55), (1.5, .45))):
        facade_band(f'{s}_{k}_aft', s, zr, -24.5, -10.6, hgt)
        facade_band(f'{s}_{k}_fwd', s, zr, 4.6, 30 - k * 1.5, hgt)
    for k, zr in enumerate((3.25, 3.65)):                                   # 上層甲板側面
        bm = bmesh.new(); rows = []
        for i in range(41):
            y = -22 + 40 * i / 40; hw = 4.7 if y < 6 else 4.7 - (y - 6) * .12
            rows.append([bm.verts.new((s * (hw + .01), y, zr - .15)), bm.verts.new((s * (hw + .01), y, zr + .15))])
        for A, B in zip(rows, rows[1:]): bm.faces.new((A[0], B[0], B[1], A[1]) if s > 0 else (A[1], B[1], B[0], A[0]))
        obj(f'facade_deck_{s}_{k}', bm, M_FACADE, smooth=False)

# ================= 2) 艦首大環(繞著艦身的環 + 套筒,金色光帶)=================
RY = 16
torus('collar_ring', 8.2, 1.0, (0, RY, .1), M_HULL, rot=(math.pi / 2, 0, 0), seg=160, mseg=24)
torus('collar_ring2', 8.2, .5, (0, RY + 1.6, .1), M_HULL2, rot=(math.pi / 2, 0, 0), seg=160, mseg=16)
cyl('collar_sleeve', 7.0, 3.2, (0, RY + .8, .1), M_HULL2, rot=(math.pi / 2, 0, 0), verts=96, bevel=.15)
for k, dy in enumerate((-.1, .8, 1.7)):
    torus(f'collar_glow_{k}', 7.08, .09, (0, RY + dy, .1), M_GOLD, rot=(math.pi / 2, 0, 0), seg=160, mseg=8)
for a in range(0, 360, 45):                                                     # 環和套筒之間的支架
    r_ = math.radians(a + 22.5)
    box(f'collar_strut_{a}', (.5, .6, 1.4), (math.cos(r_) * 7.6, RY, .1 + math.sin(r_) * 7.6), M_HULL2, rot=(0, -r_, 0), bevel=.05)

# ================= 3) 中央樞紐圓盤 + 玻璃穹頂花園 =================
HX, HY, HZ = 0, -17, 3.1
cyl('hub_base', 10.2, 1.3, (HX, HY, HZ + .65), M_HULL, verts=128, bevel=.25)
cyl('hub_step', 8.6, .9, (HX, HY, HZ + 1.75), M_HULL2, verts=128, bevel=.18)
torus('hub_glow', 10.25, .1, (HX, HY, HZ + .9), M_GOLD, seg=160, mseg=8)
torus('hub_glow2', 8.65, .08, (HX, HY, HZ + 2.1), M_WIN, seg=160, mseg=8)
cyl('garden_lawn', 6.6, .25, (HX, HY, HZ + 2.3), M_LAWN, verts=96)
for i in range(46):                                                             # 穹頂裡的樹(樹幹 + 兩三團樹冠)
    a, r_ = rng.uniform(0, math.tau), 6.0 * math.sqrt(rng.random())
    if r_ < 1.9: continue                                                       # 中間留給高塔
    x, y = HX + math.cos(a) * r_, HY + math.sin(a) * r_; hgt = rng.uniform(.8, 2.0) * (1 - .35 * r_ / 6)
    cyl(f'trunk_{i}', .07, hgt, (x, y, HZ + 2.4 + hgt / 2), mat('trunk', '#5a4330', .9), verts=6)
    for j in range(rng.randint(2, 3)):
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rng.uniform(.45, .8))
        for v in bm.verts: v.co *= rng.uniform(.8, 1.15)
        o = obj(f'canopy_{i}_{j}', bm, rng.choice((M_TREE, M_TREE2))); o.location = (x + rng.uniform(-.3, .3), y + rng.uniform(-.3, .3), HZ + 2.4 + hgt + rng.uniform(-.1, .4)); o.scale = (1, 1, .8)
for i in range(14):
    a = rng.uniform(0, math.tau); r_ = rng.uniform(2.2, 6.0)
    cyl(f'garden_lamp_{i}', .09, .5, (HX + math.cos(a) * r_, HY + math.sin(a) * r_, HZ + 2.65), M_WIN, verts=8)
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=6.8)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True)
for v in bm.verts: v.co.z *= .62
dome = obj('dome_glass', bm, M_GLASS); dome.location = (HX, HY, HZ + 2.2)
for k in range(8):                                                              # 穹頂的金屬肋
    a = k * math.pi / 8
    torus(f'dome_rib_{k}', 6.82, .05, (HX, HY, HZ + 2.2), M_METAL, rot=(math.pi / 2, 0, a), seg=96, mseg=6)
for o in [o for o in scene.objects if o.name.startswith('dome_rib_')]:
    o.scale = (1, .62, 1); o.rotation_euler = (math.pi / 2, 0, o.rotation_euler[2])
    bm2 = bmesh.new(); bm2.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm2, geom=bm2.verts[:] + bm2.edges[:] + bm2.faces[:], plane_co=(0, 0, 0), plane_no=(0, 1, 0), clear_inner=True)
    bm2.to_mesh(o.data); bm2.free()

for k in range(20):                                                             # 樞紐圓盤外緣的放射鰭
    a = k * math.tau / 20
    box(f'hub_fin_{k}', (1.6, .22, .9), (HX + math.cos(a) * 10.4, HY + math.sin(a) * 10.4, HZ + .55), M_HULL2, rot=(0, 0, a), bevel=.04)
for k, (x, y) in enumerate(((3.2, 22.0), (-3.0, -6.0))):                         # 甲板上的天線碟
    cyl(f'dish_mast_{k}', .12, 1.6, (x, y, 5.7), M_METAL, verts=12)
    cyl(f'dish_{k}', 1.3, .35, (x, y, 6.6), M_HULL2, rot=(math.radians(35), 0, math.radians(30 + k * 120)), verts=48, bevel=.04, r2=.15)
# ================= 4) 貫穿樞紐的高塔(上高下短)=================
def tower(name, z0, z1, w0, w1, m):
    bm = bmesh.new(); rings = []
    for z, w in ((z0, w0), (z1, w1)):
        rings.append([bm.verts.new((HX + x, HY + y, z)) for x, y in octa(w, w * .8, w * .22)])
    for k in range(8): bm.faces.new((rings[0][k], rings[0][(k + 1) % 8], rings[1][(k + 1) % 8], rings[1][k]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return obj(name, bm, m, .08, 2, smooth=False)
tower('spire_up', HZ, 30, 4.4, 1.8, M_HULL)
tower('spire_up2', 30, 37, 1.6, .5, M_HULL2)
tower('spire_low', -24, -3, 1.6, 3.4, M_HULL)
cyl('spire_antenna', .07, 6, (HX, HY, 40), M_METAL, verts=8)
for sx in (-1, 1):                                                              # 塔身直條窗
    box(f'spire_win_{sx}', (.06, .3, 22), (HX + sx * 1.25, HY, 17), M_WIN)
    box(f'spire_win2_{sx}', (.3, .06, 22), (HX, HY + sx * 1.0, 17), M_WIN)
for z in (12, 20, 27):                                                          # 塔上的環形平台
    cyl(f'spire_deck_{z}', 2.6 - z * .03, .35, (HX, HY, z), M_HULL2, verts=48, bevel=.08)
    torus(f'spire_deck_glow_{z}', 2.6 - z * .03, .05, (HX, HY, z), M_WIN, seg=64, mseg=6)

# ================= 5) 環臂:兩道弧形環繞艦尾那半圈(兩端收尖)+ 屋頂花園 + 窗帶 + 連接臂 =================
def ring_arm(tag, R, wr, h, zc, a0, a1):
    a0, a1 = math.radians(a0), math.radians(a1)
    arc(f'arm_{tag}', HX, HY, R, wr, h, zc, a0, a1, M_HULL, taper=28)
    arc(f'arm_{tag}_under', HX, HY, R - wr * .05, wr * .7, h * .4, zc - h * .55, a0 + .12, a1 - .12, M_HULL2, taper=20, bevel=.06)
    arc(f'arm_{tag}_garden', HX, HY, R - wr * .12, wr * .5, .18, zc + h / 2 + .05, a0 + .25, a1 - .25, M_LAWN, taper=10, bevel=0)
    for side, r_ in ((1, R + wr / 2 + .03), (-1, R - wr / 2 - .03)):           # 內外兩側:一長條發光的長廊窗帶(中間有支柱分隔)+ 下面一排小窗
        arc(f'arm_{tag}_facade_{side}', HX, HY, r_ - side * .02, .05, h * .48, zc + h * .08, a0 + .28, a1 - .28, M_FACADE, seg=120, bevel=0)
        a = a0 + .3
        while a < a1 - .3:
            L = rng.uniform(.18, .4)
            arc(f'arm_{tag}_gal_{side}_{a:.2f}', HX, HY, r_, .07, h * .32, zc + h * .08, a, min(a + L, a1 - .3), M_WIN, seg=12, bevel=0)
            a += L + .025
        a = a0 + .35
        while a < a1 - .35:
            L = rng.uniform(.03, .08)
            if rng.random() < .7: arc(f'arm_{tag}_win_{side}_{a:.2f}', HX, HY, r_, .06, .14, zc - h * .3, a, a + L, M_WIN, seg=4, bevel=0)
            a += L + rng.uniform(.02, .05)
    a = a0 + .3                                                                # 結構肋:每隔幾度一圈稍微凸出的環箍
    while a < a1 - .3:
        arc(f'arm_{tag}_rib_{a:.2f}', HX, HY, R, wr * 1.06, h * 1.06, zc, a, a + .012, M_HULL2, seg=2, bevel=.03)
        a += .11
    n = int((a1 - a0) * R / 1.6)                                                # 屋頂花園的小樹
    for i in range(n):
        if rng.random() < .55:
            a = rng.uniform(a0 + .3, a1 - .3); r_ = R + rng.uniform(-wr * .3, wr * .2)
            bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rng.uniform(.25, .5))
            for v in bm.verts: v.co *= rng.uniform(.82, 1.12)
            o = obj(f'arm_{tag}_tree_{i}', bm, rng.choice((M_TREE, M_TREE2))); o.location = (HX + math.cos(a) * r_, HY + math.sin(a) * r_, zc + h / 2 + .4)
ring_arm('outer', 22, 4.8, 3.2, -.4, 160, 378)
ring_arm('inner', 14.8, 3.4, 2.4, .7, 150, 390)
arc('arm_low', HX, HY, 19.2, 2.2, 1.2, -3.2, math.radians(185), math.radians(355), M_HULL2, taper=25)   # 下面再一道細的,讓環臂有層次
for a in (200, 270, 340):                                                       # 外環 ↔ 內環的連接臂
    r_ = math.radians(a); mid = (14.5 + 22) / 2
    box(f'arm_spoke_{a}', (7.6, 1.4, 1.1), (HX + math.cos(r_) * mid, HY + math.sin(r_) * mid, .1), M_HULL2, rot=(0, 0, r_), bevel=.12)
for a in (180, 360):                                                            # 內環 ↔ 樞紐
    r_ = math.radians(a); mid = (10 + 14.5) / 2
    box(f'hub_spoke_{a}', (4.8, 1.4, 1.0), (HX + math.cos(r_) * mid, HY + math.sin(r_) * mid, 1.2), M_HULL2, rot=(0, 0, r_), bevel=.12)

# ================= 6) 艦尾引擎(三顆;網頁上再加藍色噴焰)=================
for k, (x, z) in enumerate(((-3.0, -.4), (3.0, -.4), (0, 1.9))):
    cyl(f'engine_{k}', 1.45, 2.4, (x, -27, z), M_HULL2, rot=(math.pi / 2, 0, 0), verts=48, bevel=.12, r2=1.7)
    cyl(f'engine_core_{k}', 1.05, .1, (x, -28.25, z), M_BLUE, rot=(math.pi / 2, 0, 0), verts=48)
    torus(f'engine_lip_{k}', 1.62, .12, (x, -28.2, z), M_METAL, rot=(math.pi / 2, 0, 0), seg=64, mseg=10)
    for q in range(10):                                                         # 噴嘴外側的散熱鰭
        a = q * math.tau / 10
        box(f'engine_fin_{k}_{q}', (.12, 1.8, .45), (x + math.cos(a) * 1.65, -27, z + math.sin(a) * 1.65), M_DARK, rot=(0, -a, 0), bevel=.02)
# 護航小艦:幾艘白色小船繞在旁邊(只在渲染圖;網頁上另外做會飛的)
M_SHIPGLOW = M_BLUE
def shuttle(tag, loc, yaw, sc):
    o = loft(f'escort_{tag}', [(-3, 1.6, .8, 0, .3), (-1, 2.2, 1.0, .1, .35), (1.5, 1.6, .8, .1, .3), (3.2, .2, .2, 0, .05)], M_HULL, .05)
    w = loft(f'escort_{tag}_wing', [(-2.6, 4.4, .16, -.1, .05), (-.6, 3.2, .16, -.1, .05), (.6, .6, .12, -.1, .03)], M_HULL2, .03)
    g = cyl(f'escort_{tag}_glow', .45, .1, (0, -3.05, 0), M_SHIPGLOW, rot=(math.pi / 2, 0, 0), verts=24)
    for o_ in (o, w, g):
        o_.location = Vector(loc) + Vector(o_.location) * sc if o_ is g else Vector(loc)
        o_.scale = (sc, sc, sc); o_.rotation_euler = (o_.rotation_euler[0], 0, yaw)
        if o_ is g: o_.location = Vector(loc) + Vector((math.sin(yaw) * 3.05 * sc, -math.cos(yaw) * 3.05 * sc, 0))
for k, (loc, yaw, sc) in enumerate((((30, 18, -6), .3, 1.0), ((-34, 6, 8), -.4, .9), ((24, -42, 4), .9, 1.1), ((-12, 44, -10), .1, .8), ((44, -8, 12), .5, .7))):
    shuttle(k, loc, yaw, sc)

# 機庫段的側面:上下兩條深色裝甲帶框出機庫口位置(門、發光框由網頁蓋)
for s in (-1, 1):
    box(f'hangar_frame_top_{s}', (.5, 14.2, .5), (s * 6.55, -3, 2.55), M_DARK, bevel=.05)
    box(f'hangar_frame_bot_{s}', (.5, 14.2, .5), (s * 6.55, -3, -1.95), M_DARK, bevel=.05)

# ================= 7) 表面小結構(kitbash):管線箱、散熱片、感測器、小燈,沿表面法線長出來 =================
def surface_points(objs, n, cond):
    tris = []
    for o in objs:
        me = o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh(); mw = o.matrix_world
        for poly in me.polygons:
            c = mw @ poly.center; nrm = (mw.to_3x3() @ poly.normal).normalized()
            if cond(c, nrm): tris.append((poly.area, c, nrm))
    tot = sum(t[0] for t in tris); out = []
    for _ in range(n):
        r_ = rng.random() * tot; acc = 0
        for area, c, nrm in tris:
            acc += area
            if acc >= r_: out.append((c, nrm, area)); break
    return out
def kitbash(tag, pts, mats, light_every=9):
    bms = {m.name: (bmesh.new(), m) for m in mats + [M_WIN, M_BLUE]}
    for i, (c, nrm, area) in enumerate(pts):
        jit = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * min(1.2, math.sqrt(area) * .45)
        jit -= nrm * jit.dot(nrm); p0 = c + jit
        fwd = Vector((0, 1, 0)); fwd = (fwd - nrm * fwd.dot(nrm)); fwd = fwd.normalized() if fwd.length > .1 else Vector((1, 0, 0))
        side = nrm.cross(fwd)
        if i % light_every == 0:
            m = M_WIN if rng.random() < .7 else M_BLUE; sx, sy, sz = .08, .08, .05
        else:
            m = rng.choice(mats); sx, sy, sz = rng.uniform(.15, .8), rng.uniform(.2, 1.4), rng.uniform(.04, .32)
        bm, _ = bms[m.name]
        g = bmesh.ops.create_cube(bm, size=1)['verts']
        for v in g:
            lp = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz + sz / 2))
            v.co = p0 + side * lp.x + fwd * lp.y + nrm * lp.z
    for nm, (bm, m) in bms.items():
        if len(bm.verts): obj(f'kit_{tag}_{nm}', bm, m, smooth=False)
        else: bm.free()
hub_xy = Vector((HX, HY))
not_hangar = lambda c: not (abs(c.x) > 4.5 and -10.5 < c.y < 4.5 and -2.4 < c.z < 3.0)
off_hub = lambda c: (Vector((c.x, c.y)) - hub_xy).length > 10.8
off_collar = lambda c: not (13.8 < c.y < 19.8)
hulls = [o for o in scene.objects if o.name in ('hull', 'deck1', 'deck2', 'keel')]
kitbash('top', surface_points(hulls, 900, lambda c, n: n.z > .75 and off_hub(c) and off_collar(c) and c.y < 30), [M_HULL2, M_HULL2, M_HULL, M_HULL, M_METAL, M_DARK])
kitbash('side', surface_points(hulls, 500, lambda c, n: abs(n.x) > .6 and not_hangar(c) and off_collar(c) and c.y < 28 and abs(c.z) > .2 and not (-2 < c.z < 2 and abs(c.x) > 4)), [M_HULL2, M_HULL2, M_HULL, M_DARK])
kitbash('belly', surface_points(hulls, 450, lambda c, n: n.z < -.7 and off_collar(c) and c.y < 30), [M_HULL2, M_DARK, M_METAL])
arms = [o for o in scene.objects if o.name in ('arm_outer', 'arm_inner', 'arm_low')]
kitbash('armunder', surface_points(arms, 700, lambda c, n: n.z < -.6), [M_HULL2, M_DARK, M_METAL], light_every=6)
kitbash('hub', surface_points([o for o in scene.objects if o.name in ('hub_base', 'hub_step')], 160, lambda c, n: n.z < -.6 or abs(n.z) < .3), [M_HULL2, M_DARK], light_every=5)

# ================= 8) 標記:艦名、編號、機庫口的警示斜紋 =================
M_PAINT = mat('ship_paint', '#3a3f48', .4, .2)
M_HAZARD = mat('ship_hazard', '#e8b23a', .4)
def label(text, loc, rot, size, m):
    cu = bpy.data.curves.new(text, 'FONT'); cu.body = text; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = .01
    o = bpy.data.objects.new('label_' + text, cu); scene.collection.objects.link(o); o.location = loc; o.rotation_euler = rot; o.data.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.convert(target='MESH')
for s_ in (-1, 1):
    hw = hull_half_width(-17, .6)
    label('XA-01', (s_ * (hw + .03), -17, .1), (math.pi / 2, 0, s_ * math.pi / 2), .9, M_PAINT)
    for k in range(18):                                                         # 機庫口上下框的黃黑斜紋
        for z in (2.55, -1.95):
            box(f'hazard_{s_}_{k}_{z}', (.03, .22, .5), (s_ * 6.82, -9.6 + k * .78, z), M_HAZARD, rot=(math.radians(35), 0, 0))
label('X·ARTS', (0, 9.5, 4.86), (0, 0, -math.pi / 2), 1.5, M_PAINT)               # 艦名寫在上層甲板(沿艦身方向)
label('XA-01', (0, 27.5, 4.3), (0, 0, 0), 1.3, M_PAINT)

mode = ARGS[0] if ARGS else 'preview'
if mode == 'preview':
    out = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else '/tmp/ship.png'
    w = bpy.data.worlds.new('space'); scene.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
    o_ = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground'); vor = nt.nodes.new('ShaderNodeTexVoronoi'); ramp = nt.nodes.new('ShaderNodeValToRGB'); tc = nt.nodes.new('ShaderNodeTexCoord')
    vor.inputs['Scale'].default_value = 260; nt.links.new(tc.outputs['Generated'], vor.inputs['Vector']); nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].color = (1.4, 1.4, 1.6, 1); ramp.color_ramp.elements[1].position = .06; ramp.color_ramp.elements[1].color = (.002, .003, .008, 1)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1; nt.links.new(bg.outputs['Background'], o_.inputs['Surface'])
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.2; sun.angle = math.radians(2); sun.color = (1, .96, .9)
    so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so); so.rotation_mode = 'QUATERNION'; so.rotation_quaternion = (Vector((0, 0, 0)) - Vector((70, 30, 60))).to_track_quat('-Z', 'Y')
    below = bpy.data.lights.new('below', 'SUN'); below.energy = .7; below.color = (.45, .62, 1)
    bo = bpy.data.objects.new('below', below); scene.collection.objects.link(bo); bo.rotation_euler = (math.radians(180), 0, 0)
    rim = bpy.data.lights.new('rim', 'SUN'); rim.energy = 1.2; rim.color = (.55, .7, 1)
    ro = bpy.data.objects.new('rim', rim); scene.collection.objects.link(ro); ro.rotation_euler = (math.radians(110), 0, math.radians(200))
    # ---- 背景的大星球:海洋 + 大陸 + 冰帽、雲層、藍色大氣光暈、夜面城市燈光(只在渲染圖;網頁上另外做)----
    SUN_DIR = Vector((70, 30, 60)).normalized()                                 # 從地表指向太陽
    def planet_mats():
        m = bpy.data.materials.new('planet_surface'); m.use_nodes = True; nt = m.node_tree; L = nt.links; p = nt.nodes['Principled BSDF']
        tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); L.new(tc.outputs['Object'], nz.inputs['Vector'])
        nz.inputs['Scale'].default_value = .0045; nz.inputs['Detail'].default_value = 15; nz.inputs['Roughness'].default_value = .62; nz.inputs['Distortion'].default_value = .25
        ramp = nt.nodes.new('ShaderNodeValToRGB'); L.new(nz.outputs['Fac'], ramp.inputs['Fac']); cr = ramp.color_ramp
        cr.elements[0].position = .44; cr.elements[0].color = srgb('#082246'); cr.elements[1].position = .515; cr.elements[1].color = srgb('#1b5f8f')
        for pos, col in ((.522, '#cdbd8c'), (.54, '#4f7034'), (.6, '#3e5a2c'), (.66, '#7a6447'), (.72, '#c9c2b4')):
            e = cr.elements.new(pos); e.color = srgb(col)
        sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs['Vector'])
        ab = nt.nodes.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; L.new(sep.outputs['Z'], ab.inputs[0])
        ice = nt.nodes.new('ShaderNodeMapRange'); ice.inputs['From Min'].default_value = R * .82; ice.inputs['From Max'].default_value = R * .88; L.new(ab.outputs[0], ice.inputs['Value'])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; L.new(ice.outputs['Result'], mx.inputs['Factor']); L.new(ramp.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = (.92, .95, 1, 1)
        L.new(mx.outputs[2], p.inputs['Base Color'])
        land = nt.nodes.new('ShaderNodeMapRange'); land.inputs['From Min'].default_value = .51; land.inputs['From Max'].default_value = .525; L.new(nz.outputs['Fac'], land.inputs['Value'])
        rough = nt.nodes.new('ShaderNodeMapRange'); rough.inputs['To Min'].default_value = .22; rough.inputs['To Max'].default_value = .9; L.new(land.outputs['Result'], rough.inputs['Value']); L.new(rough.outputs['Result'], p.inputs['Roughness'])
        # 夜面城市燈光:陸地 × 細碎雜訊 × 背光那一面
        geo = nt.nodes.new('ShaderNodeNewGeometry'); dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; L.new(geo.outputs['Normal'], dot.inputs[0]); dot.inputs[1].default_value = SUN_DIR
        night = nt.nodes.new('ShaderNodeMapRange'); night.inputs['From Min'].default_value = -.02; night.inputs['From Max'].default_value = -.18; L.new(dot.outputs['Value'], night.inputs['Value'])
        cn = nt.nodes.new('ShaderNodeTexNoise'); L.new(tc.outputs['Object'], cn.inputs['Vector']); cn.inputs['Scale'].default_value = .12; cn.inputs['Detail'].default_value = 8
        city = nt.nodes.new('ShaderNodeMapRange'); city.inputs['From Min'].default_value = .58; city.inputs['From Max'].default_value = .66; L.new(cn.outputs['Fac'], city.inputs['Value'])
        m1 = nt.nodes.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'; L.new(city.outputs['Result'], m1.inputs[0]); L.new(land.outputs['Result'], m1.inputs[1])
        m2 = nt.nodes.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; L.new(m1.outputs[0], m2.inputs[0]); L.new(night.outputs['Result'], m2.inputs[1])
        m3 = nt.nodes.new('ShaderNodeMath'); m3.operation = 'MULTIPLY'; m3.inputs[1].default_value = 6; L.new(m2.outputs[0], m3.inputs[0])
        # 自己算太陽照到的亮度(星球很遠,不讓船的影子投上去):顏色 × 受光 + 海面一點反光 + 夜面城市燈
        lam = nt.nodes.new('ShaderNodeMapRange'); lam.inputs['From Min'].default_value = -.08; lam.inputs['From Max'].default_value = .9; L.new(dot.outputs['Value'], lam.inputs['Value'])
        lit = nt.nodes.new('ShaderNodeMix'); lit.data_type = 'RGBA'; lit.blend_type = 'MULTIPLY'; lit.inputs['Factor'].default_value = 1
        L.new(mx.outputs[2], lit.inputs[6]); cmb = nt.nodes.new('ShaderNodeCombineColor'); L.new(lam.outputs['Result'], cmb.inputs[0]); L.new(lam.outputs['Result'], cmb.inputs[1]); L.new(lam.outputs['Result'], cmb.inputs[2]); L.new(cmb.outputs[0], lit.inputs[7])
        cityc = nt.nodes.new('ShaderNodeMix'); cityc.data_type = 'RGBA'; cityc.blend_type = 'ADD'; L.new(m2.outputs[0], cityc.inputs['Factor']); L.new(lit.outputs[2], cityc.inputs[6]); cityc.inputs[7].default_value = srgb('#ffb45c')
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.15; L.new(cityc.outputs[2], em.inputs['Color'])
        out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]; L.new(em.outputs[0], out.inputs['Surface'])
        # 雲層
        c = bpy.data.materials.new('planet_clouds'); c.use_nodes = True; nt = c.node_tree; L = nt.links; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); cl = nt.nodes.new('ShaderNodeEmission')
        geo = nt.nodes.new('ShaderNodeNewGeometry'); dt = nt.nodes.new('ShaderNodeVectorMath'); dt.operation = 'DOT_PRODUCT'; L.new(geo.outputs['Normal'], dt.inputs[0]); dt.inputs[1].default_value = SUN_DIR
        lc = nt.nodes.new('ShaderNodeMapRange'); lc.inputs['From Min'].default_value = -.1; lc.inputs['From Max'].default_value = .8; lc.inputs['To Max'].default_value = 1.25; L.new(dt.outputs['Value'], lc.inputs['Value']); L.new(lc.outputs['Result'], cl.inputs['Strength'])
        tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); L.new(tc.outputs['Object'], nz.inputs['Vector']); nz.inputs['Scale'].default_value = .011; nz.inputs['Detail'].default_value = 15; nz.inputs['Roughness'].default_value = .62; nz.inputs['Distortion'].default_value = .55
        cr = nt.nodes.new('ShaderNodeMapRange'); cr.inputs['From Min'].default_value = .53; cr.inputs['From Max'].default_value = .6; L.new(nz.outputs['Fac'], cr.inputs['Value'])
        mix = nt.nodes.new('ShaderNodeMixShader'); L.new(cr.outputs['Result'], mix.inputs['Fac']); L.new(tr.outputs[0], mix.inputs[1]); L.new(cl.outputs[0], mix.inputs[2]); L.new(mix.outputs[0], out.inputs['Surface'])
        # 大氣光暈:邊緣藍光(只在亮面那一側亮)
        a = bpy.data.materials.new('planet_atmo'); a.use_nodes = True; nt = a.node_tree; L = nt.links; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = srgb('#6fb0ff')
        lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .35
        pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 2.2; L.new(lw.outputs['Facing'], pw.inputs[0])
        geo = nt.nodes.new('ShaderNodeNewGeometry'); dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; L.new(geo.outputs['Normal'], dot.inputs[0]); dot.inputs[1].default_value = SUN_DIR
        day = nt.nodes.new('ShaderNodeMapRange'); day.inputs['From Min'].default_value = -.35; day.inputs['From Max'].default_value = .3; day.inputs['To Min'].default_value = .04; L.new(dot.outputs['Value'], day.inputs['Value'])
        k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; L.new(pw.outputs[0], k.inputs[0]); L.new(day.outputs['Result'], k.inputs[1])
        st = nt.nodes.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = 4.0; L.new(k.outputs[0], st.inputs[0]); L.new(st.outputs[0], em.inputs['Strength'])
        add = nt.nodes.new('ShaderNodeAddShader'); L.new(tr.outputs[0], add.inputs[0]); L.new(em.outputs[0], add.inputs[1]); L.new(add.outputs[0], out.inputs['Surface'])
        return m, c, a
    def sphere(name, r, loc, m, seg=256):
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
        o = obj(name, bm, m); o.location = loc; return o
    R = 520
    cd = bpy.data.cameras.new('c'); cd.lens = 35; cd.clip_end = 6000; cam = bpy.data.objects.new('c', cd); scene.collection.objects.link(cam); scene.camera = cam
    view = ARGS[3] if len(ARGS) > 3 else 'hero'
    eye, look = {'cine': ((46, 54, 16), (2, -6, 4)), 'detail': ((26, -2, 16), (2, -14, 2)), 'hero': ((62, 58, 40), (0, -4, 0)), 'side': ((90, 4, 14), (0, -2, 2)), 'top': ((10, -6, 110), (0, -6, 0)), 'back': ((-55, -75, 35), (0, -10, 2))}[view]
    cam.location = eye; cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y')
    if '--noplanet' not in sys.argv:                                            # 星球擺在鏡頭看過去的後方、偏下:船浮在星球上空,地平線弧線橫過畫面下半
        fwd = (Vector(look) - Vector(eye)).normalized(); right = fwd.cross(Vector((0, 0, 1))).normalized()
        pc = Vector(look) + fwd * 780 - Vector((0, 0, 1)) * 470 + right * 120
        ms, mc, ma = planet_mats()
        for nm, rr, mm in (('planet', R, ms), ('planet_clouds', R * 1.006, mc), ('planet_atmo', R * 1.035, ma)):
            o_ = sphere(nm, rr, pc, mm); o_.rotation_euler = (math.radians(72), math.radians(15), math.radians(-30))
        cd.clip_end = 6000
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for dv in prefs.devices: dv.use = True
    scene.cycles.device = 'GPU'; scene.cycles.samples = int(ARGS[2]) if len(ARGS) > 2 else 96; scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
    try:                                                                        # bloom(Blender 5 的合成節點群組)
        tree = bpy.data.node_groups.new('comp', 'CompositorNodeTree'); scene.compositing_node_group = tree
        tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        rl = tree.nodes.new('CompositorNodeRLayers'); gl = tree.nodes.new('CompositorNodeGlare'); go = tree.nodes.new('NodeGroupOutput')
        for nm, v in (('Type', 'Bloom'), ('Quality', 'High'), ('Threshold', 1.0), ('Strength', .55), ('Size', .55)):
            if nm in gl.inputs: gl.inputs[nm].default_value = v
        tree.links.new(rl.outputs['Image'], gl.inputs['Image']); tree.links.new(gl.outputs['Image'], go.inputs[0])
    except Exception as e: print('no bloom', e)
    scene.render.filepath = out; bpy.ops.render.render(write_still=True)
    print('rendered', out)
