# 做手機 / 平板用的「小貼圖版」模型:X.glb → X_m.glb(另外 ship_light.webp → ship_light_m.webp)
#   只把 glb 裡面嵌的圖片縮小、重新打包,幾何、材質、物件名稱一個 byte 都不動(網頁上 _m 跟原本的可以直接互換)。
#   原因:原版大貼圖(4096)全部加起來 GPU 要 2.5GB、解碼又再吃一份記憶體 → iPhone / iPad 的 Safari 直接當掉(「無法打開網頁」)。
#   縮多少:戰艦 / 大廳 / 通道 → 一半;五間房的建築(一次只看一間)→ 1/4;植物家具 → 一半;1024 以下的小圖不動。
#   另外大廳的植物家具(hall_props_m.glb)再減面成低多邊形版(行動裝置用;植物葉子最多面)。
#   每次重烘 ship / hall / room 之後都要再跑一次。
# 用法:blender -b --python tools/blender/make_mobile.py
import bpy, os, json, struct, glob, tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.abspath(os.path.join(ROOT, '..', '..', 'public', 'assets', 'starship', 'models'))
TMP = tempfile.mkdtemp(prefix='mobile_')

def rule(name):
    """回傳 (最小要縮的邊長, 縮幾倍)"""
    if name.startswith('room_') and not name.endswith('_props.glb'): return 2048, 4
    return 1024, 2

def shrink_image(data, mime, k, tag):
    ext = {'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg'}[mime]
    src = os.path.join(TMP, tag + ext); open(src, 'wb').write(data)
    img = bpy.data.images.load(src); w, h = img.size
    img.scale(max(1, w // k), max(1, h // k))
    dst = os.path.join(TMP, tag + '_s.webp')
    img.file_format = 'WEBP'; img.filepath_raw = dst; img.save(filepath=dst, quality=88)
    bpy.data.images.remove(img)
    return open(dst, 'rb').read(), (w, h)

def webp_size(d):
    if d[:4] != b'RIFF' or d[8:12] != b'WEBP': return None
    ch = d[12:16]
    if ch == b'VP8 ': return struct.unpack('<H', d[26:28])[0] & 0x3fff, struct.unpack('<H', d[28:30])[0] & 0x3fff
    if ch == b'VP8L': b = struct.unpack('<I', d[21:25])[0]; return (b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1
    if ch == b'VP8X': return 1 + int.from_bytes(d[24:27], 'little'), 1 + int.from_bytes(d[27:30], 'little')
    return None

def process(path):
    name = os.path.basename(path); out = path[:-4] + '_m.glb'
    b = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<4sII', b[:12]); assert magic == b'glTF'
    jlen, jtype = struct.unpack('<I4s', b[12:20]); j = json.loads(b[20:20 + jlen])
    off = 20 + jlen; blen, btype = struct.unpack('<I4s', b[off:off + 8]); bin_ = b[off + 8:off + 8 + blen]
    views = j.get('bufferViews', []); chunks = [bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]
    mn, k = rule(name); n = 0
    for i, im in enumerate(j.get('images', [])):
        if 'bufferView' not in im: continue
        data = chunks[im['bufferView']]; sz = webp_size(data)
        if sz and max(sz) < mn: continue
        new, (w, h) = shrink_image(data, im.get('mimeType', 'image/webp'), k, f'{name}_{i}')
        if max(w, h) < mn: continue
        chunks[im['bufferView']] = new; im['mimeType'] = 'image/webp'; n += 1
        print(f'  {name} image {i}: {w}x{h} -> {w // k}x{h // k}', flush=True)
    nb = bytearray()
    for v, c in zip(views, chunks):
        while len(nb) % 4: nb.append(0)
        v['byteOffset'] = len(nb); v['byteLength'] = len(c); nb += c
    while len(nb) % 4: nb.append(0)
    j['buffers'][0]['byteLength'] = len(nb)
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    glb = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(nb)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(nb), b'BIN\x00') + bytes(nb)
    open(out, 'wb').write(glb)
    print(f'{name}: {n} images shrunk, {len(b) // 1024} KB -> {len(glb) // 1024} KB', flush=True)

for p in sorted(glob.glob(os.path.join(MODELS, '*.glb'))):
    if p.endswith('_m.glb'): continue
    process(p)
# 戰艦的光照貼圖(單獨一張 webp)
lm = os.path.join(MODELS, 'ship_light.webp')
if os.path.exists(lm):
    img = bpy.data.images.load(lm); w, h = img.size; img.scale(w // 2, h // 2)
    dst = os.path.join(MODELS, 'ship_light_m.webp'); img.file_format = 'WEBP'; img.filepath_raw = dst; img.save(filepath=dst, quality=88)
    print(f'ship_light.webp: {w}x{h} -> {w // 2}x{h // 2}', flush=True)

# ---- 低多邊形:大廳植物家具(葉子一片片面數很多)→ 面數 > 3000 的物件減到約 35%(最少留 1500 面),物件名稱、材質、階層都保留 ----
def lowpoly(name, ratio=.35, min_tris=3000):
    path = os.path.join(MODELS, name)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    tris = lambda me: sum(len(p.vertices) - 2 for p in me.polygons)
    groups = {}                                                             # 同一個網格被好幾個物件共用(同一盆植物擺好幾個)→ 減一次、其他物件指到減好的那份
    for o in bpy.context.scene.objects:
        if o.type == 'MESH': groups.setdefault(o.data, []).append(o)
    before = sum(tris(me) for me in groups); after = 0
    for me, objs in groups.items():
        n = tris(me)
        if n > min_tris:
            o = objs[0]; m = o.modifiers.new('decimate', 'DECIMATE'); m.ratio = max(ratio, 1500 / n)
            bpy.context.view_layer.objects.active = o; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
            bpy.ops.object.modifier_apply(modifier=m.name, single_user=True)
            for x in objs[1:]: x.data = o.data
        after += tris(objs[0].data)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False, export_yup=True, export_apply=True, export_cameras=False, export_lights=False,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_image_format='WEBP', export_image_quality=88)
    print(f'{name}: lowpoly {before // 1000}k -> {after // 1000}k tris, {os.path.getsize(path) // 1024} KB', flush=True)
lowpoly('hall_props_m.glb')
