# Cat Street 棋盤上的小動物(貓、兔子):取代原本用幾顆球疊起來的棋子。
#   身體 / 頭用 metaball 融成一整塊柔和的形體(轉成網格),毛色用頂點顏色畫(虎斑條紋、白胸口、白腳掌),網頁直接吃 glTF 的 COLOR_0
#   會動的部位各自掛在空物件(樞紐)底下,網頁照名字抓來轉:
#     貓   <n>_leg_fl / _leg_fr / _leg_bl / _leg_br(肩 / 髖關節)、<n>_tail(尾巴根)、<n>_head(脖子)
#     兔子 <n>_leg_bl / _leg_br(後腿)、<n>_leg_fl / _leg_fr(前腳)、<n>_ear_l / _ear_r(耳根)、<n>_tail
#   座標:模型自己的前方 = +x、左 = +y、上 = +z,最後整組轉到 face 方向、縮放 s、放到 base(腳底)
# 單獨看:blender -b --python tools/blender/critters.py -- preview out.png [samples]
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

def _srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)

_M = {}
def vmat(name, rough=.55, coat=.25, sheen=.0):
    """吃頂點顏色的材質(glTF 匯出成 COLOR_0 × 白色底色)"""
    if name in _M: return _M[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
    nt.links.new(ca.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    if coat: p.inputs['Coat Weight'].default_value = coat; p.inputs['Coat Roughness'].default_value = .25
    _M[name] = m; return m
def pmat(name, hexc, rough=.4, coat=0.0):
    if name in _M: return _M[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*_srgb(hexc), 1); p.inputs['Roughness'].default_value = rough
    if coat: p.inputs['Coat Weight'].default_value = coat; p.inputs['Coat Roughness'].default_value = .03
    _M[name] = m; return m

def paint(me, fn):
    """每個頂點依位置(模型座標)決定顏色"""
    if 'Col' not in me.color_attributes: me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    at = me.color_attributes['Col']
    for v in me.vertices:
        c = fn(v.co); at.data[v.index].color = (*c, 1.0)

def blob(col, name, elems, res=.012, thresh=.6):
    """metaball → 網格。elems: (位置, 半徑, (縮放 x, y, z) 或 None)"""
    mb = bpy.data.metaballs.new(name + '_mb'); mb.resolution = res; mb.render_resolution = res; mb.threshold = thresh
    for (p, r, sc) in elems:
        e = mb.elements.new(); e.co = Vector(p); e.radius = r
        if sc: e.type = 'ELLIPSOID'; e.size_x, e.size_y, e.size_z = sc
    ob = bpy.data.objects.new(name + 'MB', mb); col.objects.link(ob); bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob); bpy.data.metaballs.remove(mb)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()   # metaball 轉出來的面方向不一定朝外
    me.name = name; o = bpy.data.objects.new(name, me); col.objects.link(o)
    for p in me.polygons: p.use_smooth = True
    return o

def tube(col, name, pts, radii, m, seg=14):
    """沿著一串點長出一條粗細漸變的圓管(尾巴、腳、鬍鬚),兩端是半球形圓頂。
    每一圈的方向用平行移動接續(不會扭轉,原本每圈各算各的會扭成星形的皺摺)"""
    pts = [Vector(p) for p in pts]; n = len(pts)
    dirs = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    a = dirs[0].orthogonal().normalized(); frames = []
    for d in dirs:
        a = (a - d * a.dot(d)).normalized(); frames.append((a, d.cross(a)))
    cen, rad, fr = [], [], []
    CAP = 5
    for k in range(CAP, 0, -1):                                              # 起點的半球
        t = k / CAP * math.pi / 2; cen.append(pts[0] - dirs[0] * radii[0] * math.sin(t)); rad.append(radii[0] * math.cos(t)); fr.append(frames[0])
    for p, r, f in zip(pts, radii, frames): cen.append(p); rad.append(r); fr.append(f)
    for k in range(1, CAP + 1):                                              # 終點的半球
        t = k / CAP * math.pi / 2; cen.append(pts[-1] + dirs[-1] * radii[-1] * math.sin(t)); rad.append(radii[-1] * math.cos(t)); fr.append(frames[-1])
    bm = bmesh.new(); rings = []
    for c, r, (fa, fb) in zip(cen, rad, fr):
        if r < 1e-6: rings.append([bm.verts.new(c)]); continue
        rings.append([bm.verts.new(c + (fa * math.cos(t) + fb * math.sin(t)) * r) for t in (k / seg * math.tau for k in range(seg))])
    for r0, r1 in zip(rings, rings[1:]):
        if len(r0) == 1: [bm.faces.new((r0[0], r1[(k + 1) % seg], r1[k])) for k in range(seg)]
        elif len(r1) == 1: [bm.faces.new((r0[k], r0[(k + 1) % seg], r1[0])) for k in range(seg)]
        else: [bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k])) for k in range(seg)]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.data.materials.append(m)
    for p in me.polygons: p.use_smooth = True
    return o

def ball(col, name, p, r, m, sc=(1, 1, 1), seg=24):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    bmesh.ops.scale(bm, vec=Vector(sc), verts=bm.verts); bmesh.ops.translate(bm, vec=Vector(p), verts=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.data.materials.append(m)
    for q in me.polygons: q.use_smooth = True
    return o

def ear(col, name, base, w, h, flat, m_out, m_in):
    """立體的耳朵:扁的圓錐(外殼)+ 前面一片粉紅的小圓錐(內側)。base = 耳根中心;面向 +x"""
    def cone(nm, r, hh, mm, dx):
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=r, radius2=r * .08, depth=hh)
        bmesh.ops.translate(bm, vec=(0, 0, hh / 2), verts=bm.verts); bmesh.ops.scale(bm, vec=(flat, 1, 1), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(dx, 0, 0), verts=bm.verts)
        me = bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(nm, me); col.objects.link(o); o.data.materials.append(mm); o.location = Vector(base)
        sub = o.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
        for q in me.polygons: q.use_smooth = True
        return o
    return cone(name, w, h, m_out, 0), cone(name + '_in', w * .62, h * .78, m_in, w * flat * .55)

def pivot(col, name, at):
    e = bpy.data.objects.new(name, None); col.objects.link(e); e.location = Vector(at); e.empty_display_size = .05; return e

def parent(child, par):
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy(); child.parent = par; child.matrix_parent_inverse = par.matrix_world.inverted(); child.matrix_world = mw

def finish(col, name, objs, pivots, base, face, s):
    """全部零件掛到根空物件 <name>(原點在腳底);根物件轉向 face、縮放 s"""
    root = pivot(col, name, (0, 0, 0))
    for o in objs:
        if o.parent is None: parent(o, root)
    for e in pivots:
        if e.parent is None: parent(e, root)
    for o in list(col.objects):                                             # 其他沒掛上的零件(身體的描邊 _ol 等)也掛到根物件
        if o is not root and o.parent is None and o.name.startswith(name + '_'): parent(o, root)
    root.rotation_euler = (0, 0, face); root.scale = (s, s, s); root.location = Vector(base)
    bpy.context.view_layer.update()
    return root

def hit(obj, origin, d):
    """從 origin 往 d 方向打到 obj 表面的點與法線(模型座標;建模時根物件還在原點,所以 = 世界座標)"""
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    t = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
    mw = obj.matrix_world; inv = mw.inverted()
    o = inv @ Vector(origin); dd = (inv.to_3x3() @ Vector(d)).normalized()
    p, n, _, _ = t.ray_cast(o, dd)
    if p is None: return Vector(origin), Vector(d).normalized()
    return mw @ p, (mw.to_3x3() @ n).normalized()

def on_surface(col, name, obj, origin, d, r, m, sc=(1, 1, 1), sink=.45):
    """貼在表面上的小零件(眼睛、鼻子):沿法線擺正、陷進去一點"""
    p, n = hit(obj, origin, d)
    o = ball(col, name, (0, 0, 0), r, m, sc)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(n); o.location = p - n * r * sc[0] * sink
    return o, p, n

# ---------------- 可愛插畫風(使用者給的參考圖):奶白圓滾身體 + 深咖啡描邊、小黑點眼睛、粉紅腮紅、ㅅ 嘴 ----------------
INK = '#4a362e'
CREAM_W, TAN, GREYC, SHIRT = _srgb('#fbf5ea'), _srgb('#e2b383'), _srgb('#a3958a'), _srgb('#e7a596')

def outline(col, src, w):
    """描邊(inverted hull):複製一份、沿法線往外推 w、面翻過來 → 網頁 / EEVEE 只畫到背面那層 = 一圈外框。名字 <src>_ol"""
    bpy.context.view_layer.update()
    me = src.data.copy(); bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.normal_update()
    for v in bm.verts: v.co += v.normal * w
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    if 'Col' in me.color_attributes: me.color_attributes.remove(me.color_attributes['Col'])
    me.materials.clear(); me.materials.append(ink_mat())
    o = bpy.data.objects.new(src.name + '_ol', me); col.objects.link(o)
    o.parent = src.parent; o.matrix_parent_inverse = src.matrix_parent_inverse.copy(); o.matrix_basis = src.matrix_basis.copy()
    for q in me.polygons: q.use_smooth = True
    return o
def ink_mat():
    if 'ink_line' in _M: return _M['ink_line']
    m = bpy.data.materials.new('ink_line'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*_srgb(INK), 1); em.inputs['Strength'].default_value = 1
    nt.links.new(em.outputs[0], out.inputs[0]); m.use_backface_culling = True
    _M['ink_line'] = m; return m

def ink_flat():
    """眼睛、嘴、鬍鬚:平塗墨色(兩面都畫、不受光)"""
    if 'kw_ink' in _M: return _M['kw_ink']
    m = bpy.data.materials.new('kw_ink'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*_srgb(INK), 1)
    nt.links.new(em.outputs[0], out.inputs[0]); _M['kw_ink'] = m; return m

def dot_eye(col, name, obj, origin, d, r, m):
    """小黑點眼睛:貼在表面、壓扁的直橢圓"""
    o, p, n = on_surface(col, name, obj, origin, d, r, m, (.32, .78, 1.1), .25); return o
def blush(col, name, obj, origin, d, r, m):
    o, p, n = on_surface(col, name, obj, origin, d, r, m, (.12, 1, .9), .2); return o
def mouth(col, name, obj, origin, w, m):
    """ㅅ 形小嘴(兩撇)+ 中間一小段:細管子貼著臉"""
    p, n = hit(obj, origin, (1, 0, -.12))
    up = Vector((0, 0, 1)); side = n.cross(up).normalized() * -1; upp = side.cross(n).normalized() * -1
    c = p + n * .004; top = c + upp * w * .25
    pts_l = [top, c - upp * w * .25 - side * w * .5]; pts_r = [top, c - upp * w * .25 + side * w * .5]
    out = [tube(col, f'{name}_l', [pts_l[0], (pts_l[0] + pts_l[1]) / 2 - upp * w * .02, pts_l[1]], [w * .09] * 3, m, 8),
           tube(col, f'{name}_r', [pts_r[0], (pts_r[0] + pts_r[1]) / 2 - upp * w * .02, pts_r[1]], [w * .09] * 3, m, 8),
           tube(col, f'{name}_n', [top + upp * w * .18 - side * w * .14, top + upp * w * .22, top + upp * w * .18 + side * w * .14], [w * .08] * 3, m, 8)]
    return out

def kawaii_rabbit(col, name, base, face=0.0, s=1.0):
    """參考圖左邊那隻:大頭、直立長耳、粉紅上衣、前面兩個白色圓腳。總高約 1.0(耳尖)"""
    M_W = vmat(f'{name}_fur', .85, 0); M_SH = vmat(f'{name}_shirt', .85, 0)
    M_INK = ink_flat(); M_BL = pmat('kw_blush', '#f4b0a8', .9)
    W_OL = .016
    shirt = blob(col, f'{name}_body', [((0, 0, .15), .22, (.8, 1.05, .95)), ((0, 0, .27), .17, (.78, .95, .7))], res=.009)
    paint(shirt.data, lambda co: SHIRT); shirt.data.materials.append(M_SH)
    hc = Vector((0, 0, .52))
    head = blob(col, f'{name}_headmesh', [((0, 0, 0), .35, (.8, 1.1, .84))], res=.009); head.location = hc
    paint(head.data, lambda co: CREAM_W); head.data.materials.append(M_W)
    bpy.context.view_layer.update()
    neck = pivot(col, f'{name}_head', hc + Vector((0, 0, -.2)))
    hp = []
    for sd in (1, -1):                                                         # 長耳朵:耳根是樞紐(跳的時候往後甩)
        p, n = hit(head, hc, (-.05, sd * .5, .87))
        er = pivot(col, f'{name}_ear_{"l" if sd > 0 else "r"}', p)
        rel = [Vector(v) for v in ((0, 0, -.05), (0, sd * .02, .1), (0, sd * .035, .22), (0, sd * .04, .31))]
        eo = tube(col, f'{name}_earm_{sd}', rel, [.068, .082, .08, .068], M_W, 20); eo.location = p; eo.scale = (.62, 1, 1)
        paint(eo.data, lambda co: CREAM_W); parent(eo, er); hp += [er]
    for sd in (1, -1):
        hp.append(dot_eye(col, f'{name}_eye_{sd}', head, hc, (.9, sd * .4, .02), .026, M_INK))
        hp.append(blush(col, f'{name}_blush_{sd}', head, hc, (.75, sd * .6, -.22), .05, M_BL))
    hp += mouth(col, f'{name}_mouth', head, hc + Vector((0, 0, -.06)), .07, M_INK)
    for o in [head] + hp: parent(o, neck)
    legs = []
    for sd in (1, -1):                                                         # 前面兩個大大的白色圓腳(坐著,腳往前伸)
        hip = Vector((.02, sd * .12, .1)); e = pivot(col, f'{name}_leg_b{"l" if sd > 0 else "r"}', hip)
        ft = ball(col, f'{name}_foot_{sd}', (.12, sd * .13, .075), .1, M_W, (1.15, .9, .78)); paint(ft.data, lambda co: CREAM_W); parent(ft, e); legs.append(e)
    for sd in (1, -1):                                                         # 小手:粉紅短袖 + 白色小手,垂在身體兩側前面
        sh = Vector((.1, sd * .085, .27)); e = pivot(col, f'{name}_leg_f{"l" if sd > 0 else "r"}', sh)   # 手:參考圖是畫在衣服上的兩條線
        p0, n0 = hit(shirt, Vector((0, sd * .07, .26)), (1, sd * .25, .1)); p1, n1 = hit(shirt, Vector((0, sd * .03, .12)), (1, sd * .05, -.05))
        arm = tube(col, f'{name}_arm_{sd}', [p0 + n0 * .006, (p0 + p1) / 2 + (n0 + n1).normalized() * .012, p1 + n1 * .006], [.008, .008, .008], M_INK, 8)
        parent(arm, e); legs.append(e)
    tl = pivot(col, f'{name}_tail', (-.17, 0, .12))
    tail = ball(col, f'{name}_tail_m', (-.19, 0, .12), .06, M_W); paint(tail.data, lambda co: CREAM_W); parent(tail, tl)
    for o in (shirt, head, tail) + tuple(c for e in legs[:2] for c in e.children) + tuple(c for e in hp if e.type == 'EMPTY' for c in e.children): outline(col, o, W_OL)
    return finish(col, name, [shirt], [neck, tl] + legs, base, face, s)

def kawaii_cat(col, name, base, face=0.0, s=1.0):
    """參考圖右邊那隻三花貓,改成四隻腳站著走的樣子:大頭(左耳頭頂淺橘、右耳頭頂灰)、圓身體(背上一塊灰、一塊橘)、橘灰相間的尾巴"""
    M_W = vmat(f'{name}_fur', .85, 0); M_INK = ink_flat(); M_BL = pmat('kw_blush', '#f5c0bb', .9)
    W_OL = .016
    body = blob(col, f'{name}_body', [((0, 0, .22), .22, (1.35, .9, .85))], res=.007)
    def bodyc(co):
        if co.z > .24 and -.2 < co.x < .02 and co.y < -.02: return GREYC        # 右邊背上一塊灰
        if co.z > .26 and .02 < co.x < .16 and co.y > .04: return TAN          # 左肩一小塊橘
        return CREAM_W
    paint(body.data, bodyc); body.data.materials.append(M_W)
    hc = Vector((.24, 0, .47))
    head = blob(col, f'{name}_headmesh', [((0, 0, 0), .3, (.8, 1.12, .86))], res=.006); head.location = hc
    def headc(co):
        if co.y > .08 and co.z > .06 and co.x < .2: return TAN                  # 左邊頭頂到左耳:淺橘
        if co.y < -.1 and co.z > .02 and co.x < .22: return GREYC               # 右邊頭頂到右耳:灰
        return CREAM_W
    paint(head.data, headc); head.data.materials.append(M_W)
    bpy.context.view_layer.update()
    neck = pivot(col, f'{name}_head', hc + Vector((-.1, 0, -.18)))
    hp = []
    for sd in (1, -1):                                                         # 耳朵:圓角三角錐,顏色跟那一側的頭頂一樣
        eo, p, dn = cone_ear(col, f'{name}_ear_{sd}', head, hc, (-.05, sd * .62, .78), .11, .16, .6, M_W)
        paint(eo.data, (lambda co: TAN) if sd > 0 else (lambda co: GREYC)); hp.append(eo)
        hp.append(dot_eye(col, f'{name}_eye_{sd}', head, hc, (.9, sd * .42, .0), .025, M_INK))
        hp.append(blush(col, f'{name}_blush_{sd}', head, hc, (.78, sd * .6, -.22), .048, M_BL))
        wp, wn = hit(head, hc, (.55, sd * .85, -.12))                          # 鬍鬚:兩頰外面各兩撇
        for k, dz in enumerate((.025, -.02)):
            a = wp + wn * .035 + Vector((0, 0, dz)); d = Vector((.0, sd * .055, dz * .7))
            hp.append(tube(col, f'{name}_whisk_{sd}_{k}', [a, a + d * .5, a + d], [.0055] * 3, M_INK, 8))
    hp += mouth(col, f'{name}_mouth', head, hc + Vector((0, 0, -.05)), .065, M_INK)
    for o in [head] + hp: parent(o, neck)
    legs = []
    for nm, x, y in (('fl', .16, .09), ('fr', .16, -.09), ('bl', -.16, .09), ('br', -.16, -.09)):
        hip = Vector((x, y, .16)); e = pivot(col, f'{name}_leg_{nm}', hip)
        lg = tube(col, f'{name}_leg_{nm}_m', [hip, hip + Vector((0, 0, -.06)), Vector((x + .01, y, .055))], [.058, .055, .055], M_W, 18)
        paint(lg.data, lambda co: GREYC if (nm == 'br' and co.z > .12) else CREAM_W); parent(lg, e); legs.append(e)
    tb = Vector((-.27, 0, .27)); te = pivot(col, f'{name}_tail', tb)                # 尾巴:往後再往上翹,前段淺橘、尾端灰
    tpts = [tb, tb + Vector((-.08, 0, .03)), tb + Vector((-.13, 0, .11)), tb + Vector((-.13, 0, .21)), tb + Vector((-.08, 0, .27))]
    tail = tube(col, f'{name}_tail_m', tpts, [.05, .05, .05, .05, .046], M_W, 18)
    paint(tail.data, lambda co: GREYC if co.z > tb.z + .17 else (TAN if co.z > tb.z + .06 else CREAM_W)); parent(tail, te)
    for o in (body, head, tail) + tuple(c for e in legs for c in e.children) + tuple(x for x in hp if x.name.startswith(f'{name}_ear_')): outline(col, o, W_OL)
    return finish(col, name, [body], [neck, te] + legs, base, face, s)

def cone_ear(col, name, obj, origin, d, w, h, flat, m):
    """貓耳朵:圓角三角錐,錐底埋進頭裡、沿法線(往外偏)長出來"""
    p, n = hit(obj, origin, d)
    dn = (n + Vector((0, 0, .6))).normalized()
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=w, radius2=w * .18, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts); bmesh.ops.scale(bm, vec=(flat, 1, 1), verts=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.data.materials.append(m)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(dn); o.location = p - dn * h * .3
    bpy.context.view_layer.update()
    me.transform(o.matrix_basis); o.matrix_basis.identity()                  # 套用變換(描邊要用網格本身的座標)
    sm = o.modifiers.new('sub', 'SUBSURF'); sm.levels = 2; sm.render_levels = 2
    for q in me.polygons: q.use_smooth = True
    return o, p, dn

cat_figure, rabbit_figure = kawaii_cat, kawaii_rabbit

# ---------------- 公仔風(使用者第二組設定圖:軟膠公仔、沒有描邊)----------------
#   貓:橘色虎斑(頭頂 / 背 / 尾巴條紋)、白嘴邊白胸白肚白腳、粉紅內耳、大大的深棕亮面眼睛、腮紅、紅領巾(背後打結)、尾尖白
#   兔子:奶白、長耳朵粉紅內側、粉紅領巾、毛球尾巴、小手,兩隻腳站著
T_OR, T_ORD, T_WH = _srgb('#f0a048'), _srgb('#d97f2c'), _srgb('#fff7ee')
R_WH = _srgb('#fff4ea')

def _ss(e0, e1, x):
    t = min(1, max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
def _mix(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))

def inner_ear(col, name, outer, base, front, M, k=.66, push=.022):
    """內耳:把外耳複製一份、以耳根為中心縮小,往臉的方向推一點(貼在外耳前面)"""
    bpy.context.view_layer.update()
    me = outer.data.copy(); me.materials.clear(); me.materials.append(M)
    if 'Col' in me.color_attributes: me.color_attributes.remove(me.color_attributes['Col'])
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.matrix_world = outer.matrix_world.copy()
    for m in outer.modifiers:
        if m.type == 'SUBSURF': sm = o.modifiers.new('sub', 'SUBSURF'); sm.levels = m.levels; sm.render_levels = m.render_levels
    b = Vector(base); M_ = Matrix.Translation(b + Vector(front) * push) @ Matrix.Scale(k, 4) @ Matrix.Translation(-b)
    me.transform(o.matrix_world.inverted() @ M_ @ o.matrix_world)
    return o

def tblob(col, name, elems, res=.007):
    """metaball 的實際表面比設定的半徑小很多(門檻 .1 時約 0.73 倍)→ 這裡傳「想要的半徑」,自己換算"""
    return blob(col, name, [(p, r / .732, sc) for p, r, sc in elems], res=res, thresh=.1)

def toy_mat(name, rough=.62):
    return vmat(name, rough, .08)

def eye_toy(col, name, head, hc, d, r, M_EYE, M_HI):
    """大大的深棕亮面眼睛:微凸的扁球 + 右上一顆大亮點、左下一顆小亮點"""
    e, p, n = on_surface(col, name, head, hc, d, r, M_EYE, (.5, .92, 1.08), .42)
    up = Vector((0, 0, 1)); side = n.cross(up).normalized(); upp = side.cross(n).normalized()
    out = [e, ball(col, name + '_hi', p + n * r * .3 + upp * r * .42 - side * r * .3, r * .26, M_HI),
           ball(col, name + '_hi2', p + n * r * .25 - upp * r * .35 + side * r * .32, r * .12, M_HI)]
    return out

def bandana(col, name, c, rx, ry, M, apex, width=55, tilt=0.0):
    """領巾:脖子一圈(橢圓環)+ 前面往下垂的三角巾 + 背後的結和兩條小尾巴。c = 環中心,apex = 三角巾尖端"""
    c = Vector(c); apex = Vector(apex)
    ring = [c + Vector((math.cos(a) * rx, math.sin(a) * ry, -math.cos(a) * tilt)) for a in (k / 48 * math.tau for k in range(49))]
    out = [tube(col, f'{name}_band', ring, [.032] * len(ring), M, 12)]
    NU, NV = 14, 10; bm = bmesh.new(); grid = []
    for j in range(NV + 1):
        t = j / NV; row = []
        for i in range(NU + 1):
            u = (i / NU - .5) * 2; a = math.radians(width) * u
            top = c + Vector((math.cos(a) * rx + .02, math.sin(a) * ry, -math.cos(a) * tilt))
            p = top.lerp(apex, t * (1 - abs(u) * .0)) if False else top * (1 - t) + apex * t
            p.y *= (1 - t * .15)
            p.x += .035 * math.sin(math.pi * t) * (1 - abs(u) ** 2)              # 中間鼓起來(貼著胸口的圓)
            row.append(bm.verts.new(p))
        grid.append(row)
    for j in range(NV):
        for i in range(NU): bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.003)
    me = bpy.data.meshes.new(f'{name}_flap'); bm.to_mesh(me); bm.free()
    fl = bpy.data.objects.new(f'{name}_flap', me); col.objects.link(fl); fl.data.materials.append(M)
    so = fl.modifiers.new('sol', 'SOLIDIFY'); so.thickness = .016; so.offset = 0
    sb = fl.modifiers.new('sub', 'SUBSURF'); sb.levels = 2; sb.render_levels = 2
    for q in me.polygons: q.use_smooth = True
    out.append(fl)
    bk = c + Vector((-rx - .02, 0, tilt))
    out.append(ball(col, f'{name}_knot', bk, .04, M, (.8, 1, .9)))
    for sd in (1, -1):
        a = bk + Vector((-.01, sd * .02, 0)); b = a + Vector((-.06, sd * .07, -.06))
        out.append(tube(col, f'{name}_tail_{sd}', [a, (a + b) / 2 + Vector((-.01, 0, .01)), b], [.024, .034, .018], M, 10))
    return out

def toy_cat(col, name, base, face=0.0, s=1.0):
    """參考圖的橘色虎斑貓:大頭直接壓在圓身體前半部、四隻短腳、尾巴往上捲。總高約 1(耳尖)"""
    M_F = toy_mat(f'{name}_fur'); M_PINK = pmat('toy_pink', '#f5a3b0', .55); M_EYE = pmat('toy_eye', '#3a2420', .08, coat=1); M_HI = pmat('toy_hi', '#ffffff', .2)
    M_RED = pmat('toy_red', '#e0544a', .72); M_INK = pmat('toy_ink', '#4a2e28', .6); M_BL = pmat('toy_blush', '#f6a3a0', .9); M_NOSE = pmat('toy_nose', '#e68890', .45)
    body = tblob(col, f'{name}_body', [((-.04, 0, .25), .27, (1.0, .78, .72)), ((.08, 0, .26), .17, (.9, .95, .95))])
    def bodyc(co):
        o = _ss(.24, .3, co.z + .03 * math.cos(co.y * 9)) * (1 - _ss(.08, .16, co.x))   # 背上橘、肚子胸口白
        k = _ss(.4, .75, math.sin(co.x * 34 + 1)) * _ss(.3, .36, co.z)                  # 背上的條紋
        return _mix(T_WH, _mix(T_OR, T_ORD, k), o)
    paint(body.data, bodyc); body.data.materials.append(M_F)
    hc = Vector((.1, 0, .58))
    head = tblob(col, f'{name}_headmesh', [((0, 0, 0), .29, (.9, 1.12, .93)), ((.09, 0, -.1), .13, (.8, 1.4, .72))], res=.006); head.location = hc
    def headc(co):
        e = (co.y / .25) ** 2 + ((co.z + .15) / .15) ** 2                     # 下半臉的白(正面看是一個圓弧)
        w = (1 - _ss(.75, 1.05, e)) * _ss(-.08, .06, co.x)
        w = max(w, (1 - _ss(.022, .045, abs(co.y))) * _ss(.14, .2, co.x) * (1 - _ss(.0, .06, co.z)))   # 鼻樑到兩眼之間的一小道白
        c = T_OR
        if co.z > .08:                                                         # 額頭三道往後彎的條紋
            band = math.cos((co.y + co.x * .25 * math.copysign(1, co.y)) * 46)
            c = _mix(T_OR, T_ORD, _ss(.55, .8, band) * _ss(.08, .14, co.z) * (1 - _ss(.13, .17, abs(co.y))))
        return _mix(c, T_WH, w)
    paint(head.data, headc); head.data.materials.append(M_F)
    bpy.context.view_layer.update()
    neck = pivot(col, f'{name}_head', hc + Vector((-.06, 0, -.22)))
    hp = []
    for sd in (1, -1):
        eo, p, dn = cone_ear(col, f'{name}_ear_{sd}', head, hc, (-.02, sd * .52, .86), .14, .22, .55, M_F)
        paint(eo.data, lambda co: T_OR)
        ei = inner_ear(col, f'{name}_earin_{sd}', eo, p, (1, -sd * .15, 0), M_PINK, .64, .03)
        hp += [eo, ei]
        hp += eye_toy(col, f'{name}_eye_{sd}', head, hc, (.88, sd * .42, -.05), .06, M_EYE, M_HI)
        hp.append(on_surface(col, f'{name}_blush_{sd}', head, hc, (.62, sd * .7, -.3), .048, M_BL, (.12, 1, .72), .2)[0])
        wp, wn = hit(head, hc, (.5, sd * .9, -.22))
        for k, dz in enumerate((.012, -.016)):
            a = wp + wn * .004 + Vector((0, 0, dz)); d = Vector((-.01, sd * .085, dz * 1.4))
            hp.append(tube(col, f'{name}_whisk_{sd}_{k}', [a, a + d * .5, a + d], [.0038] * 3, M_INK, 6))
    hp.append(on_surface(col, f'{name}_nose', head, hc + Vector((0, 0, -.06)), (1, 0, -.1), .018, M_NOSE, (.5, 1.25, .8), .3)[0])
    mp, mn = hit(head, hc + Vector((0, 0, -.1)), (1, 0, -.05))
    for sd in (1, -1):
        a = mp + mn * .003; hp.append(tube(col, f'{name}_mouth_{sd}', [a, a + Vector((0, sd * .015, -.012)), a + Vector((0, sd * .03, -.003))], [.0042] * 3, M_INK, 6))
    for o in [head] + hp: parent(o, neck)
    legs = []
    for nm, x, y in (('fl', .13, .1), ('fr', .13, -.1), ('bl', -.2, .1), ('br', -.2, -.1)):
        hip = Vector((x, y, .14)); e = pivot(col, f'{name}_leg_{nm}', hip)
        lg = tube(col, f'{name}_leg_{nm}_m', [hip, Vector((x + .01, y, .045))], [.062, .06], M_F, 18)
        paint(lg.data, lambda co: T_WH); parent(lg, e); legs.append(e)
    tb = Vector((-.31, 0, .3)); te = pivot(col, f'{name}_tail', tb)
    tpts = [tb, tb + Vector((-.07, 0, .03)), tb + Vector((-.11, 0, .11)), tb + Vector((-.1, 0, .2)), tb + Vector((-.05, 0, .26))]
    tail = tube(col, f'{name}_tail_m', tpts, [.055, .056, .056, .054, .05], M_F, 20)
    paint(tail.data, lambda co: _mix(_mix(T_OR, T_ORD, _ss(.3, .7, math.sin((co.z - tb.z) * 75))), T_WH, _ss(tb.z + .2, tb.z + .24, co.z))); parent(tail, te)
    bd = bandana(col, f'{name}_scarf', (.1, 0, .37), .17, .2, M_RED, (.3, 0, .2), 58, .03)
    return finish(col, name, [body] + bd, [neck, te] + legs, base, face, s)

def toy_rabbit(col, name, base, face=0.0, s=1.0):
    """參考圖的奶白兔子:兩腳站著、大頭、直立長耳(內側粉紅)、小手、毛球尾巴、粉紅領巾。總高約 1.2(耳尖)"""
    M_F = toy_mat(f'{name}_fur'); M_PINK = pmat('toy_pink', '#f5a3b0', .55); M_EYE = pmat('toy_eye', '#3a2420', .08, coat=1); M_HI = pmat('toy_hi', '#ffffff', .2)
    M_SC = pmat('toy_scarf_pink', '#ee8a8c', .72); M_INK = pmat('toy_ink', '#4a2e28', .6); M_BL = pmat('toy_blush', '#f6a3a0', .9); M_NOSE = pmat('toy_nose', '#e68890', .45)
    body = tblob(col, f'{name}_body', [((0, 0, .23), .22, (.85, .95, 1.0)), ((0, 0, .36), .15, (.9, .95, .8))])
    paint(body.data, lambda co: R_WH); body.data.materials.append(M_F)
    hc = Vector((.02, 0, .66))
    head = tblob(col, f'{name}_headmesh', [((0, 0, 0), .28, (.88, 1.1, .93)), ((.08, 0, -.1), .13, (.8, 1.35, .72))], res=.006); head.location = hc
    paint(head.data, lambda co: R_WH); head.data.materials.append(M_F)
    bpy.context.view_layer.update()
    neck = pivot(col, f'{name}_head', hc + Vector((-.03, 0, -.24)))
    hp = []
    for sd in (1, -1):
        p, n = hit(head, hc, (-.06, sd * .34, .94))
        er = pivot(col, f'{name}_ear_{"l" if sd > 0 else "r"}', p)
        rel = [Vector(v) for v in ((0, 0, -.06), (0, sd * .015, .1), (-.01, sd * .028, .25), (-.02, sd * .032, .36))]
        eo = tube(col, f'{name}_earm_{sd}', rel, [.068, .085, .082, .068], M_F, 22); eo.location = p; eo.scale = (.62, 1, 1); paint(eo.data, lambda co: R_WH)
        ei = tube(col, f'{name}_earin_{sd}', [v + Vector((.1, 0, .03)) for v in rel[:3]] + [rel[3] + Vector((.08, 0, -.04))], [.02, .05, .048, .028], M_PINK, 16)
        ei.location = p; ei.scale = (.4, 1, 1)
        for o in (eo, ei): parent(o, er)
        hp.append(er)
        hp += eye_toy(col, f'{name}_eye_{sd}', head, hc, (.88, sd * .42, -.06), .05, M_EYE, M_HI)
        hp.append(on_surface(col, f'{name}_blush_{sd}', head, hc, (.62, sd * .7, -.32), .048, M_BL, (.12, 1, .72), .2)[0])
        wp, wn = hit(head, hc, (.5, sd * .9, -.24))
        for k, dz in enumerate((.012, -.014)):
            a = wp + wn * .004 + Vector((0, 0, dz)); d = Vector((-.01, sd * .075, dz * 1.4))
            hp.append(tube(col, f'{name}_whisk_{sd}_{k}', [a, a + d * .5, a + d], [.0036] * 3, M_INK, 6))
    hp.append(on_surface(col, f'{name}_nose', head, hc + Vector((0, 0, -.08)), (1, 0, -.1), .016, M_NOSE, (.5, 1.25, .8), .3)[0])
    mp, mn = hit(head, hc + Vector((0, 0, -.12)), (1, 0, -.05))
    for sd in (1, -1):
        a = mp + mn * .003; hp.append(tube(col, f'{name}_mouth_{sd}', [a, a + Vector((0, sd * .014, -.011)), a + Vector((0, sd * .028, -.003))], [.004] * 3, M_INK, 6))
    for o in [head] + hp: parent(o, neck)
    legs = []
    for sd in (1, -1):
        hip = Vector((0, sd * .1, .12)); e = pivot(col, f'{name}_leg_b{"l" if sd > 0 else "r"}', hip)
        lg = tube(col, f'{name}_leg_{sd}', [hip, Vector((.02, sd * .1, .045))], [.068, .064], M_F, 18)
        ft = ball(col, f'{name}_foot_{sd}', (.045, sd * .1, .035), .058, M_F, (1.35, 1, .62))
        for o in (lg, ft): paint(o.data, lambda co: R_WH); parent(o, e)
        legs.append(e)
    for sd in (1, -1):
        sh = Vector((.03, sd * .15, .36)); e = pivot(col, f'{name}_leg_f{"l" if sd > 0 else "r"}', sh)
        arm = tube(col, f'{name}_arm_{sd}', [sh, sh + Vector((.03, sd * .04, -.08)), sh + Vector((.05, sd * .045, -.13))], [.048, .046, .046], M_F, 16)
        paint(arm.data, lambda co: R_WH); parent(arm, e); legs.append(e)
    tl = pivot(col, f'{name}_tail', (-.2, 0, .2))
    tail = ball(col, f'{name}_tail_m', (-.215, 0, .2), .07, M_F); paint(tail.data, lambda co: R_WH); parent(tail, tl)
    bd = bandana(col, f'{name}_scarf', (.02, 0, .42), .15, .18, M_SC, (.2, 0, .27), 58, .02)
    return finish(col, name, [body] + bd, [neck, tl] + legs, base, face, s)

cat_figure, rabbit_figure = toy_cat, toy_rabbit

# ---------------- 單獨出圖 ----------------
if __name__ == '__main__' and 'sheet' in sys.argv:
    args = sys.argv[sys.argv.index('--') + 1:]
    kind = args[1]; out = args[2]; samples = int(args[3]) if len(args) > 3 else 64
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; col = sc.collection
    fn = toy_cat if kind == 'cat' else toy_rabbit
    for k, yaw in enumerate((0, 90, 180, 35)):                                  # 正面 / 側面 / 背面 / 3/4(面向鏡頭 = -y)
        fn(col, f'prop_{kind}_{k}', (-1.65 + k * 1.1, 0, 0), math.radians(-90 + yaw), 1.0)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=8); me = bpy.data.meshes.new('floor'); bm.to_mesh(me)
    fl = bpy.data.objects.new('floor', me); col.objects.link(fl); fl.data.materials.append(pmat('floor', '#a9a6aa', .9))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); col.objects.link(cam); sc.camera = cam
    cam.location = (0, -6.6, 1.25); cam.rotation_euler = (math.radians(86), 0, 0); cam.data.lens = 46
    for loc, en, sz in (((-2.5, -3.5, 4), 380, 3), ((3, -2, 2.5), 120, 2), ((0, 3, 3), 180, 3)):
        l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'AREA')); l.data.energy = en; l.data.size = sz; col.objects.link(l); l.location = loc
        l.rotation_euler = (Vector((0, 0, .5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .55, .58, 1); w.node_tree.nodes['Background'].inputs[1].default_value = .5
    sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.device = 'GPU'; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1600, 560; sc.render.filepath = out
    sc.view_settings.view_transform = 'Standard'
    bpy.ops.render.render(write_still=True); print('saved', out)

if __name__ == '__main__' and 'preview' in sys.argv:
    args = sys.argv[sys.argv.index('--') + 1:]
    out = args[1] if len(args) > 1 else '/tmp/critters.png'; samples = int(args[2]) if len(args) > 2 else 64
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; col = sc.collection
    cat_figure(col, 'prop_cat_0', (.36, 0, 0), math.radians(-60), 1.0)
    rabbit_figure(col, 'prop_rabbit_0', (-.36, .05, 0), math.radians(-90), 1.0)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3)
    me = bpy.data.meshes.new('floor'); bm.to_mesh(me); fl = bpy.data.objects.new('floor', me); col.objects.link(fl); fl.data.materials.append(pmat('floor', '#f4efe8', .9))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); col.objects.link(cam); sc.camera = cam
    cam.location = (0.0, -3.0, .75); cam.rotation_euler = (math.radians(84), 0, 0); cam.data.lens = 50
    for loc, en, sz in (((-1.2, -1.4, 2.2), 240, 1.6), ((1.6, -.6, 1.2), 80, 1.0), ((0, 1.6, 1.5), 120, 1.2)):
        l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'AREA')); l.data.energy = en; l.data.size = sz; col.objects.link(l); l.location = loc
        l.rotation_euler = (Vector((0, 0, .2)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = .55
    sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y = 1400, 800; sc.render.filepath = out
    sc.view_settings.view_transform = 'Standard'
    bpy.ops.render.render(write_still=True); print('saved', out)
