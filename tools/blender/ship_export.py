# 把 ship_build.py 蓋好的戰艦匯出成網頁用的 glb(public/assets/starship/models/ship.glb):
#   1) 白色裝甲(ship_white / ship_pearl,板塊接縫 + 角落髒污 + 板邊高光都是程序材質)→ 合併、自動展 UV、烘成一張 4096 底色貼圖
#   2) 深色玻璃立面(上千個隨機亮暗的小窗)→ 合併、展 UV、烘成一張 2048 發光貼圖
#   3) 其他材質(燈條、金屬、草地、樹…)照原樣,同材質的物件合成一個,draw call 少
#   4) 護航小艦保留成獨立物件 escort_N(網頁上讓它們慢慢飄),材質換成簡單白色
# 星球、燈光、鏡頭不匯出(星球網頁上用 shader 另外畫)。
# 用法:blender -b --python tools/blender/ship_export.py -- [輸出 glb] [貼圖倍率 = 1.0]
import bpy, sys, os, runpy, time, math

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0]) if ARGS else os.path.join(ROOT, '..', '..', 'public', 'assets', 'starship', 'models', 'ship.glb')
SCALE = float(ARGS[1]) if len(ARGS) > 1 else 1.0
TMP = os.path.join(ROOT, 'bake_tmp'); os.makedirs(TMP, exist_ok=True)
t0 = time.time()
def log(*a): print('[ship %5.0fs]' % (time.time() - t0), *a, flush=True)

sys.argv = [sys.argv[0], '--', 'build']
runpy.run_path(os.path.join(ROOT, 'ship_build.py'), run_name='__main__')
scene = bpy.context.scene
log('built', len(scene.objects), 'objects')

def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
def join(objs, name):
    select_only(objs); bpy.ops.object.convert(target='MESH')
    objs = list(bpy.context.selected_objects); select_only(objs)
    bpy.ops.object.make_single_user(object=True, obdata=True); bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name; o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); return o
def unwrap(o, margin=.002):
    me = o.data
    while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='uv'); select_only([o])
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, scale_to_bounds=False)
    try: bpy.ops.uv.pack_islands(rotate=True, margin=margin, shape_method='CONCAVE')
    except Exception: bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
def mat_of(o): return o.active_material.name if o.type in ('MESH', 'CURVE', 'FONT') and o.active_material else None

meshes = [o for o in scene.objects if o.type in ('MESH', 'CURVE', 'FONT')]
escorts = [o for o in meshes if o.name.startswith('escort_')]
rest = [o for o in meshes if o not in escorts]
WHITE = ('ship_white', 'ship_pearl')
big = lambda o: max(o.dimensions) > 3.0 and not o.name.startswith(('kit_', 'greeble_', 'hub_fin_', 'engine_fin', 'collar_strut', 'dish', 'seam_'))
g_white = [o for o in rest if mat_of(o) in WHITE and big(o)]
g_small = [o for o in rest if mat_of(o) in WHITE and not big(o)]          # 小零件不烘(貼圖留給大面),直接用單色
g_facade = [o for o in rest if mat_of(o) == 'ship_facade']
log('white', len(g_white), 'facade', len(g_facade))

scene.render.engine = 'CYCLES'; scene.cycles.device = 'GPU'
prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
for dv in prefs.devices: dv.use = True
bk = scene.render.bake; bk.margin = 8; bk.margin_type = 'EXTEND'; bk.target = 'IMAGE_TEXTURES'

def bake(o, kind, size, name, samples):
    img = bpy.data.images.new(name, size, size, alpha=False)
    for slot in o.material_slots:
        nt = slot.material.node_tree; n = nt.nodes.get('__bake__') or nt.nodes.new('ShaderNodeTexImage'); n.name = '__bake__'; n.image = img; nt.nodes.active = n
    select_only([o]); scene.cycles.samples = samples
    if kind == 'DIFFUSE':
        bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.use_pass_color = True
    log('baking', name, kind, size)
    bpy.ops.object.bake(type=kind)
    path = os.path.join(TMP, name + '.png'); img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    return path

def simple(name, base=None, tex=None, emit_tex=None, rough=.35, metal=.2, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']; L = m.node_tree.links
    if base: p.inputs['Base Color'].default_value = base
    if tex: t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(tex); L.new(t.outputs['Color'], p.inputs['Base Color'])
    if emit_tex:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(emit_tex); L.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = 1.0
    p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal; p.inputs['Coat Weight'].default_value = coat
    return m
def set_mat(o, m):
    o.data.materials.clear(); o.data.materials.append(m)
    for poly in o.data.polygons: poly.material_index = 0
# 護航小艦:每艘(機身 + 翼 + 噴口光)合成一個物件 escort_N,原點放在船中心
escort_objs = []; escort_names = [o.name for o in escorts]
white = simple('escort_white', base=(.82, .82, .8, 1), rough=.3, metal=.2)
for k in range(10):
    parts = [bpy.data.objects[n] for n in escort_names if n.split('_')[1] == str(k)]
    if not parts: continue
    for o in parts:
        if not o.name.endswith('_glow'): set_mat(o, white) if o.type == 'MESH' else None
    e = join(parts, f'escort_{k}')
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS'); escort_objs.append(e)

hull = join(g_white, 'ship_hull'); unwrap(hull, .0015)
hull_png = bake(hull, 'DIFFUSE', int(4096 * SCALE), 'ship_hull_albedo', 32)
fac = join(g_facade, 'ship_facade'); unwrap(fac, .003)
fac_png = bake(fac, 'EMIT', int(2048 * SCALE), 'ship_facade_emit', 4)

set_mat(hull, simple('ship_hull', tex=hull_png, rough=.3, metal=.25))
small_w = [o for o in g_small if mat_of(o) == 'ship_white']; small_p = [o for o in g_small if mat_of(o) == 'ship_pearl']
sw = simple('ship_small_white', base=(.8, .79, .76, 1), rough=.32, metal=.2); sp = simple('ship_small_pearl', base=(.6, .63, .68, 1), rough=.35, metal=.45)
for o in small_w: set_mat(o, sw) if o.type == 'MESH' else None
for o in small_p: set_mat(o, sp) if o.type == 'MESH' else None
set_mat(fac, simple('ship_facade', base=(.006, .008, .012, 1), emit_tex=fac_png, rough=.1, metal=.3))

# 其他材質:同材質合成一個物件
groups = {}
for o in rest:
    if o in g_white or o in g_facade: continue
    try: o.name
    except ReferenceError: continue
    groups.setdefault(mat_of(o), []).append(o)
merged = [hull, fac]
for mname, objs in groups.items():
    if not mname or not objs: continue
    merged.append(join(objs, 'ship_' + mname.replace('ship_', '')))
    log('merged', mname, len(objs))
merged += escort_objs
select_only(merged)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_image_format='WEBP', export_image_quality=88)
log('exported', OUT, os.path.getsize(OUT) // 1024, 'KB')
