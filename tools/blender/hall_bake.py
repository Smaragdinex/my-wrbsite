# 把 hall_build.py 建好的大廳「烘焙」成網頁用的模型:
#   1) 建築依區域分成 4 組(地板 / 牆與柱子 / 門框與展示艙 / 天花板),各自合併成一個網格、自動展 UV
#   2) 用 Cycles 把光影(直接光 + 反彈光 + 自發光燈條)烘進每組一張貼圖(套 AgX 色調,網頁直接當成不受光的貼圖顯示)
#   3) 匯出 hall_baked.glb(烘焙建築 + 展示艙螢幕)與 hall_props.glb(植物、家具,保留原本材質,網頁上即時打光)
# 用法:blender -b --python tools/blender/hall_bake.py -- <輸出資料夾> [samples=512] [大小倍率=1.0]
import bpy, sys, os, math, runpy, time

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = os.path.abspath(ARGS[0]) if ARGS else os.path.join(ROOT, '..', '..', 'public', 'assets', 'starship', 'models')
SAMPLES = int(ARGS[1]) if len(ARGS) > 1 else 512
SCALE = float(ARGS[2]) if len(ARGS) > 2 else 1.0
TMP = os.path.join(ROOT, 'bake_tmp'); os.makedirs(TMP, exist_ok=True); os.makedirs(OUT_DIR, exist_ok=True)
t0 = time.time()
def log(*a): print('[bake %5.0fs]' % (time.time() - t0), *a, flush=True)

# ---- 1. 建場景(不渲染)----
sys.argv = [sys.argv[0], '--', 'build', os.path.join(TMP, 'hall.png')]
runpy.run_path(os.path.join(ROOT, 'hall_build.py'), run_name='__main__')
scene = bpy.context.scene
log('scene built', len(bpy.data.objects), 'objects')

# ---- 2. 分組 ----
SKIP = ('prop_', 'screen_', 'signtext_', 'holo_', 'door_light_', 'cut_', 'sign_')     # 不烘:網頁上另外做的(招牌、全息、門框燈帶)或另外匯出的
def group_of(n):
    if n.startswith(SKIP) and not n.startswith('screen_bezel_'): return None
    if n.startswith(('tile_', 'floor_base', 'inlay_', 'warm_ring_', 'pad')): return 'floor'
    if n.startswith(('door_frame_', 'door_step_', 'cabin_', 'screen_bezel_')): return 'doors'
    if n.startswith(('rib', 'clerestory_glass', 'ring_low', 'ring_high', 'ceiling', 'ceil_beam', 'oculus_', 'column', 'emitter_')): return 'ceiling'
    return 'walls'
SIZES = {'floor': 4096, 'walls': 4096, 'doors': 4096, 'ceiling': 2048}   # 最終品質;測試時用倍率縮小
groups = {}
for o in list(scene.objects):
    if o.type not in ('MESH', 'CURVE'): continue
    g = group_of(o.name)
    if g: groups.setdefault(g, []).append(o)
for g, l in groups.items(): log('group', g, len(l), 'objects')

def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]

# ---- 3. 每組:套用修改器 → 合併 → 只留一組新的 UV → 自動展開 ----
joined = {}
for g, objs in groups.items():
    select_only(objs)
    bpy.ops.object.convert(target='MESH')                 # 曲線轉網格 + 套用倒角 / 布林 / 線框
    objs = [o for o in bpy.context.selected_objects]
    select_only(objs)
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = f'baked_{g}'
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = ob.data
    while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name='bake'); me.uv_layers.active = uv
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0025, area_weight=0.0, scale_to_bounds=False)
    try: bpy.ops.uv.pack_islands(rotate=True, margin=0.0025, shape_method='CONCAVE')    # 環形的島塞進別的環裡,貼圖不浪費
    except Exception as e: log('pack_islands fallback', e); bpy.ops.uv.pack_islands(rotate=True, margin=0.0025)
    bpy.ops.object.mode_set(mode='OBJECT')
    joined[g] = ob
    log('joined', g, len(me.polygons), 'faces')

# ---- 4. 烘焙 ----
scene.render.engine = 'CYCLES'; scene.cycles.device = 'GPU'; scene.cycles.samples = SAMPLES
scene.cycles.bake_type = 'COMBINED'
bk = scene.render.bake
bk.use_pass_direct = True; bk.use_pass_indirect = True
bk.use_pass_diffuse = True; bk.use_pass_glossy = False; bk.use_pass_transmission = False; bk.use_pass_emit = True
bk.margin = 12; bk.margin_type = 'EXTEND'; bk.target = 'IMAGE_TEXTURES'
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_depth = '8'
baked_png = {}
for g, ob in joined.items():
    size = int(SIZES[g] * SCALE)
    img = bpy.data.images.new(f'bake_{g}', size, size, float_buffer=True, alpha=False)
    for slot in ob.material_slots:
        m = slot.material
        if not m or not m.use_nodes: continue
        n = m.node_tree.nodes.get('__bake__') or m.node_tree.nodes.new('ShaderNodeTexImage'); n.name = '__bake__'
        n.image = img; m.node_tree.nodes.active = n
    select_only([ob])
    log('baking', g, size, 'px', SAMPLES, 'samples ...')
    bpy.ops.object.bake(type='COMBINED')
    path = os.path.join(TMP, f'bake_{g}.png')
    img.save_render(path, scene=scene)                    # 套用場景的 AgX 色調 → 網頁上不用再做色調映射
    baked_png[g] = path
    log('saved', path)

# ---- 5. 換成只有一張烘焙貼圖的材質,匯出 ----
for g, ob in joined.items():
    m = bpy.data.materials.new(f'baked_{g}'); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']; it = m.node_tree.nodes.new('ShaderNodeTexImage'); it.image = bpy.data.images.load(baked_png[g])
    m.node_tree.links.new(it.outputs['Color'], p.inputs['Base Color'])
    ob.data.materials.clear(); ob.data.materials.append(m)
    for poly in ob.data.polygons: poly.material_index = 0

GLTF = dict(export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_image_format='WEBP')
screens = [o for o in scene.objects if o.name.startswith('screen_') and not o.name.startswith('screen_bezel_')]
select_only(list(joined.values()) + screens)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, 'hall_baked.glb'), export_normals=False, export_image_quality=86, **GLTF)
log('exported hall_baked.glb', os.path.getsize(os.path.join(OUT_DIR, 'hall_baked.glb')) // 1024, 'KB')
props = [o for o in scene.objects if o.name.startswith('prop_')]
# 減面:植物家具超過 2 萬三角形的網格先簡化(網頁 / 手機跑得動;看起來幾乎一樣)
for o in props:
    if o.type != 'MESH': continue
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris > 20000:
        o.data = o.data.copy()   # 共用網格的複製品,各自減面才不會互相影響
        d = o.modifiers.new('decimate', 'DECIMATE'); d.ratio = max(.12, 18000 / tris)
        log('decimate', o.name, tris, '→', int(tris * d.ratio))
# 粗糙度圖(16-bit 灰階)匯出器存不了 → 匯出前先把這類貼圖斷開,改用固定粗糙度,免得 glb 裡出現沒有來源的貼圖
for o in props:
    for slot in getattr(o, 'material_slots', []):
        m = slot.material
        if not m or not m.use_nodes: continue
        for n in list(m.node_tree.nodes):
            if n.type == 'TEX_IMAGE' and n.image and 'rough' in n.image.name.lower():   # 粗糙度圖多半是 16-bit 灰階,匯出器轉不了
                for l in list(n.outputs[0].links): l.to_socket.default_value = .45 if l.to_socket.type == 'VALUE' else l.to_socket.default_value; m.node_tree.links.remove(l)
                m.node_tree.nodes.remove(n)
select_only(props)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, 'hall_props.glb'), export_normals=True, export_image_quality=80, **GLTF)
log('exported hall_props.glb', os.path.getsize(os.path.join(OUT_DIR, 'hall_props.glb')) // 1024, 'KB')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TMP, 'hall_baked.blend'))
log('done')
