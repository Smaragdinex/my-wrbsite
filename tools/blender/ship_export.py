# 把 ship_build.py 蓋好的戰艦匯出成網頁用的 glb(public/assets/starship/models/ship.glb):
#   1) 白色裝甲(ship_white / ship_pearl,板塊接縫 + 角落髒污 + 板邊高光都是程序材質)→ 合併、自動展 UV、烘成一張 4096 底色貼圖
#   2) 深色玻璃立面(上千個隨機亮暗的小窗)→ 合併、展 UV、烘成一張 2048 發光貼圖
#   3) 其他材質(燈條、金屬、草地、樹…)照原樣,同材質的物件合成一個,draw call 少
#   4) 護航小艦保留成獨立物件 escort_N(網頁上讓它們慢慢飄):白 / 珍珠灰換成單色,深色、座艙玻璃、橘色飾條、舷窗、噴口、翼尖燈照原樣
# 星球、燈光、鏡頭不匯出(星球網頁上用 shader 另外畫)。
# 用法:blender -b --python tools/blender/ship_export.py -- [輸出 glb] [貼圖倍率 = 1.0]
import bpy, sys, os, runpy, time, math, json
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0]) if ARGS else os.path.join(ROOT, '..', '..', 'public', 'assets', 'starship', 'models', 'ship.glb')
SCALE = float(ARGS[1]) if len(ARGS) > 1 else 1.0
TMP = os.path.join(ROOT, 'bake_tmp'); os.makedirs(TMP, exist_ok=True)
t0 = time.time()
def log(*a): print('[ship %5.0fs]' % (time.time() - t0), *a, flush=True)

sys.argv = [sys.argv[0], '--', 'build']
G = runpy.run_path(os.path.join(ROOT, 'ship_build.py'), run_name='__main__')
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
radar_names = [o.name for o in meshes if o.name.startswith('radarhead_')]                 # 雷達會轉的部分:每座合成一個物件 radar_N,原點在轉軸(網頁上讓它轉)
rest = [o for o in meshes if o not in escorts and not o.name.startswith(('bay_', 'radarhead_'))]
g_bay = [o for o in meshes if o.name.startswith('bay_') and not o.name.startswith('bay_door_')]     # 機庫內部:烘光(含機庫裡的燈)
g_air_names = [o.name for o in meshes if o.name.startswith('bay_door_')]                                       # 氣閘門兩半:網頁上滑開
WHITE = ('ship_white', 'ship_pearl')
big = lambda o: max(o.dimensions) > 3.0 and not o.name.startswith(('kit_', 'greeble_', 'hub_fin_', 'engine_fin', 'collar_strut', 'dish', 'seam_'))
g_white = [o for o in rest if mat_of(o) in WHITE and big(o)]
g_small = [o for o in rest if mat_of(o) in WHITE and not big(o)]          # 小零件不烘(貼圖留給大面),直接用單色
g_facade = [o for o in rest if (mat_of(o) or '').startswith('ship_facade')]
g_gal = [o for o in rest if (mat_of(o) or '').startswith('ship_gallery_')]                 # 環臂長廊窗(看得到裡面的程序材質)→ 烘成發光貼圖
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
ESC = {'ship_white': simple('escort_white', base=(.86, .86, .84, 1), rough=.28, metal=.15, coat=.4), 'ship_pearl': simple('escort_pearl', base=(.62, .66, .72, 1), rough=.3, metal=.45)}   # 程序材質(板塊)換成單色;深色、玻璃、飾條、燈照原樣
for k in range(10):
    parts = [bpy.data.objects[n] for n in escort_names if n.split('_')[1] == str(k)]
    if not parts: continue
    for o in parts:
        if o.type == 'MESH' and mat_of(o) in ESC: set_mat(o, ESC[mat_of(o)])
    e = join(parts, f'escort_{k}')
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS'); escort_objs.append(e)

radar_objs = []
for k, (x, y, zp) in enumerate(G['RADARS']):
    parts = [bpy.data.objects[n] for n in radar_names if n.startswith(f'radarhead_{k}_')]
    for o in parts:
        if o.type == 'MESH' and mat_of(o) in ESC: set_mat(o, ESC[mat_of(o)])
    r = join(parts, f'radar_{k}'); scene.cursor.location = (x, y, zp); bpy.ops.object.origin_set(type='ORIGIN_CURSOR'); radar_objs.append(r)

# 機庫:合併、展 UV、COMBINED 烘光(只有機庫裡的燈 + 自發光;build 模式沒有太陽)→ 網頁上當不受光的貼圖
bay = join(g_bay, 'ship_bay'); unwrap(bay, .002)
img = bpy.data.images.new('ship_bay_lit', int(4096 * SCALE), int(4096 * SCALE), float_buffer=True, alpha=False)
for slot in bay.material_slots:
    nt = slot.material.node_tree; n = nt.nodes.get('__bake__') or nt.nodes.new('ShaderNodeTexImage'); n.name = '__bake__'; n.image = img; nt.nodes.active = n
select_only([bay]); scene.cycles.samples = 384
bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_diffuse = True; bk.use_pass_glossy = False; bk.use_pass_transmission = False; bk.use_pass_emit = True
log('baking bay COMBINED'); bpy.ops.object.bake(type='COMBINED')
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_depth = '8'
bay_png = os.path.join(TMP, 'ship_bay_lit.png'); img.save_render(bay_png, scene=scene)
set_mat(bay, simple('ship_bay', tex=bay_png, rough=1, metal=0))
air = []
door_white = simple('airlock_white', base=(.85, .85, .83, 1), rough=.3, metal=.2)
for side in ('L', 'R'):
    parts = [bpy.data.objects[n] for n in g_air_names if n.startswith(f'bay_door_{side}') and n in bpy.data.objects]
    log('airlock', side, [p.name for p in parts])
    for o in parts:
        if o.name == f'bay_door_{side}': set_mat(o, door_white)
    a = join(parts, f'airlock_{side}'); bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS'); air.append(a)
hull = join(g_white, 'ship_hull'); unwrap(hull, .0015)
hull_png = bake(hull, 'DIFFUSE', int(4096 * SCALE), 'ship_hull_albedo', 32)
# 光照貼圖:只開燈具(沒有太陽、沒有環境光),烘「燈打在船殼上」的照度(不含底色)→ 網頁上當 lightMap,燈旁邊才有光暈、越遠越暗
G['fixture_lights']()
LS = int(2048 * SCALE); limg = bpy.data.images.new('ship_hull_light_f', LS, LS, float_buffer=True, alpha=False)
for slot in hull.material_slots:
    n = slot.material.node_tree.nodes['__bake__']; n.image = limg; slot.material.node_tree.nodes.active = n
select_only([hull]); scene.cycles.samples = 512; scene.cycles.max_bounces = 3
bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_color = False
log('baking ship_hull_light DIFFUSE', LS); bpy.ops.object.bake(type='DIFFUSE')
px = np.array(limg.pixels[:], dtype=np.float32).reshape(LS, LS, 4)[..., :3]
def blur(a, r):                                                                 # 去雜訊:兩次小範圍方框模糊(光照本來就是平滑的)
    for ax in (0, 1):
        c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(3)], mode='edge'), axis=ax)
        a = (np.take(c, range(2 * r + 1, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a
px = blur(blur(px, 1), 1)
lum = px.max(axis=2); scale = 1 / max(1e-4, float(np.percentile(lum[lum > 1e-4], 99.6)) if (lum > 1e-4).any() else 1)
v = np.clip(px * scale, 0, 1); v = np.where(v <= .0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - .055)   # 存成 sRGB(暗部漸層不會一階一階)
oimg = bpy.data.images.new('ship_hull_light', LS, LS, alpha=False); oimg.pixels[:] = np.concatenate([v, np.ones((LS, LS, 1), np.float32)], axis=2).ravel()
LIGHT_OUT = os.path.join(os.path.dirname(OUT), 'ship_light.webp'); oimg.file_format = 'WEBP'; oimg.filepath_raw = LIGHT_OUT; oimg.save()
json.dump({'scale': scale}, open(os.path.join(os.path.dirname(OUT), 'ship_light.json'), 'w'))
log('light map', LIGHT_OUT, os.path.getsize(LIGHT_OUT) // 1024, 'KB', 'scale', round(scale, 4))
for o in [o for o in scene.objects if o.name.startswith('fx_')]: bpy.data.objects.remove(o)   # 燈只用來烘貼圖
fac = join(g_facade, 'ship_facade'); unwrap(fac, .003)
fac_alb = bake(fac, 'DIFFUSE', int(2048 * SCALE), 'ship_facade_albedo', 8)   # 窗框(灰色金屬)/ 玻璃(深色)
gal = join(g_gal, 'ship_gallery'); unwrap(gal, .003)
set_mat(gal, simple('ship_gallery', base=(.004, .004, .006, 1), rough=.12, metal=.2))   # 窗裡的房間由網頁 shader 算(interior mapping),不用烘發光貼圖(省下載量)

set_mat(hull, simple('ship_hull', tex=hull_png, rough=.3, metal=.25))
small_w = [o for o in g_small if mat_of(o) == 'ship_white']; small_p = [o for o in g_small if mat_of(o) == 'ship_pearl']
sw = simple('ship_small_white', base=(.8, .79, .76, 1), rough=.32, metal=.2); sp = simple('ship_small_pearl', base=(.6, .63, .68, 1), rough=.35, metal=.45)
for o in small_w: set_mat(o, sw) if o.type == 'MESH' else None
for o in small_p: set_mat(o, sp) if o.type == 'MESH' else None
set_mat(fac, simple('ship_facade', tex=fac_alb, rough=.14, metal=.35))   # 只要窗框底色;窗裡的房間由網頁 shader 算,不放發光貼圖(省 0.5MB)

# 其他材質:同材質合成一個物件
groups = {}
for o in rest:
    if o in g_white or o in g_facade or o in g_gal: continue
    try: o.name
    except ReferenceError: continue
    groups.setdefault(mat_of(o), []).append(o)
merged = [hull, fac, gal]
for mname, objs in groups.items():
    if not mname or not objs: continue
    merged.append(join(objs, 'ship_' + mname.replace('ship_', '')))
    log('merged', mname, len(objs))
merged += escort_objs + radar_objs + [bay] + air
select_only(merged)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_image_format='WEBP', export_image_quality=88)
log('exported', OUT, os.path.getsize(OUT) // 1024, 'KB')
