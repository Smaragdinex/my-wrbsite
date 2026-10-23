# 把使用者用 Tripo 做的貓、兔子整理成網頁用的小模型 → assets/critters/cat.glb、bunny.glb
#   拿掉 Tripo 的人形骨架(動物套人的骨架很怪,網頁上整隻用跳的就好)、兔子從 190 萬面減到約 2 萬面、
#   原點放在腳底中心、高度統一成 1(room_build.py 再縮放)、面朝 -Y、貼圖縮到 1024(底色 / 法線)
# 用法:blender -b --python tools/blender/critters_prep.py
import bpy, os, glob, math
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(ROOT, 'assets', 'critters')
SRC = {'cat': glob.glob(os.path.join(D, 'src', 'cat', '*.fbx'))[0], 'bunny': os.path.join(D, 'src', 'bunny.glb')}
TARGET_TRIS = 22000

def prep(kind, path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path)
    else: bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in meshes:                                                               # 骨架拿掉,保留目前(靜止)的形狀
        for m in list(o.modifiers):
            if m.type == 'ARMATURE': o.modifiers.remove(m)
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']: bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action='SELECT'); bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = kind
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris > TARGET_TRIS:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=.00005); bpy.ops.object.mode_set(mode='OBJECT')   # Tripo 的三角形各自分開 → 先黏起來才減得動
        for _ in range(3):
            now = sum(len(p.vertices) - 2 for p in o.data.polygons)
            if now <= TARGET_TRIS * 1.15: break
            d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = TARGET_TRIS / now; d.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=d.name)
    me = o.data; zs = [v.co.z for v in me.vertices]; xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    h = max(zs) - min(zs); off = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)))
    for v in me.vertices: v.co = (v.co - off) / h                                   # 腳底中心 = 原點,高度 = 1
    for p in me.polygons: p.use_smooth = True
    for m in me.materials:                                                          # 貼圖縮到 1024(粗糙 / 金屬那張拿掉:網頁上一律霧面)
        if not m or not m.use_nodes: continue
        nt = m.node_tree; pb = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        for n in list(nt.nodes):
            if n.type != 'TEX_IMAGE' or not n.image: continue
            nm = n.image.name.lower()
            if any(k in nm for k in ('metal', 'rough', '_rm')):
                nt.nodes.remove(n); continue
            if max(n.image.size) > 1024: n.image.scale(1024, 1024)
        if pb:
            pb.inputs['Metallic'].default_value = 0; pb.inputs['Roughness'].default_value = .62
    out = os.path.join(D, f'{kind}.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True, export_image_format='WEBP', export_image_quality=86,
                              export_draco_mesh_compression_enable=False)
    print(kind, 'tris', tris, '->', sum(len(p.vertices) - 2 for p in me.polygons), 'size', os.path.getsize(out) // 1024, 'KB', 'mats', [m.name for m in me.materials])

for k, p in SRC.items(): prep(k, p)
