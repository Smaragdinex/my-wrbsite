# 只重新匯出植物家具(hall_props.glb),不重新烘焙建築:建場景 → 減面 → 匯出。
# 用法:blender -b --python tools/blender/props_export.py -- <輸出資料夾>
import bpy, sys, os, runpy
ROOT = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = os.path.abspath(ARGS[0]) if ARGS else os.path.join(ROOT, '..', '..', 'public', 'assets', 'starship', 'models')
TMP = os.path.join(ROOT, 'bake_tmp'); os.makedirs(TMP, exist_ok=True)
sys.argv = [sys.argv[0], '--', 'build', os.path.join(TMP, 'props.png')]
runpy.run_path(os.path.join(ROOT, 'hall_build.py'), run_name='__main__')
props = [o for o in bpy.context.scene.objects if o.name.startswith('prop_')]
for o in props:
    if o.type != 'MESH': continue
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris > 20000:
        o.data = o.data.copy(); d = o.modifiers.new('decimate', 'DECIMATE'); d.ratio = max(.12, 18000 / tris)
bpy.ops.object.select_all(action='DESELECT')
for o in props: o.select_set(True)
bpy.context.view_layer.objects.active = props[0]
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, 'hall_props.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_image_format='WEBP', export_normals=True, export_image_quality=80)
print('PROPS_OK', os.path.getsize(os.path.join(OUT_DIR, 'hall_props.glb')) // 1024, 'KB')
