# 把 room_build.py 建好的作品艙「烘焙」成網頁用的模型(做法跟 hall_bake.py 一樣):
#   1) 依區域分組(地板 / 牆 / 天花板 / 家具),各自合併成一個網格、自動展 UV
#   2) Cycles 把光影(直接 + 反彈 + 自發光)烘進每組一張貼圖(套 AgX 色調,網頁直接當不受光的貼圖)
#   3) 匯出 room_<房間>.glb(烘焙建築 + 作品螢幕 + 霓虹字 + 窗)與 room_<房間>_props.glb(植物,網頁即時打光)
# 用法:blender -b --python tools/blender/room_bake.py -- <room> [輸出資料夾] [samples=384] [大小倍率=1.0]
import bpy, sys, os, math, runpy, time

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOM = ARGS[0] if ARGS else 'kitty'
OUT_DIR = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else os.path.join(ROOT, '..', '..', 'public', 'assets', 'starship', 'models')
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 384
SCALE = float(ARGS[3]) if len(ARGS) > 3 else 1.0
TMP = os.path.join(ROOT, 'bake_tmp'); os.makedirs(TMP, exist_ok=True); os.makedirs(OUT_DIR, exist_ok=True)
t0 = time.time()
def log(*a): print('[bake %5.0fs]' % (time.time() - t0), *a, flush=True)

sys.argv = [sys.argv[0], '--', ROOM, 'build', os.path.join(TMP, f'room_{ROOM}.png')]
runpy.run_path(os.path.join(ROOT, 'room_build.py'), run_name='__main__')
scene = bpy.context.scene
log('scene built', len(bpy.data.objects), 'objects')

# ---- 分組 ----
LIVE = ('prop_', 'screen_', 'neon_', 'window_')                                  # 不烘:網頁另外做(植物即時打光、作品畫面、霓虹字、窗外星空)
def group_of(n):
    if n.startswith(LIVE): return None
    if n.startswith(('tile_', 'floor_base')): return 'floor'
    if n.startswith(('ceiling', 'cove_', 'covel_', 'ceil_panel')): return 'ceiling'
    if n.startswith(('wall_', 'wf_', 'flute_', 'rail_', 'wains_', 'paper_', 'base_', 'art_')): return 'walls'
    return 'furn'
SIZES = {'floor': 4096, 'walls': 4096, 'ceiling': 2048, 'furn': 4096}
groups = {}
for o in list(scene.objects):
    if o.type not in ('MESH', 'CURVE', 'FONT'): continue
    g = group_of(o.name)
    if g: groups.setdefault(g, []).append(o)
for g, l in groups.items(): log('group', g, len(l), 'objects')

def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]

joined = {}
for g, objs in groups.items():
    select_only(objs); bpy.ops.object.convert(target='MESH')
    objs = list(bpy.context.selected_objects); select_only(objs)
    bpy.ops.object.make_single_user(object=True, obdata=True); bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = f'baked_{g}'
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = ob.data
    while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name='bake'); me.uv_layers.active = uv
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003, area_weight=0.0, scale_to_bounds=False)
    try: bpy.ops.uv.pack_islands(rotate=True, margin=0.003, shape_method='CONCAVE')
    except Exception as e: log('pack_islands fallback', e); bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    joined[g] = ob; log('joined', g, len(me.polygons), 'faces')

scene.render.engine = 'CYCLES'; scene.cycles.device = 'GPU'; scene.cycles.samples = SAMPLES
scene.cycles.bake_type = 'COMBINED'
bk = scene.render.bake
bk.use_pass_direct = True; bk.use_pass_indirect = True
bk.use_pass_diffuse = True; bk.use_pass_glossy = False; bk.use_pass_transmission = False; bk.use_pass_emit = True
bk.margin = 12; bk.margin_type = 'EXTEND'; bk.target = 'IMAGE_TEXTURES'
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_depth = '8'
MOVERS = [o for o in scene.objects if o.name.startswith(('prop_train_', 'prop_cat_', 'prop_rabbit_'))]   # 網頁上會動的東西(火車、棋子):烘光時藏起來,不然影子烘死在原地
for o in MOVERS: o.hide_render = True
baked_png = {}
for g, ob in joined.items():
    size = int(SIZES[g] * SCALE)
    img = bpy.data.images.new(f'bake_{ROOM}_{g}', size, size, float_buffer=True, alpha=False)
    for slot in ob.material_slots:
        m = slot.material
        if not m or not m.use_nodes: continue
        for pn in m.node_tree.nodes:                                              # 金屬只烘漫射會全黑 → 當成同顏色的非金屬
            if pn.type == 'BSDF_PRINCIPLED':
                for l in list(pn.inputs['Metallic'].links): m.node_tree.links.remove(l)
                pn.inputs['Metallic'].default_value = 0.0
        n = m.node_tree.nodes.get('__bake__') or m.node_tree.nodes.new('ShaderNodeTexImage'); n.name = '__bake__'
        n.image = img; m.node_tree.nodes.active = n
    select_only([ob]); log('baking', g, size, 'px', SAMPLES, 'samples ...')
    bpy.ops.object.bake(type='COMBINED')
    path = os.path.join(TMP, f'bake_{ROOM}_{g}.png'); img.save_render(path, scene=scene); baked_png[g] = path; log('saved', path)

for g, ob in joined.items():
    m = bpy.data.materials.new(f'baked_{g}'); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']; it = m.node_tree.nodes.new('ShaderNodeTexImage'); it.image = bpy.data.images.load(baked_png[g])
    m.node_tree.links.new(it.outputs['Color'], p.inputs['Base Color'])
    ob.data.materials.clear(); ob.data.materials.append(m)
    for poly in ob.data.polygons: poly.material_index = 0

GLTF = dict(export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_image_format='WEBP')
live = [o for o in scene.objects if o.name.startswith(('screen_', 'neon_', 'window_')) and o.type in ('MESH', 'FONT', 'CURVE')]
fonts = [o for o in live if o.type != 'MESH']
if fonts: select_only(fonts); bpy.ops.object.convert(target='MESH')
live = [o for o in scene.objects if o.name.startswith(('screen_', 'neon_', 'window_')) and o.type == 'MESH']
select_only(list(joined.values()) + live)
f = os.path.join(OUT_DIR, f'room_{ROOM}.glb')
bpy.ops.export_scene.gltf(filepath=f, export_normals=False, export_image_quality=86, **GLTF); log('exported', f, os.path.getsize(f) // 1024, 'KB')
for o in MOVERS: o.hide_render = False
props = [o for o in scene.objects if o.name.startswith('prop_')]
for o in props:
    if o.type != 'MESH': continue
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris > 20000:
        o.data = o.data.copy(); d = o.modifiers.new('decimate', 'DECIMATE'); d.ratio = max(.12, 18000 / tris); log('decimate', o.name, tris)
for o in props:
    for slot in getattr(o, 'material_slots', []):
        m = slot.material
        if not m or not m.use_nodes: continue
        for n in list(m.node_tree.nodes):
            if n.type == 'TEX_IMAGE' and n.image and 'rough' in n.image.name.lower():
                for l in list(n.outputs[0].links): m.node_tree.links.remove(l)
                m.node_tree.nodes.remove(n)
if props:
    select_only(props); f = os.path.join(OUT_DIR, f'room_{ROOM}_props.glb')
    bpy.ops.export_scene.gltf(filepath=f, export_normals=True, export_image_quality=80, **GLTF); log('exported', f, os.path.getsize(f) // 1024, 'KB')
log('done')
