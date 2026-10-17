# 首頁外觀的星際戰艦(使用者參考圖:白色流線艦身 + 中央玻璃穹頂花園 + 貫穿的高塔 + 環繞的弧形環臂 + 艦首大環):
#   座標:Blender +Y = 艦首(匯出 glTF 後 = 網頁的 -Z)、+Z = 上。單位跟網頁一樣。
#   機庫口在艦身兩側 x = ±6.6、y = -9 ~ 3(網頁 z = -3 ~ 9),這一段側面保持平的,機庫門 / 發光框 / 點擊範圍仍由網頁 exterior.mjs 蓋。
#   環臂只繞在艦尾那半圈(y < -12),不擋鏡頭飛進機庫的路線。
# 用法:blender -b --python tools/blender/ship_build.py -- [preview out.png samples hero|side|top|back] [export out.glb]
import bpy, bmesh, sys, os, math, random
from mathutils import Vector, Matrix

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
def plated(name, color, rough, metal, coat=.35, scale=.42, seam=.85):
    """白色裝甲板:長方形板塊(接縫壓暗 + 凹凸、每塊深淺不同)+ 角落縫隙的髒污(AO)+ 板邊微亮(Bevel)"""
    m = mat(name, color, rough, metal, coat=coat); nt = m.node_tree; p = nt.nodes['Principled BSDF']; L = nt.links
    col, fac = tri_brick(nt, scale, 2.4, .8, (1 - seam * .7,) * 3 + (1,), .017, c1=(.8, .8, .8, 1))
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
    mul.inputs[6].default_value = srgb(color); L.new(col, mul.inputs[7])
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 1.2; ao.samples = 16
    grime = nt.nodes.new('ShaderNodeMapRange'); grime.inputs['To Min'].default_value = .42; L.new(ao.outputs['AO'], grime.inputs['Value'])
    mul2 = nt.nodes.new('ShaderNodeMix'); mul2.data_type = 'RGBA'; mul2.blend_type = 'MULTIPLY'; mul2.inputs['Factor'].default_value = 1
    L.new(mul.outputs[2], mul2.inputs[6]); L.new(grime.outputs['Result'], mul2.inputs[7])
    bev = nt.nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = .05; geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; L.new(bev.outputs['Normal'], dot.inputs[0]); L.new(geo.outputs['Normal'], dot.inputs[1])
    edge = nt.nodes.new('ShaderNodeMapRange'); edge.inputs['From Min'].default_value = .985; edge.inputs['From Max'].default_value = 1; edge.inputs['To Min'].default_value = 1; edge.inputs['To Max'].default_value = 0
    L.new(dot.outputs['Value'], edge.inputs['Value'])
    lit = nt.nodes.new('ShaderNodeMix'); lit.data_type = 'RGBA'; lit.blend_type = 'SCREEN'
    em = nt.nodes.new('ShaderNodeMath'); em.operation = 'MULTIPLY'; em.inputs[1].default_value = .35; L.new(edge.outputs['Result'], em.inputs[0]); L.new(em.outputs[0], lit.inputs['Factor'])
    L.new(mul2.outputs[2], lit.inputs[6]); lit.inputs[7].default_value = (1, 1, 1, 1); L.new(lit.outputs[2], p.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .75; bump.inputs['Distance'].default_value = .02; bump.invert = True
    L.new(fac, bump.inputs['Height']); L.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m
def facade(name, arc_u=False):
    """深色玻璃立面 + 一格格房間窗(烘成貼圖):每格有金屬窗框、有的有中柱;裡面上亮下暗、四周有窗洞陰影、天花燈;
    每間亮度(全暗 / 半亮 / 亮)與色溫(暖黃 / 中性 / 螢幕冷藍)不同,有的拉了半截百葉、有的有人或家具剪影。
    發光強度最多 1(烘成 8 位元貼圖才不會爆白),亮度在網頁上調;arc_u = 環臂(沿圓弧量距離),否則沿艦身 y"""
    m = mat(name, '#0b0f15', .1, .3, coat=1.0); nt = m.node_tree; p = nt.nodes['Principled BSDF']; L = nt.links
    def node(t, **kw):
        n = nt.nodes.new(t)
        for k, v in kw.items(): setattr(n, k, v)
        return n
    def M(op, a, b=None, clamp=False):
        n = node('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: L.new(v, n.inputs[i])
        return n.outputs[0]
    tc = node('ShaderNodeTexCoord'); sep = node('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs['Vector'])
    if arc_u:
        dx, dy = M('SUBTRACT', sep.outputs['X'], HX), M('SUBTRACT', sep.outputs['Y'], HY)
        u = M('MULTIPLY', M('ARCTAN2', dy, dx), M('SQRT', M('ADD', M('MULTIPLY', dx, dx), M('MULTIPLY', dy, dy))))
    else: u = sep.outputs['Y']
    W, H = .5, .36                                                              # 一格窗(寬、高)
    row = M('FLOOR', M('DIVIDE', sep.outputs['Z'], H)); fv = M('FRACT', M('DIVIDE', sep.outputs['Z'], H))
    uu = M('ADD', M('DIVIDE', u, W), M('MULTIPLY', row, .5)); col = M('FLOOR', uu); fu = M('FRACT', uu)
    side = M('GREATER_THAN', sep.outputs['X'], 0)
    def wn(off):                                                                # 每格一個固定亂數
        cb = node('ShaderNodeCombineXYZ'); L.new(col, cb.inputs['X']); L.new(row, cb.inputs['Y']); L.new(M('ADD', side, off), cb.inputs['Z'])
        n = node('ShaderNodeTexWhiteNoise', noise_dimensions='3D'); L.new(cb.outputs[0], n.inputs['Vector']); return n.outputs['Value']
    inside = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', fu, .07), M('LESS_THAN', fu, .93)), M('MULTIPLY', M('GREATER_THAN', fv, .12), M('LESS_THAN', fv, .88)))
    gu = M('DIVIDE', M('SUBTRACT', fu, .07), .86); gv = M('DIVIDE', M('SUBTRACT', fv, .12), .76)   # 玻璃裡面的 0~1 座標
    mull = M('MULTIPLY', M('GREATER_THAN', wn(1.3), .5), M('LESS_THAN', M('ABSOLUTE', M('SUBTRACT', gu, .5)), .025))   # 有的窗有中柱
    glass = M('MULTIPLY', inside, M('SUBTRACT', 1, mull))
    r0 = wn(0)                                                                  # 亮度:兩成全暗、三成半亮、五成亮(亮的也有深淺)
    lvl = M('ADD', M('ADD', .03, M('MULTIPLY', M('GREATER_THAN', r0, .22), .27)), M('MULTIPLY', M('GREATER_THAN', r0, .5), M('ADD', .3, M('MULTIPLY', r0, .4))))
    grad = M('ADD', .42, M('MULTIPLY', gv, .58))                                # 上亮下暗
    ceil = M('ADD', 1, M('MULTIPLY', M('GREATER_THAN', gv, .86), .35))          # 天花燈那一條再亮一點
    eu = M('MULTIPLY', M('MINIMUM', gu, M('SUBTRACT', 1, gu)), 6, clamp=True); ev = M('MULTIPLY', M('MINIMUM', gv, M('SUBTRACT', 1, gv)), 5, clamp=True)
    vign = M('ADD', .4, M('MULTIPLY', M('MULTIPLY', eu, ev), .6))               # 窗洞四周的陰影(看起來有深度)
    bl = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', wn(5.1), .72), M('GREATER_THAN', gv, M('SUBTRACT', 1, M('MULTIPLY', wn(6.2), .75)))), M('LESS_THAN', M('FRACT', M('MULTIPLY', gv, 5)), .55))
    blinds = M('SUBTRACT', 1, M('MULTIPLY', bl, .72))                           # 拉了一半的百葉
    sx = M('ADD', .08, M('MULTIPLY', wn(9.4), .6))
    sl = M('MULTIPLY', M('MULTIPLY', M('GREATER_THAN', wn(8.7), .58), M('LESS_THAN', gv, M('ADD', .32, M('MULTIPLY', wn(10.5), .25)))), M('MULTIPLY', M('GREATER_THAN', gu, sx), M('LESS_THAN', gu, M('ADD', sx, .2))))
    sil = M('SUBTRACT', 1, M('MULTIPLY', sl, .9))                               # 人 / 家具剪影
    k = M('MULTIPLY', M('MULTIPLY', M('MULTIPLY', glass, lvl), M('MULTIPLY', grad, ceil)), M('MULTIPLY', M('MULTIPLY', vign, blinds), sil))
    k = M('MINIMUM', k, 1)
    t_ = wn(11.9); c1 = node('ShaderNodeMix', data_type='RGBA'); L.new(M('GREATER_THAN', t_, .55), c1.inputs['Factor']); c1.inputs[6].default_value = srgb('#ffbf78'); c1.inputs[7].default_value = srgb('#ffe7c6')
    c2 = node('ShaderNodeMix', data_type='RGBA'); L.new(M('GREATER_THAN', t_, .86), c2.inputs['Factor']); L.new(c1.outputs[2], c2.inputs[6]); c2.inputs[7].default_value = srgb('#bcd3ff')   # 暖黃 / 中性 / 螢幕冷藍
    L.new(c2.outputs[2], p.inputs['Emission Color']); L.new(k, p.inputs['Emission Strength'])
    fr = node('ShaderNodeMix', data_type='RGBA'); L.new(M('SUBTRACT', 1, glass), fr.inputs['Factor']); fr.inputs[6].default_value = srgb('#0b0f15'); fr.inputs[7].default_value = srgb('#737b86')   # 窗框:灰色金屬
    L.new(fr.outputs[2], p.inputs['Base Color'])
    return m
M_HULL = plated('ship_white', '#ecebe7', .26, .2, coat=.45)
M_HULL2 = plated('ship_pearl', '#cfd3da', .32, .45, coat=.25, scale=.6)
M_FACADE = facade('ship_facade')
M_DARK = mat('ship_dark', '#2f343d', .5, .5)
M_WIN = mat('ship_window', '#000000', 1, emit='#ffd49a', k=7)
M_WIN_DIM = mat('ship_window_dim', '#000000', 1, emit='#ffc98a', k=2.6)        # 窗帶分段:有的區段只開一半的燈
M_WIN_DARK = mat('ship_window_dark', '#000000', 1, emit='#c98a50', k=.7)       # 有的區段幾乎沒開燈
def win_mat(): return rng.choices((M_WIN, M_WIN_DIM, M_WIN_DARK), (.4, .4, .2))[0]
GAL = {}
def gallery(zc, hgt, lv):
    """環臂長廊窗(烘成發光貼圖):從外面看得到裡面 —— 上緣一條天花燈、暖色牆(一間間亮度不同)、下面深色的地板和家具 / 人影、每隔一段一根深色窗框;lv = 0 亮、1 半亮、2 暗"""
    key = (round(zc, 3), round(hgt, 3), lv)
    if key in GAL: return GAL[key]
    m = mat(f'ship_gallery_{len(GAL)}', '#000000', 1); nt = m.node_tree; p = nt.nodes['Principled BSDF']; L = nt.links
    def node(t, **kw):
        n = nt.nodes.new(t)
        for k, v in kw.items(): setattr(n, k, v)
        return n
    def math_(op, a, b=None):
        n = node('ShaderNodeMath', operation=op)
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: L.new(v, n.inputs[i])
        return n.outputs[0]
    tc = node('ShaderNodeTexCoord'); sep = node('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs['Vector'])
    t = math_('DIVIDE', math_('SUBTRACT', sep.outputs['Z'], zc - hgt / 2), hgt)                       # 0 = 窗下緣、1 = 上緣
    ang = math_('ARCTAN2', math_('SUBTRACT', sep.outputs['Y'], HY), math_('SUBTRACT', sep.outputs['X'], HX))
    rad = node('ShaderNodeVectorMath', operation='LENGTH'); cmb = node('ShaderNodeCombineXYZ'); L.new(math_('SUBTRACT', sep.outputs['X'], HX), cmb.inputs['X']); L.new(math_('SUBTRACT', sep.outputs['Y'], HY), cmb.inputs['Y']); L.new(cmb.outputs[0], rad.inputs[0])
    u = math_('MULTIPLY', ang, rad.outputs['Value'])                                                  # 沿著環臂的距離
    mull = math_('GREATER_THAN', math_('FRACT', math_('DIVIDE', u, .9)), .07)                          # 窗框:每 .9 一根
    room = node('ShaderNodeTexNoise'); room.inputs['Scale'].default_value = 1.0; cr = node('ShaderNodeCombineXYZ'); L.new(math_('FLOOR', math_('DIVIDE', u, 2.7)), cr.inputs['X']); L.new(cr.outputs[0], room.inputs['Vector'])
    wall = node('ShaderNodeMapRange'); L.new(room.outputs['Fac'], wall.inputs['Value']); wall.inputs['From Min'].default_value = .3; wall.inputs['From Max'].default_value = .7; wall.inputs['To Min'].default_value = .16; wall.inputs['To Max'].default_value = .5   # 一間間牆的亮度不同
    ceil = math_('MULTIPLY', math_('GREATER_THAN', t, .84), math_('LESS_THAN', t, .95))                  # 天花燈帶
    floor_ = math_('LESS_THAN', t, .2)
    cu = math_('MULTIPLY', u, 2.8); cell = math_('FLOOR', cu); fu = math_('FRACT', cu)                # 每 .36 一格:隨機放一個人 / 植物 / 沙發的剪影(矩形)
    def wn(off):
        n = node('ShaderNodeTexWhiteNoise', noise_dimensions='1D'); L.new(math_('ADD', cell, off), n.inputs['W']); return n.outputs['Value']
    blob = math_('MULTIPLY', math_('GREATER_THAN', wn(0), .66), math_('LESS_THAN', t, math_('ADD', .26, math_('MULTIPLY', wn(7.3), .32))))
    blob = math_('MULTIPLY', blob, math_('MULTIPLY', math_('GREATER_THAN', fu, .2), math_('LESS_THAN', fu, math_('ADD', .5, math_('MULTIPLY', wn(3.1), .35)))))
    k = math_('MULTIPLY', wall.outputs['Result'], math_('SUBTRACT', 1, math_('MAXIMUM', floor_, blob)))
    k = math_('MAXIMUM', math_('ADD', k, math_('MULTIPLY', floor_, .04)), ceil)
    k = math_('MULTIPLY', math_('MULTIPLY', k, mull), (1.0, .45, .12)[lv])
    col = node('ShaderNodeMix', data_type='RGBA'); L.new(ceil, col.inputs['Factor']); col.inputs[6].default_value = srgb('#ffc58a'); col.inputs[7].default_value = srgb('#fff3df')
    L.new(col.outputs[2], p.inputs['Emission Color']); L.new(k, p.inputs['Emission Strength'])
    GAL[key] = m; return m
M_GOLD = mat('ship_goldglow', '#000000', 1, emit='#ffbe63', k=12)
M_BLUE = mat('ship_blueglow', '#000000', 1, emit='#7cc8ff', k=8)
M_GLASS = mat('ship_glass', '#dcecff', .03, 0, trans=1.0)
M_VAULT = mat('ship_vault', '#cfe6ff', .04, 0, trans=1.0)                  # 環臂花園的薄玻璃拱頂(網頁上比穹頂看得清楚一點)
M_LAWN = mat('ship_lawn', '#4a7236', .95)
M_TREE = mat('ship_tree', '#3b6a33', .85)
M_TREE2 = mat('ship_tree2', '#557f3a', .85)
M_METAL = mat('ship_metal', '#b9bcc2', .25, 1.0)
M_LOUNGE = mat('ship_lounge', '#000000', 1, emit='#ffd9b0', k=2.2)            # 觀景窗裡面的暖光內牆(亮 / 半亮 / 暗三種,一格一格不一樣)
M_LOUNGE2 = mat('ship_lounge_dim', '#000000', 1, emit='#ffcf9c', k=1.0)
M_LOUNGE3 = mat('ship_lounge_dark', '#000000', 1, emit='#b98a62', k=.3)
M_VIEWGLASS = mat('ship_viewglass', '#dcecff', .03, 0, trans=1.0)             # 觀景窗玻璃(網頁上反光壓低,看得到裡面)
M_WOODFLOOR = mat('ship_woodfloor', '#8a5a3a', .6)
M_LED = mat('ship_led', '#000000', 1, emit='#ffdcb0', k=9)                     # 燈具的發光面(暖白)
M_LEDC = mat('ship_ledcool', '#000000', 1, emit='#dce8ff', k=6)                # 冷白細燈線
FIXTURES = []                                                                   # 燈具位置 (x, y, z, 顏色, 瓦數, 半徑):匯出時在這裡放點光源,烘「燈打在船殼上」的光照貼圖(光暈、漸層)
def fixture(x, y, z, col, w, r=.2): FIXTURES.append((x, y, z, col, w, r))

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
def arc(name, cx, cy, R, wr, h, zc, a0, a1, m, taper=0.0, seg=160, bevel=.1, lean=0.0, ends=None):
    """以 (cx, cy) 為圓心的一段實心弧(斷面:徑向寬 wr、高 h);taper = 兩端多少度內逐漸收尖"""
    bm = bmesh.new(); rings = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg
        k = 1.0
        if taper:
            e0, e1 = ends or (a0, a1); d = min(a - e0, e1 - a) / math.radians(taper)
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
def lathe(name, cx, cz, prof, m, seg=48, cap0=False, cap1=False):
    """繞 Y 軸旋轉的曲面(軸心在 x = cx、z = cz):prof = [(y, 半徑)],往 -y 走法線朝外、往 +y 走法線朝內"""
    bm = bmesh.new(); rings = [[bm.verts.new((cx + r * math.cos(t), y, cz + r * math.sin(t))) for t in [math.tau * i / seg for i in range(seg)]] for y, r in prof]
    for A, B in zip(rings, rings[1:]):
        for k in range(seg): bm.faces.new((A[k], A[(k + 1) % seg], B[(k + 1) % seg], B[k]))
    if cap0: bm.faces.new(rings[0])
    if cap1: bm.faces.new(rings[-1][::-1])
    return obj(name, bm, m)
def strut(name, p, q, r, m):
    """兩點之間的圓桿"""
    p, q = Vector(p), Vector(q); d = q - p
    o = cyl(name, r, d.length, tuple((p + q) / 2), m, verts=12); o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y'); return o
def sec_at(secs, y):
    """loft 斷面在 y 處的內插值 (寬, 高, 中心 z, 切角)"""
    for a, b in zip(secs, secs[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0]); return tuple(a[i] + (b[i] - a[i]) * t for i in range(1, 5))
    return None
def armor(tag, secs, faces, y0, y1, step, gap, d=.07, th=.06, inset=.12, ms=(None,)):
    """裝甲分層:沿 loft 的某幾個斜面 / 側面貼一片片稍微浮起的板(板跟板中間留縫),底下再墊一層深灰,縫看起來就是凹下去的深溝"""
    for f in faces:
        def edge(y, dd, ins):
            w, h, zc, c = sec_at(secs, y); P = octa(w, h, c); (px, pz), (qx, qz) = P[f], P[(f + 1) % 8]
            ex, ez = qx - px, qz - pz; L = math.hypot(ex, ez) or 1; nx, nz = ez / L, -ex / L; ins = min(ins, L * .3)
            return ((px + ex / L * ins + nx * dd, y, zc + pz + ez / L * ins + nz * dd), (qx - ex / L * ins + nx * dd, y, zc + qz - ez / L * ins + nz * dd))
        bm = bmesh.new(); ys = [y0 + (y1 - y0) * i / 30 for i in range(31)]; rows = [[bm.verts.new(v) for v in edge(y, .025, 0)] for y in ys]
        for A, B in zip(rows, rows[1:]): bm.faces.new((A[0], B[0], B[1], A[1]))
        obj(f'trench_{tag}_{f}', bm, M_DARK, smooth=False)
        y, k = y0, 0
        while y < y1 - .6:
            ya, yb = y, min(y + step * rng.uniform(.75, 1.25), y1); bm = bmesh.new()
            rows = [[bm.verts.new(v) for v in edge(ya + (yb - gap - ya) * i / 6, d, inset)] for i in range(7)]
            for A, B in zip(rows, rows[1:]): bm.faces.new((A[0], B[0], B[1], A[1]))
            o = obj(f'armor_{tag}_{f}_{k}', bm, ms[k % len(ms)] or M_HULL, smooth=False)
            sd = o.modifiers.new('solid', 'SOLIDIFY'); sd.thickness = th; sd.offset = -1
            bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = .02; bv.segments = 1
            y, k = yb, k + 1

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
# 裝甲分層:主艦身上下四道斜面、艦首兩側和頂面、兩層甲板的斜面,一片片浮起的板 + 板縫下的深灰凹槽
armor('hull', HULL, (3, 5, 1, 7), -25.6, 40.2, 3.4, .22, ms=(M_HULL, M_HULL, M_HULL2))
armor('bow', HULL, (2, 6, 4), 30.5, 40.4, 2.6, .2)
D1 = [(-24, 9.4, 1.2, 3.4, .5), (6, 10.4, 1.2, 3.4, .5), (20, 7.2, 1.0, 3.3, .45), (33, 2.6, .7, 3.0, .3), (37, .3, .2, 2.8, .1)]
armor('deck1', D1, (3, 5), -23.6, 35.5, 2.8, .18, d=.05, th=.05, inset=.05)
for s_ in (-1, 1):                                                              # 艦首兩側的深色進氣凹槽(裡面幾片橫向百葉)
    for k, y in enumerate((32.2, 34.6)):
        hw = hull_half_width(y, -.2)
        box(f'bow_intake_{s_}_{k}', (.05, 1.7, .62), (s_ * (hw + .06), y, -.2), M_DARK)
        for q in range(4): box(f'bow_louver_{s_}_{k}_{q}', (.06, 1.5, .05), (s_ * (hw + .1), y, -.44 + q * .16), M_HULL2)

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
# 頂部燈光分三層:圓盤外緣的金色燈槽(一段段燈珠 + 往外打的洗牆燈)、上一階的冷白細燈線、穹頂底部往上打的投光燈
arc('hub_rim_channel', HX, HY, 10.24, .08, .34, HZ + .92, 0, math.tau, M_DARK, seg=200, bevel=0)          # 深色燈槽
for k in range(20):
    a0_ = math.radians(k * 18 + 1.6); a1_ = math.radians(k * 18 + 16.4)                                   # 兩片放射鰭之間一格
    for j, (u0, u1) in enumerate(((0, .46), (.54, 1))):
        arc(f'hub_rim_led_{k}_{j}', HX, HY, 10.3, .04, .09, HZ + 1.0, a0_ + (a1_ - a0_) * u0, a0_ + (a1_ - a0_) * u1, M_GOLD, seg=6, bevel=0)
    am = math.radians(k * 18 + 9); ca, sa = math.cos(am), math.sin(am)
    box(f'hub_wash_{k}', (.22, .5, .16), (HX + ca * 10.32, HY + sa * 10.32, HZ + .5), M_DARK, rot=(0, 0, am), bevel=.03)   # 洗牆燈座
    box(f'hub_wash_lens_{k}', (.03, .4, .07), (HX + ca * 10.44, HY + sa * 10.44, HZ + .5), M_LED, rot=(0, 0, am))
    fixture(HX + ca * 10.9, HY + sa * 10.9, HZ + .75, '#ffc26a', 90, .3)
for k in range(30):                                                             # 上一階外緣:冷白細燈線(一段段)
    a_ = math.radians(k * 12)
    arc(f'hub_step_line_{k}', HX, HY, 8.62, .03, .05, HZ + 1.95, a_ + .012, a_ + math.radians(12) - .012, M_LEDC, seg=6, bevel=0)
arc('hub_cove', HX, HY, 7.15, .35, .3, HZ + 2.35, 0, math.tau, M_HULL2, seg=200, bevel=.04)                 # 穹頂底下一圈燈槽的外唇
arc('hub_cove_slot', HX, HY, 6.93, .06, .04, HZ + 2.47, 0, math.tau, M_LED, seg=200, bevel=0)               # 藏在唇內往上打的燈條(從上面看是一道細光)
for k in range(16):                                                             # 穹頂投光燈:燈座 + 鏡片朝上,照亮穹頂肋和玻璃底部
    a_ = math.radians(k * 22.5 + 11.25); x_, y_ = HX + math.cos(a_) * 7.55, HY + math.sin(a_) * 7.55
    cyl(f'dome_uplight_{k}', .16, .16, (x_, y_, HZ + 2.3), M_DARK, verts=16, bevel=.02)
    cyl(f'dome_uplight_lens_{k}', .11, .02, (x_, y_, HZ + 2.39), M_LED, verts=16)
    fixture(x_ - math.cos(a_) * .3, y_ - math.sin(a_) * .3, HZ + 2.75, '#ffd7a8', 45, .15)
cyl('garden_lawn', 6.6, .25, (HX, HY, HZ + 2.3), M_LAWN, verts=96)
DOME_R, DOME_H = 6.8, 6.8 * .62
def dome_top(r): return HZ + 2.2 + DOME_H * math.sqrt(max(0, 1 - (r / DOME_R) ** 2))   # 穹頂在半徑 r 處的玻璃高度
for i in range(46):                                                             # 穹頂裡的樹(樹幹 + 兩三團樹冠):每棵都整個在玻璃裡面
    a, r_ = rng.uniform(0, math.tau), 5.4 * math.sqrt(rng.random())
    if r_ < 1.9: continue                                                       # 中間留給高塔
    x, y = HX + math.cos(a) * r_, HY + math.sin(a) * r_
    cr = rng.uniform(.45, .8) * (1 - .3 * r_ / 5.4); room = dome_top(r_ + cr + .3) - (HZ + 2.4) - .3   # 樹冠外緣那一圈的玻璃高度,再留 .3
    hgt = min(rng.uniform(.8, 2.0) * (1 - .35 * r_ / 6), room - cr * 1.25)
    if hgt < .35: continue
    cyl(f'trunk_{i}', .07, hgt, (x, y, HZ + 2.4 + hgt / 2), mat('trunk', '#5a4330', .9), verts=6)
    for j in range(rng.randint(2, 3)):
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=cr)
        for v in bm.verts: v.co *= rng.uniform(.85, 1.1)
        o = obj(f'canopy_{i}_{j}', bm, rng.choice((M_TREE, M_TREE2))); o.location = (x + rng.uniform(-.25, .25), y + rng.uniform(-.25, .25), HZ + 2.4 + hgt + rng.uniform(-.15, .1)); o.scale = (1, 1, .8)
for i in range(14):
    a = rng.uniform(0, math.tau); r_ = rng.uniform(2.2, 6.0)
    x_, y_ = HX + math.cos(a) * r_, HY + math.sin(a) * r_                       # 花園路燈:細燈桿 + 燈罩 + 小燈球
    cyl(f'garden_lamp_post_{i}', .03, .55, (x_, y_, HZ + 2.68), M_DARK, verts=8)
    cyl(f'garden_lamp_hood_{i}', .12, .05, (x_, y_, HZ + 2.98), M_DARK, verts=12)
    bm_ = bmesh.new(); bmesh.ops.create_icosphere(bm_, subdivisions=1, radius=.07); o_ = obj(f'garden_lamp_{i}', bm_, M_LED); o_.location = (x_, y_, HZ + 2.92)
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
def spire_hw(z): return (4.4 + (1.8 - 4.4) * (z - HZ) / (30 - HZ)) / 2          # 上塔在高度 z 的半寬(往上收)
z = 6.0                                                                         # 塔身窗:一層一層(每層亮度不同,有的樓層沒開燈),貼著往上收的塔面
while z < 29.2:
    if all(abs(z - zd) > .55 for zd in (12, 20, 27)):
        hw = spire_hw(z); lv = win_mat()
        for sx in (-1, 1):
            box(f'spire_win_{sx + 1}_{z:.1f}'.replace('.', 'p'), (.05, .32, .5), (HX + sx * (hw + .015), HY, z), lv)
            box(f'spire_win2_{sx + 1}_{z:.1f}'.replace('.', 'p'), (.32, .05, .5), (HX, HY + sx * (hw * .8 + .015), z), lv)
    z += .85
for z in (12, 20, 27):                                                          # 塔上的環形平台
    cyl(f'spire_deck_{z}', 2.6 - z * .03, .35, (HX, HY, z), M_HULL2, verts=48, bevel=.08)
    rd = 2.6 - z * .03                                                          # 平台外緣:一段段冷白燈 + 底下幾盞往下照的崁燈
    for k in range(12): arc(f'spire_deck_led_{z}_{k}', HX, HY, rd + .01, .03, .05, z + .02, math.radians(k * 30 + 3), math.radians(k * 30 + 27), M_LEDC, seg=6, bevel=0)
    for k in range(6):
        a_ = math.radians(k * 60 + 30); x_, y_ = HX + math.cos(a_) * (rd - .35), HY + math.sin(a_) * (rd - .35)
        cyl(f'spire_downlight_{z}_{k}', .1, .02, (x_, y_, z - .185), M_LED, verts=12)
        fixture(x_ + math.cos(a_) * .15, y_ + math.sin(a_) * .15, z - .5, '#e4eeff', 22, .1)

# ================= 5) 環臂:兩道弧形環繞艦尾那半圈(兩端收尖)+ 屋頂花園 + 窗帶 + 連接臂 =================
VIEW = (math.radians(248), math.radians(292))                                   # 外環臂最後面的觀景窗範圍
def in_view(a, tag, pad=0.0): return tag == 'outer' and VIEW[0] - pad <= ((a - math.radians(160)) % math.tau) + math.radians(160) <= VIEW[1] + pad
M_FACADE_ARC = facade('ship_facade_arc', arc_u=True)                          # 環臂用的立面窗(沿圓弧排,要等 HX / HY 定好)
def ring_arm(tag, R, wr, h, zc, a0, a1):
    a0, a1 = math.radians(a0), math.radians(a1)
    if tag == 'outer':                                                          # 分三段蓋:觀景窗那段外殼往內退,上下留窗台 / 窗楣
        v0, v1 = VIEW[0] + math.tau * (VIEW[0] < a0), VIEW[1] + math.tau * (VIEW[1] < a0); DEP, wb, wt = .6, -1.15, .95   # 退多深、窗的下緣 / 上緣(z)
        arc(f'arm_{tag}', HX, HY, R, wr, h, zc, a0, v0, M_HULL, taper=28, ends=(a0, a1))
        arc(f'arm_{tag}_b', HX, HY, R, wr, h, zc, v1, a1, M_HULL, taper=28, ends=(a0, a1))
        arc(f'arm_{tag}_core', HX, HY, R - DEP / 2, wr - DEP, h, zc, v0, v1, M_HULL, seg=60)
        ro = R + wr / 2 - DEP / 2
        arc(f'arm_{tag}_sill', HX, HY, ro, DEP, wb - (zc - h / 2), (zc - h / 2 + wb) / 2, v0, v1, M_HULL2, seg=60, bevel=.04)
        arc(f'arm_{tag}_header', HX, HY, ro, DEP, (zc + h / 2) - wt, (zc + h / 2 + wt) / 2, v0, v1, M_HULL2, seg=60, bevel=.04)
        rw = R + wr / 2 - DEP                                                   # 窗裡面:暖光的內牆 + 天花燈帶 + 地板
        NB = 14; bw = (v1 - v0) / NB                                           # 室內分 14 格(跟外面的窗框對齊):每格亮度不同,有柱子、天花板、下半截深色牆板、壁燈、門
        for b in range(NB):
            b0, b1 = v0 + b * bw, v0 + (b + 1) * bw; lv = rng.choices((0, 1, 2), (.45, .35, .2))[0]   # 0 = 亮、1 = 半亮、2 = 暗
            arc(f'arm_{tag}_lounge_wall_{b}', HX, HY, rw + .1, .04, wt - wb, (wt + wb) / 2, b0 + .004, b1 - .004, (M_LOUNGE, M_LOUNGE2, M_LOUNGE3)[lv], seg=6, bevel=0)   # 離後面的白殼 .1(貼太近白殼會蓋過來)
            arc(f'arm_{tag}_lounge_dado_{b}', HX, HY, rw + .15, .04, .42, wb + .21, b0, b1, M_DARK, seg=6, bevel=0)
            if lv < 2: arc(f'arm_{tag}_lounge_light_{b}', HX, HY, rw + .3, .16, .035, wt - .1, b0 + .01, b1 - .01, (M_WIN, M_WIN_DIM)[lv], seg=6, bevel=0)
            if rng.random() < .3:                                               # 往裡面走的門(深色門洞 + 門框)
                c_ = (b0 + b1) / 2; arc(f'arm_{tag}_lounge_door_{b}', HX, HY, rw + .14, .03, 1.05, wb + .55, c_ - .012, c_ + .012, M_DARK, seg=2, bevel=0)
                for e_ in (-1, 1): arc(f'arm_{tag}_lounge_jamb_{b}_{e_ + 1}', HX, HY, rw + .16, .05, 1.1, wb + .57, c_ + e_ * .013 - .0015, c_ + e_ * .013 + .0015, M_METAL, seg=1, bevel=0)
            elif lv < 2:
                for e_ in (-1, 1): c_ = (b0 + b1) / 2 + e_ * bw * .25; arc(f'arm_{tag}_lounge_sconce_{b}_{e_ + 1}', HX, HY, rw + .15, .04, .22, (wt + wb) / 2 + .15, c_ - .002, c_ + .002, M_WIN_DIM, seg=1, bevel=0)
            ca, sa = math.cos(b0), math.sin(b0)
            if b: box(f'arm_{tag}_lounge_pillar_{b}', (.3, .14, wt - wb), (HX + ca * (rw + .26), HY + sa * (rw + .26), (wt + wb) / 2), M_DARK, rot=(0, 0, b0), bevel=.02)
        arc(f'arm_{tag}_lounge_ceiling', HX, HY, rw + .3, .6, .05, wt - .04, v0 + .005, v1 - .005, M_DARK, seg=60, bevel=0)
        arc(f'arm_{tag}_lounge_floor', HX, HY, rw + .3, .58, .04, wb + .02, v0 + .01, v1 - .01, M_WOODFLOOR, seg=60, bevel=0)
        a = v0 + .03                                                            # 沙發 + 植物(從外面看是剪影)
        while a < v1 - .03:
            ca, sa = math.cos(a), math.sin(a)
            if rng.random() < .6: box(f'arm_{tag}_seat_{a:.2f}', (.3, .55, .22), (HX + ca * (rw + .2), HY + sa * (rw + .2), wb + .14), M_DARK, rot=(0, 0, a), bevel=.04)
            else:
                cyl(f'arm_{tag}_pot_{a:.2f}', .09, .2, (HX + ca * (rw + .2), HY + sa * (rw + .2), wb + .12), M_HULL2, verts=12)
                bm_ = bmesh.new(); bmesh.ops.create_icosphere(bm_, subdivisions=1, radius=.2); o_ = obj(f'arm_{tag}_plant_{a:.2f}', bm_, M_TREE); o_.location = (HX + ca * (rw + .2), HY + sa * (rw + .2), wb + .38)
            a += rng.uniform(.035, .06)
        arc(f'arm_{tag}_view_glass', HX, HY, R + wr / 2 - .04, .03, wt - wb, (wt + wb) / 2, v0, v1, M_VIEWGLASS, seg=90, bevel=0)   # 一整面玻璃
        a = v0
        while a <= v1 + 1e-6:                                                   # 窗框:直的細柱 + 上下兩條橫框
            arc(f'arm_{tag}_mullion_{a:.3f}'.replace('.', 'p'), HX, HY, R + wr / 2 - .02, .08, wt - wb, (wt + wb) / 2, a - .0035, a + .0035, M_HULL2, seg=1, bevel=0)
            a += (v1 - v0) / 14
        for z_ in (wb + .03, wt - .03): arc(f'arm_{tag}_transom_{z_:.2f}'.replace('.', 'p'), HX, HY, R + wr / 2 - .02, .09, .06, z_, v0, v1, M_HULL2, seg=60, bevel=0)
    else:
        arc(f'arm_{tag}', HX, HY, R, wr, h, zc, a0, a1, M_HULL, taper=28)
    arc(f'arm_{tag}_under', HX, HY, R - wr * .05, wr * .7, h * .4, zc - h * .55, a0 + .12, a1 - .12, M_HULL2, taper=20, bevel=.06)
    arc(f'arm_{tag}_garden', HX, HY, R - wr * .12, wr * .5, .18, zc + h / 2 + .05, a0 + .25, a1 - .25, M_LAWN, taper=10, bevel=0)
    for side, r_ in ((1, R + wr / 2 + .03), (-1, R - wr / 2 - .03)):           # 內外兩側:一長條發光的長廊窗帶(中間有支柱分隔)+ 下面一排小窗
        spans = [(a0 + .28, a1 - .28)] if not (tag == 'outer' and side == 1) else [(a0 + .28, VIEW[0] + math.tau * (VIEW[0] < a0) - .02), (VIEW[1] + math.tau * (VIEW[1] < a0) + .02, a1 - .28)]
        for k_, (s0, s1) in enumerate(spans): arc(f'arm_{tag}_facade_{side}_{k_}', HX, HY, r_ - side * .02, .05, h * .48, zc + h * .08, s0, s1, M_FACADE_ARC, seg=120, bevel=0)
        a = a0 + .3
        while a < a1 - .3:
            L = rng.uniform(.18, .4)
            if not (side == 1 and (in_view(a, tag, .02) or in_view(min(a + L, a1 - .3), tag, .02))): arc(f'arm_{tag}_gal_{side}_{a:.2f}', HX, HY, r_, .07, h * .32, zc + h * .08, a, min(a + L, a1 - .3), gallery(zc + h * .08, h * .32, rng.choices((0, 1, 2), (.4, .4, .2))[0]), seg=12, bevel=0)   # 每段亮度不同
            a += L + .025
        a = a0 + .35
        while a < a1 - .35:
            L = rng.uniform(.03, .08)
            if rng.random() < .7 and not (side == 1 and in_view(a, tag, .02)): arc(f'arm_{tag}_win_{side}_{a:.2f}', HX, HY, r_, .06, .14, zc - h * .3, a, a + L, win_mat(), seg=4, bevel=0)
            a += L + rng.uniform(.02, .05)
        for j, z_ in enumerate((zc - h * .43, zc + h * .38)):                   # 側面兩道深灰凹槽,把白色大面分成上下幾層
            for k_, (s0, s1) in enumerate(spans): arc(f'arm_{tag}_groove_{side}_{j}_{k_}', HX, HY, r_ - side * .01, .04, .07, z_, s0, s1, M_DARK, seg=120, bevel=0)
    a = a0 + .3                                                                # 結構肋:每隔幾度一圈稍微凸出的環箍
    while a < a1 - .3:
        if not in_view(a, tag, .01): arc(f'arm_{tag}_rib_{a:.2f}', HX, HY, R, wr * 1.06, h * 1.06, zc, a, a + .012, M_HULL2, seg=2, bevel=.03)
        a += .11
    n = int((a1 - a0) * R / 1.6)                                                # 屋頂花園的小樹(都在玻璃拱頂下面)
    gc, gw = R - wr * .12, wr * .25                                              # 花園中心半徑、半寬
    for i in range(n):
        if rng.random() < .55:
            a = rng.uniform(a0 + .4, a1 - .4); r_ = gc + rng.uniform(-gw, gw) * .7; cr = rng.uniform(.2, .32)
            bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=cr)
            for v in bm.verts: v.co *= rng.uniform(.85, 1.08)
            o = obj(f'arm_{tag}_tree_{i}', bm, rng.choice((M_TREE, M_TREE2))); o.location = (HX + math.cos(a) * r_, HY + math.sin(a) * r_, zc + h / 2 + .18 + cr * .8)
    # 玻璃拱頂:斷面是半個扁橢圓,沿著弧掃過去;兩端 6° 內收成圓頭;每隔一段一道細金屬肋
    va0, va1, vw, vh, top = a0 + .28, a1 - .28, gw + .4, .8, zc + h / 2 + .12
    def section(a, k):
        return [(gc + math.cos(t) * vw * k, top + math.sin(t) * vh * k) for t in [math.pi * q / 16 for q in range(17)]]
    bm = bmesh.new(); rings = []; segn = 180
    for i in range(segn + 1):
        a = va0 + (va1 - va0) * i / segn; d = min(a - va0, va1 - a) / math.radians(6); k = 1.0 if d >= 1 else max(.05, math.sin(d * math.pi / 2)) ** .5
        rings.append([bm.verts.new((HX + math.cos(a) * r, HY + math.sin(a) * r, z)) for r, z in section(a, k)])
    for A, B in zip(rings, rings[1:]):
        for q in range(16): bm.faces.new((A[q], A[q + 1], B[q + 1], B[q]))
    obj(f'arm_{tag}_vault', bm, M_VAULT)
    a = va0 + .12
    while a < va1 - .1:
        bm = bmesh.new(); pts = [bm.verts.new((HX + math.cos(a) * r, HY + math.sin(a) * r, z)) for r, z in section(a, 1.0)]
        for p, q in zip(pts, pts[1:]): bm.edges.new((p, q))
        o = obj(f'arm_{tag}_vault_rib_{a:.2f}'.replace('.', 'p'), bm, M_METAL)
        sk = o.modifiers.new('skin', 'SKIN'); [setattr(v, 'radius', (.035, .035)) for v in o.data.skin_vertices[0].data]
        a += .16
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
# 艦身尾端:封起來的尾板 + 深色散熱格柵(不再放引擎,免得噴到後面的環臂)
box('stern_plate', (8.2, .5, 4.4), (0, -26.15, 0), M_HULL2, bevel=.2)
for k in range(5): box(f'stern_vent_{k}', (6.0, .12, .28), (0, -26.42, -1.3 + k * .62), M_DARK, bevel=.03)
ENGINES = []                                                                    # (x, 噴口 y, z, 大小):網頁 exterior.mjs 的噴焰位置照這個
OR_R = 22                                                                       # 外環臂半徑(跟上面 ring_arm('outer', ...) 一樣);環臂底下那片的下緣約 z = -2.8
for k, adeg in enumerate((256, 270, 284)):                                      # 縮在外環臂正下方、貼著下緣(少擋後面的觀景窗)
    a = math.radians(adeg); s = (1.1 if adeg == 270 else .95) * .85
    ex = HX + math.cos(a) * (OR_R - .2); ye = HY + math.sin(a) * (OR_R + 2.2); L = 3.4 * s; yf = ye + L   # 噴口 y、機艙前端 y
    zc = -2.9 - 1.42 * s                                                         # 機艙頂端離環臂下緣只留一點縫
    lathe(f'engine_{k}', ex, zc, [(yf + .35 * s, .05), (yf + .3 * s, .55 * s), (yf + .1 * s, 1.05 * s), (yf - .25 * s, 1.28 * s), (ye + .5 * s, 1.38 * s), (ye + .12 * s, 1.42 * s)], M_HULL2, cap0=True)
    lathe(f'engine_lip_{k}', ex, zc, [(ye + .12 * s, 1.42 * s), (ye, 1.4 * s), (ye - .02, 1.3 * s), (ye + .1 * s, 1.24 * s)], M_METAL)   # 噴口外緣
    lathe(f'engine_bell_{k}', ex, zc, [(ye + .1 * s, 1.24 * s), (ye + .7 * s, 1.02 * s), (ye + 1.3 * s, .8 * s)], M_DARK)               # 噴嘴內壁(往裡收)
    for j, (dy, rr) in enumerate(((.38, 1.13), (.85, .93))): torus(f'engine_ring_{k}_{j}', rr * s, .035 * s, (ex, ye + dy * s, zc), M_METAL, rot=(math.pi / 2, 0, 0), seg=64, mseg=6)   # 內壁上兩圈冷卻環
    cyl(f'engine_core_{k}', .8 * s, .04, (ex, ye + 1.33 * s, zc), M_BLUE, rot=(math.pi / 2, 0, 0), verts=48)                           # 最裡面的發光面(從渦輪葉片縫隙透出來)
    torus(f'engine_glow_{k}', .78 * s, .04 * s, (ex, ye + 1.26 * s, zc), M_BLUE, rot=(math.pi / 2, 0, 0), seg=64, mseg=6)
    for q in range(18):                                                         # 渦輪葉片
        b = q * math.tau / 18
        box(f'engine_blade_{k}_{q}', (.08 * s, .04, .5 * s), (ex + math.cos(b) * .53 * s, ye + 1.22 * s, zc + math.sin(b) * .53 * s), M_DARK, rot=(.35, math.pi / 2 - b, 0))
    lathe(f'engine_plug_{k}', ex, zc, [(ye + 1.25 * s, .3 * s), (ye + .8 * s, .26 * s), (ye + .3 * s, .12 * s), (ye + .1 * s, .02)], M_METAL, cap1=True)   # 中央尖錐
    for j, (yy, rr) in enumerate(((yf - .45 * s, 1.31), (ye + .6 * s, 1.39))): torus(f'engine_band_{k}_{j}', rr * s + .02, .07 * s, (ex, yy, zc), M_DARK, rot=(math.pi / 2, 0, 0), seg=64, mseg=8)   # 固定環
    for j in range(7):                                                          # 散熱片:機艙中段一疊薄圓片
        cyl(f'engine_hs_{k}_{j}', 1.5 * s, .045, (ex, yf - (.8 + j * .15) * s, zc), M_DARK, rot=(math.pi / 2, 0, 0), verts=48)
    for side in (-1, 1):                                                        # 兩側的散熱板(上面一排小鰭)
        x_ = ex + side * (1.33 + .42) * s
        box(f'engine_rad_{k}_{side + 1}', (.85 * s, 1.5 * s, .07), (x_, ye + 1.05 * s, zc - .1 * s), M_HULL2, bevel=.02)
        for q in range(6): box(f'engine_radfin_{k}_{side + 1}_{q}', (.75 * s, .04, .16 * s), (x_, ye + (.42 + q * .25) * s, zc - .1 * s + .1 * s), M_DARK)
    top = zc + 1.3 * s                                                          # 吊架:機艙頂上的鞍座 + 左右各兩根斜撐(上端接在環臂下面)
    box(f'engine_pylon_{k}', (.7 * s, 2.1 * s, -2.7 - top + .3), (ex, ye + L * .55, (-2.7 + top - .3) / 2), M_HULL2, bevel=.06)
    for side in (-1, 1):
        for j, yy in enumerate((ye + L * .3, ye + L * .8)):
            p_ = (ex + side * 1.3 * s * math.cos(.55), yy, zc + 1.3 * s * math.sin(.55)); q_ = (ex + side * 1.75 * s, yy, -2.78)
            strut(f'engine_strut_{k}_{side + 1}_{j}', p_, q_, .07 * s, M_METAL)
            box(f'engine_clevis_{k}_{side + 1}_{j}', (.22 * s, .22 * s, .1), (q_[0], yy, -2.76), M_DARK)
    ENGINES.append((round(ex, 3), round(ye, 3), round(zc, 3), round(s, 3)))
print('ENGINES', ENGINES)
# 護航小艦:白色機身 + 珍珠灰背脊 / 機翼 / 尾翼 + 深色玻璃座艙 + 兩具引擎艙(藍色噴口)+ 翼尖燈(左紅右綠)+ 橘色飾條 + 一排舷窗 + 面板縫
# (機頭朝 +Y;先在原點蓋好,最後整組移到 loc、轉 yaw、縮放 sc)
M_SHIPGLOW = M_BLUE
M_ESC_GLASS = mat('escort_glass', '#0c1830', .05, .3, coat=1.0)
M_ESC_ACCENT = mat('escort_accent', '#e8913a', .35, .1, coat=.5)
M_NAV_R = mat('escort_navred', '#000000', 1, emit='#ff3b3b', k=12)
M_NAV_G = mat('escort_navgreen', '#000000', 1, emit='#3bff7a', k=12)
def shuttle(tag, loc, yaw, sc):
    before = set(bpy.data.objects); P = f'escort_{tag}'
    loft(P, [(-3, 1.5, .78, 0, .3), (-1.2, 2.0, .95, .08, .35), (1.2, 1.5, .78, .1, .3), (2.7, .7, .45, .05, .15), (3.4, .12, .12, 0, .03)], M_HULL, .05)
    loft(f'{P}_wing', [(-2.4, 4.6, .14, -.12, .05), (-.8, 3.4, .14, -.12, .05), (.6, .8, .1, -.12, .03)], M_HULL2, .03)
    loft(f'{P}_spine', [(-2.8, .5, .3, .5, .1), (.6, .42, .26, .5, .1), (1.4, .1, .1, .42, .03)], M_HULL2, .03)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1)
    bmesh.ops.scale(bm, vec=(.4, .9, .26), verts=bm.verts); bmesh.ops.translate(bm, vec=(0, 1.45, .38), verts=bm.verts)
    obj(f'{P}_canopy', bm, M_ESC_GLASS, smooth=True)
    box(f'{P}_fin', (.08, 1.0, .75), (0, -2.35, .8), M_HULL2, rot=(math.radians(-22), 0, 0), bevel=.02)
    for s_ in (-1, 1):
        cyl(f'{P}_nacelle_{s_}', .28, 1.7, (s_ * .82, -2.3, -.04), M_DARK, rot=(math.pi / 2, 0, 0), verts=24, bevel=.03, r2=.34)
        cyl(f'{P}_nozzle_{s_}', .3, .12, (s_ * .82, -3.18, -.04), M_METAL, rot=(math.pi / 2, 0, 0), verts=24)
        cyl(f'{P}_glow_{s_}', .23, .05, (s_ * .82, -3.25, -.04), M_SHIPGLOW, rot=(math.pi / 2, 0, 0), verts=24)
        cyl(f'{P}_tip_{s_}', .1, .9, (s_ * 2.28, -1.95, -.12), M_HULL2, rot=(math.pi / 2, 0, 0), verts=12, r2=.06)
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=.07); bmesh.ops.translate(bm, vec=(s_ * 2.28, -1.48, -.12), verts=bm.verts)
        obj(f'{P}_nav_{s_}', bm, M_NAV_R if s_ < 0 else M_NAV_G)
        box(f'{P}_stripe_{s_}', (.03, 3.4, .09), (s_ * .9, -.25, .1), M_ESC_ACCENT)
        for k in range(6): box(f'{P}_win_{s_}_{k}', (.03, .16, .07), (s_ * .86, -1.25 + k * .36, .28), M_WIN)
        for k, y in enumerate((-1.95, -.75)): box(f'{P}_seam_{s_}_{k}', (.02, .025, .45), (s_ * .92, y, .02), M_DARK)
    bpy.context.view_layer.update()                                             # box / cyl 只設了 location / rotation:先更新,matrix_world 才是對的
    M_ = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Scale(sc, 4)
    for o_ in set(bpy.data.objects) - before: o_.matrix_world = M_ @ o_.matrix_world
for k, (loc, yaw, sc) in enumerate((((30, 18, -6), .3, 1.0), ((-34, 6, 8), -.4, .9), ((24, -42, 4), .9, 1.1), ((-12, 44, -10), .1, .8), ((44, -8, 12), .5, .7))):
    shuttle(k, loc, yaw, sc)

# 機庫段的側面:上下兩條深色裝甲帶框出機庫口位置(門、發光框由網頁蓋)
for s in (-1, 1):
    box(f'hangar_frame_top_{s}', (.5, 14.2, .5), (s * 6.55, -3, 2.55), M_DARK, bevel=.05)
    box(f'hangar_frame_bot_{s}', (.5, 14.2, .5), (s * 6.55, -3, -1.95), M_DARK, bevel=.05)

M_PAINT = mat('ship_paint', '#3a3f48', .4, .2)
M_HAZARD = mat('ship_hazard', '#e8b23a', .4)
def label(text, loc, rot, size, m):
    cu = bpy.data.curves.new(text, 'FONT'); cu.body = text; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = .01
    o = bpy.data.objects.new('label_' + text, cu); scene.collection.objects.link(o); o.location = loc; o.rotation_euler = rot; o.data.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.convert(target='MESH')
# ================= 6.5) 機庫:艦身挖出一個真的機庫(兩側開口 = 網頁上的機庫門位置),裡面有甲板、天花板燈、停機坪、兩艘小艇、貨櫃、氣閘門 =================
#   機庫範圍 x ±6.3、y -12 ~ 7(+y = 艦首那頭,氣閘門在這面牆)、z -1.8 ~ 2.6;開口 y -9.6 ~ 3.6、z -1.75 ~ 2.35(兩側)
BX, BY0, BY1, BZ0, BZ1 = 6.3, -12.0, 7.0, -1.8, 2.6
BYM, BZM = (BY0 + BY1) / 2, (BZ0 + BZ1) / 2
cut_col = bpy.data.collections.new('bay_cutters'); scene.collection.children.link(cut_col)
def cutter(name, size, loc):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(name, me); cut_col.objects.link(o); o.location = loc
    me.materials.append(M_HULL)                                               # 布林切出來的面沿用艦身材質(不然烘焙時是空材質)
cutter('cut_bay', (BX * 2 + .1, BY1 - BY0 + .1, BZ1 - BZ0 + .1), (0, BYM, BZM))
cutter('cut_open', (18, 13.2, 4.1), (0, -3, .3))
cut_col.hide_render = True; cut_col.hide_viewport = True
bo = bpy.data.objects['hull'].modifiers.new('bay', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.operand_type = 'COLLECTION'; bo.collection = cut_col; bo.solver = 'EXACT'
M_DECK = plated('bay_deck', '#454a53', .62, .45, coat=0.0, scale=.9, seam=.5)
M_BAYW = plated('bay_wall', '#dcdee2', .34, .3, coat=.3, scale=.8, seam=.45)
M_YEL = mat('bay_yellow', '#d9a23a', .5)
M_BLIGHT = mat('bay_light', '#000000', 1, emit='#fff1dc', k=14)
M_PAD = mat('bay_pad', '#000000', 1, emit='#7cc8ff', k=7)
M_GUIDE = mat('bay_guide', '#000000', 1, emit='#ffcf8a', k=10)
def bbox(name, size, loc, m, rot=(0, 0, 0), bevel=0.0): return box('bay_' + name, size, loc, m, rot, bevel)
# 甲板、天花板、天花板橫樑 + 燈條
bbox('floor', (2 * BX, BY1 - BY0, .2), (0, BYM, BZ0 - .1), M_DECK)
bbox('ceil', (2 * BX, BY1 - BY0, .2), (0, BYM, BZ1 + .1), M_BAYW)
y = BY0 + 1
while y < BY1 - .5:
    bbox(f'beam_{y:.0f}', (2 * BX, .32, .38), (0, y, BZ1 - .19), M_BAYW, bevel=.03)
    if y + 1 < BY1: bbox(f'lightstrip_{y:.0f}', (2 * BX - 1.4, .16, .05), (0, y + 1, BZ1 - .03), M_BLIGHT)
    y += 2
# 前牆(氣閘門)、後牆(貨櫃)、開口兩旁的側牆 + 直條肋
bbox('wall_front', (2 * BX, .3, BZ1 - BZ0), (0, BY1 + .15, BZM), M_BAYW)
bbox('wall_back', (2 * BX, .3, BZ1 - BZ0), (0, BY0 - .15, BZM), M_BAYW)
for s_ in (-1, 1):
    for (ya, yb) in ((BY0, -9.6), (3.6, BY1)):
        bbox(f'wall_side_{s_}_{ya:.0f}', (.3, yb - ya, BZ1 - BZ0), (s_ * (BX + .15), (ya + yb) / 2, BZM), M_BAYW)
    for x in (2.2, 4.4):
        for yy in (BY1 - .05, BY0 + .05):
            bbox(f'rib_{s_}_{x}_{yy:.0f}', (.3, .18, BZ1 - BZ0), (s_ * x, yy, BZM), M_DECK, bevel=.03)
# 氣閘門:圓形門框 + 暖光環 + 左右兩半門(網頁上會滑開)+ 門上方的字
torus('bay_airlock_frame', 1.8, .24, (0, BY1 - .08, .35), M_BAYW, rot=(math.pi / 2, 0, 0), seg=96, mseg=16)
torus('bay_airlock_glow', 1.52, .045, (0, BY1 - .2, .35), M_GUIDE, rot=(math.pi / 2, 0, 0), seg=96, mseg=8)
for s_, nm in ((-1, 'L'), (1, 'R')):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=1.62, radius2=1.62, depth=.16)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(-s_, 0, 0), clear_inner=True)
    bmesh.ops.contextual_create(bm, geom=[e for e in bm.edges if e.is_boundary])
    o = obj(f'bay_door_{nm}', bm, M_HULL, .02, 2); o.location = (0, BY1 - .1, .35); o.rotation_euler = (math.pi / 2, 0, 0)
    box(f'bay_door_{nm}_seam', (.04, .02, 3.0), (s_ * .03, BY1 - .2, .35), M_GUIDE).parent = None
    box(f'bay_door_{nm}_band', (1.2, .02, .06), (s_ * .75, BY1 - .2, -.15), M_PAD)
label('HANGAR 01', (0, BY1 - .32, 2.25), (math.pi / 2, 0, 0), .36, M_PAINT)
for o in [o for o in scene.objects if o.name == 'label_HANGAR 01']: o.name = 'bay_label'
# 地上的標線:開口邊的黃線、兩個停機坪光環、通往氣閘門的導引燈
for s_ in (-1, 1):
    bbox(f'yline_{s_}', (.08, 13.0, .01), (s_ * 5.7, -3, BZ0 + .006), M_YEL)
    for k in range(9): bbox(f'hz_{s_}_{k}', (.5, .18, .012), (s_ * 6.0, -9.2 + k * 1.55, BZ0 + .007), M_YEL, rot=(0, 0, math.radians(35)))
for k, (x, y_) in enumerate(((-3.2, -7.2), (3.2, -7.2))):
    torus(f'bay_pad_{k}', 1.7, .05, (x, y_, BZ0 + .02), M_PAD, seg=96, mseg=6)
    torus(f'bay_padline_{k}', 1.25, .03, (x, y_, BZ0 + .02), M_YEL, seg=96, mseg=6)
y = -9.0
while y < BY1 - .8:
    for x in (-.85, .85): bbox(f'guide_{x}_{y:.1f}', (.12, .3, .025), (x, y, BZ0 + .012), M_GUIDE)
    y += .9
# 停在停機坪上的兩艘小艇(跟外面護航艦同款,縮小)+ 起落架
for k, (x, y_) in enumerate(((-3.2, -7.2), (3.2, -7.2))):
    shuttle(f'parked{k}', (x, y_, BZ0 + .62), 0, .55)
    for o in [o for o in bpy.data.objects if o.name.startswith(f'escort_parked{k}')]:   # 停機坪上的兩艘:改名併進機庫(一起烘光)
        o.name = o.name.replace(f'escort_parked{k}', f'bay_ship_{k}')
    for dx, dy in ((-.6, -.9), (.6, -.9), (0, 1.0)):
        bbox(f'gear_{k}_{dx}_{dy}', (.08, .08, .5), (x + dx, y_ + dy, BZ0 + .25), M_DARK)
# 後牆前面的貨櫃 + 油桶、天花板吊車
for i in range(-5, 6):
    if abs(i) < 2: continue
    for j in range(rng.randint(1, 3)):
        sz = rng.uniform(.75, .95)
        bbox(f'crate_{i}_{j}', (sz, sz, sz), (i * 1.0 + rng.uniform(-.08, .08), BY0 + .7 + rng.uniform(0, .3), BZ0 + sz / 2 + j * sz), rng.choice((M_DECK, M_BAYW, M_YEL)), rot=(0, 0, rng.uniform(-.1, .1)), bevel=.04)
for k in range(5):
    cyl(f'bay_tank_{k}', .28, 1.1, (-5.4 + k * .65, BY0 + 1.9, BZ0 + .55), M_HULL2, verts=24, bevel=.04)
bbox('crane', (2 * BX - .6, .3, .3), (0, -2.0, BZ1 - .55), M_YEL, bevel=.03)
bbox('crane_trolley', (.7, .6, .4), (1.5, -2.0, BZ1 - .9), M_DARK, bevel=.04)
cyl('bay_crane_cable', .02, 1.1, (1.5, -2.0, BZ1 - 1.65), M_METAL, verts=6)
# 烘光用的燈(只在機庫裡):天花板燈條各一盞面光 + 停機坪上方的冷光
for y_ in [BY0 + 2 + 2 * k for k in range(9)]:
    if y_ >= BY1: break
    L_ = bpy.data.lights.new(f'baylamp_{y_}', 'AREA'); L_.shape = 'RECTANGLE'; L_.size = 2 * BX - 1.4; L_.size_y = .3; L_.energy = 180; L_.color = (1, .95, .88)
    lo = bpy.data.objects.new(f'baylamp_{y_}', L_); scene.collection.objects.link(lo); lo.location = (0, y_, BZ1 - .08)
for x in (-3.2, 3.2):
    L_ = bpy.data.lights.new(f'baypad_{x}', 'POINT'); L_.energy = 60; L_.color = (.6, .8, 1); L_.shadow_soft_size = .5
    lo = bpy.data.objects.new(f'baypad_{x}', L_); scene.collection.objects.link(lo); lo.location = (x, -7.2, BZ0 + .5)
L_ = bpy.data.lights.new('bayairlock', 'POINT'); L_.energy = 120; L_.color = (1, .85, .65); L_.shadow_soft_size = .8
lo = bpy.data.objects.new('bayairlock', L_); scene.collection.objects.link(lo); lo.location = (0, BY1 - 1.2, .4)

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
out_bay = lambda c: not (abs(c.x) < 6.9 and BY0 - .4 < c.y < BY1 + .4 and BZ0 - .4 < c.z < BZ1 + .4)
not_hangar = lambda c: not (abs(c.x) > 4.5 and -10.5 < c.y < 4.5 and -2.4 < c.z < 3.0)
off_hub = lambda c: (Vector((c.x, c.y)) - hub_xy).length > 10.8
off_collar = lambda c: not (13.8 < c.y < 19.8)
hulls = [o for o in scene.objects if o.name in ('hull', 'deck1', 'deck2', 'keel')]
kitbash('top', surface_points(hulls, 900, lambda c, n: n.z > .75 and out_bay(c) and off_hub(c) and off_collar(c) and c.y < 30), [M_HULL2, M_HULL2, M_HULL, M_HULL, M_METAL, M_DARK])
kitbash('side', surface_points(hulls, 500, lambda c, n: abs(n.x) > .6 and out_bay(c) and not_hangar(c) and off_collar(c) and c.y < 28 and abs(c.z) > .2 and not (-2 < c.z < 2 and abs(c.x) > 4)), [M_HULL2, M_HULL2, M_HULL, M_DARK])
kitbash('belly', surface_points(hulls, 450, lambda c, n: n.z < -.7 and out_bay(c) and off_collar(c) and c.y < 30), [M_HULL2, M_DARK, M_METAL])
arms = [o for o in scene.objects if o.name in ('arm_outer', 'arm_inner', 'arm_low')]
kitbash('armunder', surface_points(arms, 700, lambda c, n: n.z < -.6), [M_HULL2, M_DARK, M_METAL], light_every=6)
kitbash('hub', surface_points([o for o in scene.objects if o.name in ('hub_base', 'hub_step')], 160, lambda c, n: n.z < -.6 or abs(n.z) < .3), [M_HULL2, M_DARK], light_every=5)

# ================= 8) 標記:艦名、編號、機庫口的警示斜紋 =================
for s_ in (-1, 1):
    hw = hull_half_width(-17, .6)
    label('XA-01', (s_ * (hw + .03), -17, .1), (math.pi / 2, 0, s_ * math.pi / 2), .9, M_PAINT)
    for k in range(18):                                                         # 機庫口上下框的黃黑斜紋
        for z in (2.55, -1.95):
            box(f'hazard_{s_}_{k}_{z}', (.03, .22, .5), (s_ * 6.82, -9.6 + k * .78, z), M_HAZARD, rot=(math.radians(35), 0, 0))
label('X·ARTS', (0, 9.5, 4.86), (0, 0, -math.pi / 2), 1.5, M_PAINT)               # 艦名寫在上層甲板(沿艦身方向)
label('XA-01', (0, 27.5, 4.3), (0, 0, 0), 1.3, M_PAINT)

def fixture_lights(k=1.0):
    """在燈具位置放真的點光源(預覽圖看效果;匯出時拿來烘光照貼圖)"""
    for i, (x, y, z, col, w, r) in enumerate(FIXTURES):
        ld = bpy.data.lights.new(f'fx_{i}', 'POINT'); ld.energy = w * k; ld.shadow_soft_size = r; ld.color = srgb(col)[:3]
        lo = bpy.data.objects.new(f'fx_{i}', ld); lo.location = (x, y, z); scene.collection.objects.link(lo)
mode = ARGS[0] if ARGS else 'preview'
if mode == 'preview':
    fixture_lights()
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
    eye, look = {'bay': ((5.6, -3.2, .5), (-1.5, 3.5, .1)), 'bayin': ((0, -6.5, .9), (0, 7, .3)), 'cine': ((46, 54, 16), (2, -6, 4)), 'detail': ((26, -2, 16), (2, -14, 2)), 'hero': ((62, 58, 40), (0, -4, 0)), 'side': ((90, 4, 14), (0, -2, 2)), 'top': ((10, -6, 110), (0, -6, 0)), 'back': ((-55, -75, 35), (0, -10, 2)), 'tail': ((-26, -74, 16), (0, -37, 0)), 'dome': ((15, -3, 12), (0, -18, 4.5)), 'escort': ((36, 25, -2), (30, 18, -6)), 'escort_side': ((36.7, 16.1, -4.3), (30, 18, -6)), 'escort_rear': ((34.4, 10.5, -3.6), (30, 18, -6)), 'engines': ((9, -51, -6.5), (0, -40, -3.8)), 'lounge': ((0, -55, .6), (0, -40, -.2)), 'bow': ((20, 52, 9), (0, 31, 1)), 'gallery': ((14, -52, 0), (14, -30, -.5)), 'toplights': ((-22, -36, 11), (0, -17, 5.5)), 'spire': ((-12, -36, 24), (0, -17, 19)), 'win': ((19, -44, 1), (13, -36, -.3)), 'hullwin': ((16, -20, 1), (6.6, -16, -.2))}[view]
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
