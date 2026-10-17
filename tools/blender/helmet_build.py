# 左上角表情頭盔的 3D 外殼 v3(使用者第三張參考圖):一顆球形頭盔,外面一層層厚的白色陶瓷裝甲片(切角邊),片與片之間露出深色機械層,
# 裝甲上嵌幾道藍色 / 琥珀色小燈槽;上面一個有藍色燈條 + 鏡頭的模組,下面一條藍色燈條,兩側耳機(往前斜,看得到藍色光圈);中間大片深色玻璃面罩。
# 外殼固定不動(只渲染正面一張);面罩裡的 LED 表情在網頁用 SVG 畫(public/assets/face.mjs),會跟著滑鼠在面罩裡移動。
# 輸出兩張透明背景 webp:
#   helm.webp       外殼 + 深色面罩(玻璃不反光)
#   helm_glass.webp 只有玻璃上的反光(其他東西都 holdout),網頁疊在表情上面 → 表情像在玻璃後面
# 座標:球心原點、半徑 1,面罩朝 -Y。正交鏡頭 ortho_scale 2.6 → 網頁 SVG 0~100 = -1.3~1.3(1 單位 = 38.46)。
#   面罩:橢圓,半徑 VX × VZ,中心 (0,0) → 網頁 (50,50)
# 用法:blender -b --python tools/blender/helmet_build.py -- preview out.png [samples]
#       blender -b --python tools/blender/helmet_build.py -- final 輸出資料夾 [samples]
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VX, VZ = .69, .63                     # 面罩橢圓半徑(左右、上下)

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c) + (1,)
def mat(name, color, rough=.3, metal=0.0, coat=0.0, emit=None, k=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = srgb(color); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat; p.inputs['Coat Roughness'].default_value = .06
    if emit: p.inputs['Emission Color'].default_value = srgb(emit); p.inputs['Emission Strength'].default_value = k
    return m
M_WHITE = mat('ceramic', '#e9e6e0', .3, coat=.7)
M_WHITE2 = mat('ceramic2', '#d9d6cf', .34, coat=.5)
M_MECH = mat('mech', '#2a2d33', .38, .7)
M_DARK = mat('dark', '#0d0f13', .45, .3)
M_VISOR = mat('visor', '#000000', 1)
M_VISOR.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = 0   # 玻璃反光另外渲染(helm_glass)
M_LENS = mat('lens', '#05070c', .06, .1, coat=1.0)
M_BLUE = mat('blue', '#000000', 1, emit='#6ab4ff', k=30)
M_AMBER = mat('amber', '#000000', 1, emit='#ffae55', k=9)

def mesh_obj(name, bm, m, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = smooth
    return o
def bevel(o, w, seg=3, ang=30):
    b = o.modifiers.new('bevel', 'BEVEL'); b.width = w; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(ang); b.harden_normals = True
    return o
def ell_r(a, mx=0.0):
    """面罩橢圓在角度 a 的半徑(+ mx 邊距)"""
    return VX * VZ / math.sqrt((VZ * math.cos(a)) ** 2 + (VX * math.sin(a)) ** 2) + mx

def sphere_panel(name, a0, a1, rin, rout, Rs, thick, m):
    """球面上的一片裝甲:角度 a0~a1(度)、投影半徑 rin(a)~rout,貼在半徑 Rs 的球面上,往內厚 thick"""
    a0, a1 = math.radians(a0), math.radians(a1)
    nA = max(8, int((a1 - a0) / math.radians(2))); nR = 6
    bm = bmesh.new(); grid = []
    for i in range(nA + 1):
        a = a0 + (a1 - a0) * i / nA; r0 = rin(a) if callable(rin) else rin
        row = []
        for j in range(nR + 1):
            r = r0 + ((rout if rout is not None else r0 + .055) - r0) * j / nR
            row.append(bm.verts.new((r * math.cos(a), -math.sqrt(max(Rs * Rs - r * r, 1e-4)), r * math.sin(a))))
        grid.append(row)
    for i in range(nA):
        for j in range(nR):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    bm.normal_update()
    bm.faces.ensure_lookup_table(); f0 = bm.faces[0]
    if f0.normal.dot(f0.calc_center_median()) < 0:
        for f in bm.faces: f.normal_flip()
    o = mesh_obj(name, bm, m)
    s = o.modifiers.new('solid', 'SOLIDIFY'); s.thickness = thick; s.offset = -1; s.use_even_offset = True
    return bevel(o, .014, 3)

def frame_at(a_deg, r, Rs=1.0, lift=0.0):
    """球面上角度 a、投影半徑 r 那一點的座標系:X 沿著圓周、-Y 朝外(法線)"""
    a = math.radians(a_deg); p = Vector((r * math.cos(a), -math.sqrt(Rs * Rs - r * r), r * math.sin(a))); n = p.normalized()
    t = Vector((-math.sin(a), 0, math.cos(a)))
    if a_deg % 180 == 90: t = Vector((1, 0, 0))                                  # 上 / 下模組:X 朝左右
    t = (t - n * t.dot(n)).normalized()
    Y = -n; Z = t.cross(Y)
    M = Matrix((t, Y, Z)).transposed().to_4x4(); M.translation = p + n * lift
    return M
def part(name, M, loc, size, m, bv=.01, seg=3, kind='cube', verts=32):
    """在座標系 M 裡放一個方塊 / 圓柱(圓柱的軸 = 局部 Y = 法線方向)"""
    if kind == 'cube': bpy.ops.mesh.primitive_cube_add(size=1)
    else: bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=.5, depth=1)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    o.scale = size if kind == 'cube' else (size[0], size[2], size[1]); bpy.ops.object.transform_apply(scale=True)
    if kind != 'cube': o.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))          # 圓柱的軸 Z → 局部 Y
    o.matrix_world = M @ Matrix.Translation(Vector(loc))
    for p in o.data.polygons: p.use_smooth = True
    if bv: bevel(o, bv, seg, 35)
    return o

# ---- 內層:深色機械球(面罩那裡挖空),裝甲之間的縫看到它 ----
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=.93)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, -.45, 0), plane_no=(0, -1, 0), clear_outer=True)
mesh_obj('mech', bm, M_MECH)
# ---- 面罩玻璃:橢圓、往前凸 ----
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=1.0)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 1, 0), clear_outer=True)
for v in bm.verts: v.co.x *= VX + .03; v.co.z *= VZ + .03; v.co.y = v.co.y * .26 - .62
glass = mesh_obj('glass', bm, M_VISOR)
# 面罩外圈的深色橡膠圈
bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=.045, major_segments=160, minor_segments=16, location=(0, -.68, 0), rotation=(math.pi / 2, 0, 0))
g = bpy.context.active_object; g.name = 'gasket'; g.scale = (VX + .04, VZ + .04, 1); g.data.materials.append(M_DARK)
for p in g.data.polygons: p.use_smooth = True

# ---- 第一層裝甲:圍著面罩的厚片(外緣高低不一 → 有層次)----
rin = lambda a: ell_r(a, .04)
A = [(26, 66, .92, M_WHITE), (70, 110, .9, M_WHITE), (114, 154, .92, M_WHITE), (158, 202, .95, M_WHITE2), (206, 246, .91, M_WHITE),
     (250, 290, .95, M_WHITE), (294, 334, .91, M_WHITE), (338, 382, .95, M_WHITE2)]
for i, (a0, a1, ro, m) in enumerate(A): sphere_panel(f'armorA_{i}', a0, a1, rin, ro, 1.0, .13, m)
# ---- 面罩內緣一圈稍微凸起的窄框(12 段,縫跟外面錯開)----
rb = lambda a: ell_r(a, .03)
for i in range(12):
    a0 = 15 + i * 30 + 1.4; sphere_panel(f'bezel_{i}', a0, a0 + 27.2, rb, None, 1.007, .1, M_WHITE2)
# ---- 第二層:外圈(輪廓那一圈)的片,縫跟第一層錯開 ----
for i in range(9):
    a0 = 8 + i * 40 + 2; sphere_panel(f'armorB_{i}', a0, a0 + 36, .84, .968, .975, .12, M_WHITE2 if i % 2 else M_WHITE)
# 縫裡的小琥珀燈點
for k, a in enumerate((68, 112, 248, 292, 204, 336)):
    part(f'amber_dot_{k}', frame_at(a, .91, .935), (0, 0, 0), (.03, .02, .03), M_AMBER, 0)

# ---- 燈槽:深色槽座 + 發光條(沿著圓周)----
def slit(name, a, r, ln, w, m=M_BLUE):
    M = frame_at(a, r, 1.0)
    part(name + '_hs', M, (0, 0, 0), (ln + .035, .05, w + .03), M_DARK, .008, 2)
    part(name, M, (0, -.012, 0), (ln, .05, w), m, .006, 2)
for k, (a, r, ln, w) in enumerate(((180, .855, .2, .045), (0, .855, .2, .045), (213, .86, .12, .038), (327, .86, .12, .038), (143, .86, .09, .032))):
    slit(f'slit_{k}', a, r, ln, w)
for k, (a, r, ln) in enumerate(((50, .885, .05), (20, .89, .04), (232, .885, .05))):
    slit(f'aslit_{k}', a, r, ln, .016, M_AMBER)

# ---- 上面的模組:切角方塊 + 藍色燈條 + 鏡頭 ----
M = frame_at(90, .92, 1.0, .02)
part('top_mod', M, (0, 0, 0), (.44, .26, .26), M_WHITE, .055, 1)
part('top_cap', M, (0, .02, .1), (.3, .24, .1), M_WHITE2, .03, 1)
part('top_bar_hs', M, (0, -.13, .045), (.2, .03, .07), M_DARK, .012, 2)
part('top_bar', M, (0, -.142, .045), (.15, .03, .036), M_BLUE, .008, 2)
part('top_lens_hs', M, (0, -.115, -.075), (.13, .06, .13), M_DARK, .01, 2, 'cyl', 6)
part('top_lens_ring', M, (0, -.145, -.075), (.095, .015, .095), M_MECH, .003, 2, 'cyl', 32)
part('top_lens', M, (0, -.15, -.075), (.075, .02, .075), M_LENS, .004, 2, 'cyl', 32)
# ---- 下面:寬燈條 ----
M = frame_at(270, .93, 1.0, .015)
part('bot_mod', M, (0, 0, 0), (.5, .22, .2), M_WHITE, .045, 1)
part('bot_bar_hs', M, (0, -.115, 0), (.26, .03, .085), M_DARK, .012, 2)
part('bot_bar', M, (0, -.127, 0), (.21, .03, .048), M_BLUE, .008, 2)
for s_ in (-1, 1): part(f'bot_slot_{s_}', M, (s_ * .2, -.11, 0), (.035, .03, .08), M_DARK, .006, 2)

# ---- 兩側耳機:往前斜 25°,看得到藍色光圈 ----
for s_ in (-1, 1):
    ax = Vector((s_ * math.cos(math.radians(14)), -math.sin(math.radians(14)), 0))
    E = Vector((0, -1, 0)).rotation_difference(ax).to_matrix().to_4x4(); E.translation = (s_ * .9, -.08, 0)
    part(f'ear_{s_}', E, (0, -.06, 0), (.62, .2, .62), M_WHITE, .04, 3, 'cyl', 64)
    part(f'ear_mid_{s_}', E, (0, -.18, 0), (.5, .1, .5), M_WHITE2, .025, 3, 'cyl', 64)
    part(f'ear_cap_{s_}', E, (0, -.24, 0), (.38, .05, .38), M_MECH, .012, 2, 'cyl', 64)
    part(f'ear_lens_{s_}', E, (0, -.262, 0), (.26, .03, .26), M_LENS, .006, 2, 'cyl', 64)
    bpy.ops.mesh.primitive_torus_add(major_radius=.155, minor_radius=.012, major_segments=96, minor_segments=8)
    t = bpy.context.active_object; t.name = f'ear_ring_{s_}'; t.data.materials.append(M_BLUE)
    t.matrix_world = E @ Matrix.Translation((0, -.278, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    for p in t.data.polygons: p.use_smooth = True

# ---- 打光:中性攝影棚光(暖白主光、冷白補光、上光、背後輪廓光)+ 看不見的柔光板(只給反光用)----
def light(name, kind, loc, energy, color=(1, 1, 1), size=1.0, aim=(0, 0, 0)):
    L = bpy.data.lights.new(name, kind); L.energy = energy; L.color = color
    if kind == 'AREA': L.size = size
    o = bpy.data.objects.new(name, L); scene.collection.objects.link(o); o.location = loc
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y'); return o
light('key', 'AREA', (-2.3, -3.2, 2.6), 680, (1, .96, .9), 2.0)
light('fill', 'AREA', (3.0, -2.6, .3), 95, (.88, .94, 1), 2.6).visible_glossy = False
light('top', 'AREA', (0, -.3, 3.2), 200, (1, 1, 1), 2.0).visible_glossy = False
light('rimL', 'AREA', (-2.6, 2.2, 1.0), 520, (.85, .9, 1), 1.6)
light('rimR', 'AREA', (2.6, 2.2, -.2), 460, (.9, .93, 1), 1.6)
light('bounce', 'AREA', (0, -2.2, -2.8), 40, (1, .9, .8), 2.5).visible_glossy = False
M_SOFT = mat('softbox', '#000000', 1, emit='#ffffff', k=9)
def softbox(name, loc, sx, sz):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc); o = bpy.context.active_object; o.name = name; o.scale = (sx, sz, 1)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('Z', 'Y')
    o.data.materials.append(M_SOFT); o.visible_camera = False; o.visible_diffuse = False; o.visible_shadow = False
    return o
softbox('sb_win', (-1.6, -2.8, 1.7), 1.5, .9)              # 左上大窗 → 面罩左上的亮反光
softbox('sb_strip', (2.0, -2.4, .1), .25, 1.8)            # 右邊細長條 → 面罩右側直條反光
softbox('sb_low', (.4, -2.6, -1.9), 1.2, .18)             # 下面一條淡淡的
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (.012, .013, .016, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1
cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = 2.6
cam = bpy.data.objects.new('cam', cd); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (0, -6, 0); cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = Vector((0, 1, 0)).to_track_quat('-Z', 'Y')
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
for dv in prefs.devices: dv.use = True
scene.cycles.device = 'GPU'; scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'

def glass_pass():
    """只留玻璃的反光:其他物件 holdout;玻璃 = 純反射(邊緣更亮)。網頁用 mix-blend-mode: screen 疊上去 → 只會變亮,不會把表情壓暗"""
    for o in scene.objects:
        if o.type == 'MESH' and o.name != 'glass': o.is_holdout = True
    m = bpy.data.materials.new('glass_refl'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); mix = nt.nodes.new('ShaderNodeMixShader')
    g1 = nt.nodes.new('ShaderNodeBsdfGlossy'); g1.inputs['Roughness'].default_value = .04; g1.inputs['Color'].default_value = (.4, .42, .45, 1)
    g2 = nt.nodes.new('ShaderNodeBsdfGlossy'); g2.inputs['Roughness'].default_value = .04
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .3
    nt.links.new(lw.outputs['Fresnel'], mix.inputs['Fac']); nt.links.new(g1.outputs[0], mix.inputs[1]); nt.links.new(g2.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs['Surface'])
    glass.data.materials.clear(); glass.data.materials.append(m)

mode = ARGS[0] if ARGS else 'preview'
if mode == 'preview':
    scene.cycles.samples = int(ARGS[2]) if len(ARGS) > 2 else 96
    scene.render.resolution_x = scene.render.resolution_y = 800
    scene.render.filepath = os.path.abspath(ARGS[1]); bpy.ops.render.render(write_still=True)
    glass_pass(); scene.render.filepath = os.path.abspath(ARGS[1]).replace('.png', '_glass.png'); bpy.ops.render.render(write_still=True); print('rendered')
else:
    out = os.path.abspath(ARGS[1]); os.makedirs(out, exist_ok=True); scene.cycles.samples = int(ARGS[2]) if len(ARGS) > 2 else 200
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.color_mode = 'RGBA'; scene.render.image_settings.quality = 92
    scene.render.filepath = os.path.join(out, 'helm.webp'); bpy.ops.render.render(write_still=True)
    glass_pass(); scene.render.filepath = os.path.join(out, 'helm_glass.webp'); bpy.ops.render.render(write_still=True); print('done')
