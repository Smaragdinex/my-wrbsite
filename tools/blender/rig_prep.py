# 用法:blender -b -P rig_prep.py -- <Tripo glb> <輸出 .blend>(只給 rig_measure.py 量尺寸用)
# Tripo 兔子前處理:縮放成高 1.9、置中(和舊兔子同一套座標)→ 減面到約 3 萬面 → 存 .blend
import bpy, sys, mathutils
a=sys.argv[sys.argv.index('--')+1:]; SRC,OUT=a[0],a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
me=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]; me.name='Bunny'
bb=[me.matrix_world@mathutils.Vector(c) for c in me.bound_box]
z0=min(v.z for v in bb); z1=max(v.z for v in bb); k=1.9/(z1-z0)
me.data.transform(mathutils.Matrix.Translation((0,0,-(z0+z1)/2)))
me.data.transform(mathutils.Matrix.Scale(k,4))
bpy.context.view_layer.objects.active=me; me.select_set(True)
pass   # 量尺寸用,不減面
bpy.ops.object.shade_smooth()
print('faces',len(me.data.polygons),'verts',len(me.data.vertices))
bpy.ops.wm.save_as_mainfile(filepath=OUT)
