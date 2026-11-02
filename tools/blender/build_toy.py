# 用程式建角色模型(取代 Tripo):照設計圖正面量尺寸,用橢球 / 旋轉體拼出來,每塊一個純色
# 用法:blender -b -P build_toy.py -- <輸出 .blend 或 .glb> <角色 key>
#   .blend(建議):分件綁定 —— 每個零件整塊跟一根骨頭動(權重 100%),零件互相重疊把接縫藏起來,
#     像布偶 / 公仔的關節,怎麼轉都不會拉長或凹陷;接著直接跑 rig_bunny_anim.py 出動畫
#   .glb(舊):只輸出零件,再接 rig_bunny.py(體素重建融成一層外殼 + 自動權重)
#   座標和 rig_chars.py 一樣:高 1.9、上下置中;+X = 角色左手邊、-Y = 正面、+Z = 上
#   顏色:一張小色票貼圖,每個面的 UV 都指到自己那格的中心 → 烘焙出來是乾淨的純色,沒有雜點
import bpy, sys, math, numpy as np
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index('--')+1:]; OUT, CH = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)

PAL = []   # 色票:(r,g,b) 0~255
def col(rgb):
    if rgb not in PAL: PAL.append(rgb)
    return PAL.index(rgb)
PARTS = []   # (verts, faces, 色票 index, 骨頭)
BONE = 'chest'   # 接下來建的零件跟哪根骨頭動
BALLS = []   # 沒變形的橢球 (中心, 半徑):表情貼片避開被它們蓋住的面
def bone(n):
    global BONE; BONE = n

def ellipsoid(c, r, ci, rot=None, seg=48, ring=24, warp=None):
    # c 中心、r 三軸半徑;rot = (軸角度,繞 Y 轉,弧度) 讓手臂斜一點;warp(p) 可再改形狀
    v = []
    for i in range(ring+1):
        th = math.pi*i/ring
        for j in range(seg):
            ph = 2*math.pi*j/seg
            v.append((math.sin(th)*math.cos(ph), math.sin(th)*math.sin(ph), math.cos(th)))
    v = np.array(v)*np.array(r)
    if warp: v = warp(v)
    if rot: v = v@np.array(Matrix.Rotation(rot, 3, 'Y')).T
    if not warp and not rot: BALLS.append((np.array(c, float), np.array(r, float)))
    v = v+np.array(c)
    f = []
    for i in range(ring):
        for j in range(seg):
            a_, b_ = i*seg+j, i*seg+(j+1) % seg
            f.append((a_, b_, b_+seg, a_+seg))
    PARTS.append((v, f, ci, BONE, (ring+1, seg)))

def lathe(prof, ci, sy=0.8, cy=0.0, seg=64):
    # 旋轉體:prof = [(z, r), ...] 由上往下;Y 方向壓扁成 sy 倍(身體前後比左右薄)
    v = []
    for z, r in prof:
        for j in range(seg):
            ph = 2*math.pi*j/seg; v.append((r*math.cos(ph), cy+r*math.sin(ph)*sy, z))
    n = len(prof); v.append((0, cy, prof[0][0])); v.append((0, cy, prof[-1][0]))
    f = [(i*seg+j, i*seg+(j+1) % seg, (i+1)*seg+(j+1) % seg, (i+1)*seg+j) for i in range(n-1) for j in range(seg)]
    f += [(n*seg, (j+1) % seg, j) for j in range(seg)]
    f += [(n*seg+1, (n-1)*seg+j, (n-1)*seg+(j+1) % seg) for j in range(seg)]
    PARTS.append((np.array(v), f, ci, BONE, (n, seg)))

def limb(p0, p1, r0, r1, ci, n=None, seg=40, fy=1.0):
    # 手腳:膠囊(兩端半球、中間半徑漸變),沿 p0 → p1;fy < 1 = 前後壓扁(貓耳朵、企鵝翅膀)
    p0, p1 = np.array(p0, float), np.array(p1, float); L = np.linalg.norm(p1-p0)
    prof = [(-r0*math.cos(a_), r0*math.sin(a_)) for a_ in np.linspace(0, math.pi/2, 9)]
    prof += [(L*t, r0+(r1-r0)*t) for t in np.linspace(0, 1, 12)[1:-1]]
    prof += [(L+r1*math.sin(a_), r1*math.cos(a_)) for a_ in np.linspace(0, math.pi/2, 9)]
    v = []
    for z, r in prof:
        for j in range(seg):
            ph = 2*math.pi*j/seg; v.append((r*math.cos(ph), r*math.sin(ph), z))
    v = np.array(v); n_ = len(prof)
    R = np.array(Vector((0, 0, 1)).rotation_difference(Vector((p1-p0).tolist())).to_matrix())
    v = v@R.T+p0
    if fy != 1.0: v[:, 1] = p0[1]+(v[:, 1]-p0[1])*fy
    f = [(i*seg+j, i*seg+(j+1) % seg, (i+1)*seg+(j+1) % seg, (i+1)*seg+j) for i in range(n_-1) for j in range(seg)]
    PARTS.append((v, f, ci, BONE, (n_, seg)))

def mirror(fn, *args, **kw):
    for s in (1, -1): fn(s, *args, **kw)

SHO, ARM_A = (0.25, -0.18), math.radians(45)   # 肩關節 (x, z)、手臂往下的角度(rig_chars 的 arm 骨頭要對齊)
def bear():
    FUR, LIGHT, SHIRT, SHORTS = col((168, 112, 80)), col((240, 218, 190)), col((250, 204, 64)), col((118, 80, 56))
    bone('head')
    # 頭:下半部略寬(像豆子),正面稍平
    def head_w(p):
        p = p.copy(); low = np.clip(-p[:, 2]/0.49, 0, 1); p[:, 0] *= 1+0.07*low; p[:, 1] *= 1-0.06*np.clip(-p[:, 1]/0.5, 0, 1); return p
    ellipsoid((0, 0, 0.40), (0.60, 0.50, 0.48), FUR, warp=head_w, seg=64, ring=32)
    # 嘴邊淺色:臉前面凸出一塊
    ellipsoid((0, -0.40, 0.17), (0.20, 0.12, 0.145), LIGHT)
    # 耳朵:扁球 + 前面一片淺色內耳(整隻耳朵跟 ear1 骨頭動)
    for s, n in ((1, 'L'), (-1, 'R')):
        bone(f'ear1.{n}')
        ellipsoid((s*0.47, 0.04, 0.745), (0.205, 0.12, 0.205), FUR)
        ellipsoid((s*0.465, -0.05, 0.74), (0.12, 0.05, 0.12), LIGHT)
    bone('chest')
    # 上衣:脖子 → 肩 → 下襬微微外擴,下襬蓋住短褲上緣(身體前後彎時接縫藏在裡面)
    lathe([(-0.04, 0.0), (-0.05, 0.17), (-0.10, 0.27), (-0.16, 0.31), (-0.30, 0.33), (-0.46, 0.36), (-0.51, 0.37), (-0.53, 0.33)], SHIRT, sy=0.78)
    bone('hips')
    # 短褲:臀部 + 兩隻褲管 + 小尾巴
    lathe([(-0.42, 0.0), (-0.43, 0.30), (-0.56, 0.35), (-0.64, 0.35), (-0.68, 0.0)], SHORTS, sy=0.78)
    mirror(lambda s: ellipsoid((s*0.165, 0, -0.64), (0.165, 0.16, 0.075), SHORTS))
    ellipsoid((0, 0.29, -0.58), (0.08, 0.07, 0.08), FUR)
    for s, n in ((1, 'L'), (-1, 'R')):
        # 腿 + 腳掌(腳掌稍微往前);大腿頂端藏在褲管裡
        bone(f'leg.{n}')
        limb((s*0.16, 0, -0.58), (s*0.16, 0, -0.84), 0.13, 0.135, FUR)
        ellipsoid((s*0.16, -0.035, -0.87), (0.15, 0.175, 0.085), FUR)
        # 手:A 字(往下 45 度)放鬆垂著。肩膀是一顆以關節為中心的袖子球,手舉起來時球原地轉,不會露縫
        bone(f'arm.{n}')
        P = np.array((s*SHO[0], 0, SHO[1])); d = np.array((s*math.cos(ARM_A), 0, -math.sin(ARM_A)))
        ellipsoid(P, (0.15, 0.15, 0.15), SHIRT)
        limb(P, P+0.17*d, 0.15, 0.14, SHIRT)
        limb(P+0.10*d, P+0.40*d, 0.108, 0.118, FUR)
        ellipsoid(P+0.45*d, (0.112, 0.118, 0.112), FUR)


# ── 其他角色:同一套 Q 版身體(大頭、T 恤、短手短腳),頭的花紋 / 耳朵 / 配件各自不同 ──
TOYS = {}
HC = np.array((0, 0, 0.40))   # 頭的中心
def head_w(p):   # 頭:下半部略寬(像豆子),正面稍平
    p = p.copy(); low = np.clip(-p[:, 2]/0.49, 0, 1); p[:, 0] *= 1+0.07*low; p[:, 1] *= 1-0.06*np.clip(-p[:, 1]/0.5, 0, 1); return p
def head_rx(z, R=(0.60, 0.50, 0.48)):   # 頭在高度 z 的左右半徑(帽子、髮型貼著頭用)
    t = np.clip((z-HC[2])/R[2], -1, 1); return R[0]*math.sqrt(max(0.0, 1-t*t))
def pick(*pairs, default):   # 花紋:pick((條件函式, 顏色), ..., default=顏色) → 回傳 ci 函式
    return lambda p: next((c for f, c in pairs if f(p)), default)
def cat_ear(s, base, tip, r0, ci, inner=None, r1=0.035, fy=0.5):
    # 三角耳:壓扁的錐形膠囊;inner = 前面一片內耳(軸線往前斜,前緣一路都比外耳凸一點)
    base, tip = np.array(base, float)*(s, 1, 1), np.array(tip, float)*(s, 1, 1)
    limb(base, tip, r0, r1, ci, fy=fy)
    if inner is not None:
        b2 = base+(tip-base)*0.18; t2 = base+(tip-base)*0.86
        limb(b2-(0, r0*fy*0.62, 0), t2-(0, r1*fy*0.9, 0), r0*0.62, r1*0.6, inner, fy=fy*0.55)
def std_body(K):
    # K:shirt / skin / arm / paw / leg / foot / hip 顏色(可以是花紋函式);shirt=None 就沒有衣服(企鵝)
    bone('chest')
    if K['shirt'] is not None:
        hem = K.get('hem', 0.38)   # 下襬寬度(兔子是洋裝,外擴多一點)
        lathe([(-0.04, 0.0), (-0.05, 0.17), (-0.10, 0.27), (-0.16, 0.31), (-0.30, 0.33), (-0.46, hem-0.01), (-0.53, hem), (-0.56, hem-0.04)], K['shirt'], sy=0.78)
    else:
        lathe(K['torso'], K['skin'], sy=0.85)
    bone('hips')
    lathe([(-0.40, 0.0), (-0.41, 0.28), (-0.52, 0.33), (-0.64, 0.32), (-0.69, 0.0)], K.get('hip', K['skin']), sy=0.80)
    for s, n in ((1, 'L'), (-1, 'R')):
        bone(f'leg.{n}')
        limb((s*0.16, 0, -0.58), (s*0.16, 0, -0.84), 0.13, 0.135, K.get('leg', K['skin']))
        ellipsoid((s*0.16, -0.035, -0.87), K.get('foot_r', (0.15, 0.175, 0.085)), K.get('foot', K.get('leg', K['skin'])))
        bone(f'arm.{n}')
        P = np.array((s*SHO[0], 0, SHO[1])); d = np.array((s*math.cos(ARM_A), 0, -math.sin(ARM_A)))
        if K['shirt'] is not None:   # 袖子:以肩關節為中心的球 + 一小段
            ellipsoid(P, (0.15, 0.15, 0.15), K['shirt']); limb(P, P+0.17*d, 0.15, 0.14, K['shirt'])
            limb(P+0.10*d, P+0.40*d, 0.108, 0.118, K.get('arm', K['skin']))
            ellipsoid(P+0.45*d, (0.112, 0.118, 0.112), K.get('paw', K.get('arm', K['skin'])))
        else:   # 企鵝翅膀:前後壓扁的長片
            ellipsoid(P, (0.14, 0.12, 0.14), K['skin']); limb(P, P+0.46*d, 0.14, 0.085, K['skin'], fy=0.45)
def std_head(ci, R=(0.60, 0.50, 0.48), warp=head_w):
    bone('head'); ellipsoid(HC, R, ci, warp=warp, seg=96, ring=48)

def kitty():
    SK, PINK, RED = col((250, 238, 226)), col((242, 140, 132)), col((216, 40, 40))
    std_head(SK)
    for s, n in ((1, 'L'), (-1, 'R')):
        bone(f'ear1.{n}'); cat_ear(s, (0.34, 0.03, 0.64), (0.53, 0.03, 1.04), 0.21, SK, inner=PINK)
    std_body(dict(shirt=RED, skin=SK))
    bone('hips')   # 短短往上翹的尾巴
    limb((0, 0.26, -0.56), (0.05, 0.40, -0.44), 0.065, 0.06, SK); ellipsoid((0.06, 0.42, -0.40), (0.07, 0.07, 0.08), SK)
TOYS['kitty_m'] = kitty

def bunny():
    SK, PEACH, BLUE = col((250, 240, 228)), col((246, 204, 178)), col((26, 96, 196))
    std_head(SK, R=(0.58, 0.50, 0.48))
    for s, n in ((1, 'L'), (-1, 'R')):
        bone(f'ear1.{n}')   # 長耳朵:直立、尖端微微往外
        ellipsoid((s*0.21, 0.03, 1.12), (0.15, 0.085, 0.40), SK, rot=s*0.12)
        ellipsoid((s*0.215, -0.04, 1.11), (0.088, 0.04, 0.30), PEACH, rot=s*0.12)
    std_body(dict(shirt=BLUE, skin=SK, hem=0.42))
    bone('hips'); ellipsoid((0, 0.30, -0.55), (0.10, 0.09, 0.10), SK)   # 毛球尾巴
TOYS['bunny_m'] = bunny

def pup():
    SK, PATCH, EAR, GREEN, CAPG = col((250, 238, 224)), col((196, 128, 78)), col((122, 68, 38)), col((68, 122, 84)), col((60, 112, 76))
    # 頭:左上一塊咖啡色斑
    std_head(pick((lambda p: ((p[0]-0.42)/0.36)**2+((p[2]-0.66)/0.30)**2 < 1, PATCH), default=SK))
    # 毛線帽:圓頂蓋住頭的上三分之一,比頭頂高一點 + 一圈厚厚的反摺
    lathe([(0.64+0.36*math.cos(a), 0.585*math.sin(a)) for a in np.linspace(0, math.pi/2, 14)]+[(0.62, 0.585), (0.62, 0.0)], GREEN, sy=0.86)
    lathe([(0.75, 0.0), (0.75, 0.57)]+[(0.685-0.065*math.cos(a), 0.60+0.045*math.sin(a)) for a in np.linspace(0, math.pi, 11)]+[(0.62, 0.57), (0.62, 0.0)], CAPG, sy=0.86)
    for s, n in ((1, 'L'), (-1, 'R')):
        bone(f'ear1.{n}')   # 垂耳:長橢圓掛在頭兩側,上端往內收
        ellipsoid((s*0.60, 0.04, 0.36), (0.14, 0.10, 0.31), EAR, rot=-s*0.30)
    std_body(dict(shirt=GREEN, skin=SK))
    bone('hips'); ellipsoid((0, 0.30, -0.52), (0.07, 0.08, 0.10), SK)
TOYS['pup_m'] = pup

def penguin():
    NAVY, WHITE, YEL, BOW = col((44, 64, 116)), col((250, 246, 236)), col((250, 198, 40)), col((132, 172, 226))
    # 白色臉:兩個圓疊成愛心形(只在正面)
    mask = lambda p: p[1] < -0.05 and p[2] < 0.66 and min(((p[0]-0.22)/0.27)**2, ((p[0]+0.22)/0.27)**2)+((p[2]-0.30)/0.32)**2 < 1
    std_head(pick((mask, WHITE), default=NAVY), R=(0.64, 0.54, 0.52))
    ellipsoid((0, -0.54, 0.30), (0.10, 0.09, 0.065), YEL)   # 嘴喙
    belly = lambda p: p[1] < 0 and (p[0]/0.28)**2+((p[2]+0.40)/0.36)**2 < 1
    std_body(dict(shirt=None, skin=pick((belly, WHITE), default=NAVY), hip=pick((belly, WHITE), default=NAVY),
                  torso=[(-0.02, 0.0), (-0.03, 0.26), (-0.10, 0.34), (-0.28, 0.40), (-0.46, 0.41), (-0.56, 0.36), (-0.60, 0.0)],
                  leg=NAVY, foot=YEL, foot_r=(0.16, 0.20, 0.075)))
    bone('chest')   # 領結
    for s in (1, -1): ellipsoid((s*0.085, -0.285, -0.07), (0.09, 0.04, 0.062), BOW)
    ellipsoid((0, -0.31, -0.07), (0.035, 0.03, 0.035), BOW)
    bone('hips'); ellipsoid((0, 0.34, -0.56), (0.09, 0.07, 0.08), NAVY)
TOYS['penguin_m'] = penguin

def guinea():
    OR, WH, EAR, PINK, GREEN = col((222, 150, 84)), col((250, 240, 224)), col((184, 104, 82)), col((244, 168, 174)), col((122, 166, 82))
    std_head(pick((lambda p: abs(p[0]) < 0.10+0.07*min(1, max(0, (0.62-p[2])/0.3)) or p[2] < 0.30, WH), default=OR))   # 中間白條往下漸寬
    ellipsoid((0, 0.02, 0.90), (0.10, 0.10, 0.08), WH)   # 頭頂一撮白毛
    for s, n in ((1, 'L'), (-1, 'R')):
        bone(f'ear1.{n}')
        ellipsoid((s*0.52, 0.06, 0.70), (0.17, 0.10, 0.165), EAR)
        ellipsoid((s*0.51, -0.02, 0.69), (0.10, 0.04, 0.10), PINK)
    std_body(dict(shirt=GREEN, skin=OR, arm=PINK, paw=PINK, leg=WH, foot=PINK,
                  hip=pick((lambda p: abs(p[0]) < 0.20 or p[1] > 0.05, WH), default=OR)))
TOYS['guinea_m'] = guinea

def fox():
    OR, WH, DK, RED = col((240, 132, 58)), col((252, 242, 230)), col((112, 56, 30)), col((214, 42, 38))
    def fox_w(p):   # 臉頰往兩邊撐出尖尖的毛
        p = head_w(p); z = p[:, 2]/0.46; p[:, 0] *= 1+0.16*np.exp(-((z+0.30)/0.22)**2); return p
    std_head(pick((lambda p: p[2] < 0.36-0.10*(abs(p[0]) < 0.3) and p[1] < 0.25, WH), default=OR), R=(0.60, 0.50, 0.46), warp=fox_w)
    for s, n in ((1, 'L'), (-1, 'R')):
        bone(f'ear1.{n}')
        tip = lambda p: p[2] > 0.96
        cat_ear(s, (0.33, 0.03, 0.62), (0.54, 0.03, 1.10), 0.22, pick((tip, DK), default=OR), inner=WH)
    std_body(dict(shirt=RED, skin=OR, arm=DK, foot=DK, hip=pick((lambda p: p[1] < -0.1 and abs(p[0]) < 0.17, WH), default=OR)))
    bone('hips')   # 大尾巴:從屁股往右後方彎出來,尾端白色
    tail_tip = lambda p: p[0] < -0.52
    limb((-0.05, 0.28, -0.60), (-0.62, 0.38, -0.42), 0.13, 0.17, pick((tail_tip, WH), default=OR))
TOYS['fox_m'] = fox

def pony():
    TAN, LT, MANE, PINK, HOOF, BLUE = col((214, 142, 92)), col((246, 214, 180)), col((138, 74, 40)), col((240, 150, 150)), col((108, 58, 34)), col((34, 122, 214))
    std_head(pick((lambda p: abs(p[0]) < 0.085 and p[1] < 0 and p[2] > 0.25, LT), default=TAN), R=(0.56, 0.50, 0.50))
    ellipsoid((0, -0.38, 0.14), (0.30, 0.17, 0.20), LT)   # 大大的嘴鼻
    # 鬃毛:頭頂一撮往前捲 + 後腦一條
    ellipsoid((0.02, -0.06, 0.93), (0.15, 0.14, 0.12), MANE); ellipsoid((0.09, -0.27, 0.83), (0.10, 0.10, 0.13), MANE)
    ellipsoid((0, 0.36, 0.66), (0.10, 0.18, 0.28), MANE, rot=0.0)
    for s, n in ((1, 'L'), (-1, 'R')):
        bone(f'ear1.{n}'); cat_ear(s, (0.32, 0.03, 0.70), (0.47, 0.03, 1.00), 0.14, TAN, inner=PINK, r1=0.03)
    std_body(dict(shirt=BLUE, skin=TAN, paw=LT, foot=HOOF, hip=pick((lambda p: p[1] < -0.1 and abs(p[0]) < 0.17, LT), default=TAN)))
    bone('hips')   # 尾巴往下垂、尾端捲一點
    limb((0, 0.28, -0.48), (0.02, 0.42, -0.74), 0.08, 0.07, MANE); ellipsoid((0.05, 0.40, -0.80), (0.08, 0.07, 0.08), MANE)
TOYS['pony_m'] = pony
TOYS['bear_m'] = bear
TOYS[CH]()

# 合成一個網格。貼圖 = 最下面一排色票格子 + 上面一格一格的花紋圖(512x256)
#   純色零件:UV 指到自己那格色票中心;有花紋的零件(ci 是函式):UV 用零件本身的網格參數(經線 u、緯線 v),
#   花紋圖每個像素反推回零件表面的位置再算顏色 → 交界是貼圖解析度的平滑線,不是一格一格的面
CELL, W, TW, TH = 32, 1024, 512, 256
NT = sum(1 for p_ in PARTS if callable(p_[2])); H = CELL+TH*((NT+1)//2)
px = np.zeros((H, W, 4), np.float32); px[..., 3] = 1
V, F, LUV, off, VB, ti = [], [], [], 0, [], 0
def grid_uv(k, rows, cols):   # 網格第 k 個頂點的 (u, v)
    return (k % cols)/cols, (k//cols)/(rows-1)
for v, f, ci, b, (rows, cols) in PARTS:
    V.append(v); F += [tuple(i+off for i in t) for t in f]; VB += [b]*len(v); off += len(v)
    if not callable(ci):
        LUV += [[((ci+0.5)*CELL/W, 0.5*CELL/H)]*len(t) for t in f]; continue
    x0, y0 = (ti % 2)*TW, CELL+(ti//2)*TH; ti += 1
    for t in f:
        uv_ = []
        for k in t:
            if k < rows*cols: uv_.append(list(grid_uv(k, rows, cols)))
            else: uv_.append(None)   # 旋轉體上下蓋的中心點
        us = [q[0] for q in uv_ if q]
        if max(us)-min(us) > 0.5:   # 跨過接縫的面:u=0 那邊改成 1
            for q in uv_:
                if q and q[0] < 0.5: q[0] += 1
        for i, q in enumerate(uv_):
            if q is None: uv_[i] = [sum(us)/len(us), [q2 for q2 in uv_ if q2][0][1]]
        LUV.append([((x0+0.5+q[0]*(TW-1))/W, (y0+0.5+q[1]*(TH-1))/H) for q in uv_])
    # 畫花紋圖:每個像素 → 網格上雙線性內插出位置 → ci 算顏色
    g = v[:rows*cols].reshape(rows, cols, 3)
    uu, vv = np.meshgrid(np.arange(TW)/(TW-1), np.arange(TH)/(TH-1))
    gx, gy = uu*cols, vv*(rows-1); c0 = np.floor(gx).astype(int); r0 = np.clip(np.floor(gy).astype(int), 0, rows-2)
    fx, fy_ = (gx-c0)[..., None], (gy-r0)[..., None]; c0 %= cols; c1 = (c0+1) % cols
    P = (g[r0, c0]*(1-fx)+g[r0, c1]*fx)*(1-fy_)+(g[r0+1, c0]*(1-fx)+g[r0+1, c1]*fx)*fy_
    pal = np.array(PAL, np.float32)/255.0
    idx = np.array([ci(p_) for p_ in P.reshape(-1, 3)]).reshape(TH, TW)
    px[y0:y0+TH, x0:x0+TW, :3] = pal[idx]
for i, c in enumerate(PAL): px[:CELL, i*CELL:(i+1)*CELL, :3] = np.array(c)/255.0
V = np.concatenate(V)
me = bpy.data.meshes.new('Toy'); me.from_pydata(V.tolist(), [], F); me.update()
ob = bpy.data.objects.new('Toy', me); bpy.context.scene.collection.objects.link(ob)
uv = me.uv_layers.new(name='UVMap')
for p, lu in zip(me.polygons, LUV):
    for li, q in zip(p.loop_indices, lu): uv.data[li].uv = q
import bmesh
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()   # 面的方向統一朝外(貼片判斷正面、網頁背面剔除都要)
img = bpy.data.images.new('pal', W, H)
img.pixels.foreach_set(px.ravel()); img.filepath_raw = OUT+'.pal.png'; img.file_format = 'PNG'; img.save()
mat = bpy.data.materials.new('Toy'); mat.use_nodes = True
tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
mat.node_tree.links.new(tex.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
me.materials.append(mat)
for p in me.polygons: p.use_smooth = True
print('parts', len(PARTS), 'verts', len(V), 'faces', len(F), 'colors', PAL, 'pattern tiles', NT)
if not OUT.endswith('.blend'):
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True); sys.exit()

# ── 分件綁定:建骨架(座標照 rig_chars),每個頂點整個給自己零件的骨頭 ──
import os, bmesh; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from rig_chars import CHARS; C = CHARS[CH]
img.pack()
ob.name = 'Bunny'
B = {'root': ((0, 0, C['root'][0]), (0, 0, C['root'][1]), None),
     'hips': ((0, 0, C['hips'][0]), (0, 0, C['hips'][1]), 'root'),
     'chest': ((0, 0, C['chest'][0]), (0, 0, C['chest'][1]), 'hips'),
     'head': ((0, C['head'][2], C['head'][0]), (0, C['head'][2], C['head'][1]), 'chest')}
for s_, x in (('L', 1), ('R', -1)):
    M = lambda p: (p[0]*x, p[1], p[2])
    B[f'ear1.{s_}'] = (M(C['ear1'][0]), M(C['ear1'][1]), 'head')
    B[f'ear2.{s_}'] = (M(C['ear1'][1]), M(C['ear2']), f'ear1.{s_}')
    B[f'arm.{s_}'] = (M(C['arm'][0]), M(C['arm'][1]), 'chest')
    B[f'leg.{s_}'] = (M(C['leg'][0]), M(C['leg'][1]), 'hips')
arm = bpy.data.objects.new('Rig', bpy.data.armatures.new('Rig')); bpy.context.scene.collection.objects.link(arm)
arm['arm_rest'] = C.get('arm_rest', 0); arm['arm_bind'] = C.get('arm_bind', 0)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
for n, (h, t, p) in B.items():
    e = arm.data.edit_bones.new(n); e.head = h; e.tail = t
    if p: e.parent = arm.data.edit_bones[p]
arm.data.edit_bones['root'].use_deform = False
bpy.ops.object.mode_set(mode='OBJECT')
VB = np.array(VB)
for n in B:
    if n == 'root': continue
    idx = np.nonzero(VB == n)[0].tolist(); g = ob.vertex_groups.new(name=n)
    if idx: g.add(idx, 1.0, 'REPLACE')
ob.parent = arm; md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
# 表情貼片:頭(含嘴邊)正面的面複製一份往外推一點,UV 用正面平面投影(和 rig_bunny_face.py 一樣);被別的零件蓋住的面不要
X0, X1, Z0, Z1 = C['face_box']; NY = C.get('face_ny', -0.25)
fm = bpy.data.materials.new('Face'); fm.use_nodes = True; fm.blend_method = 'BLEND'; me.materials.append(fm); FI = len(me.materials)-1
bm = bmesh.new(); bm.from_mesh(me); bm.normal_update(); dl = bm.verts.layers.deform.verify(); hi = ob.vertex_groups['head'].index
sel = []
for f in bm.faces:
    m = f.calc_center_median(); p = np.array((m+f.normal*0.01)[:])   # 往外推一點再測:自己那顆球的面不算被蓋住
    if not (X0 <= m.x <= X1 and Z0 <= m.z <= Z1 and f.normal.y < NY and m.y < -0.15): continue
    if hi not in f.verts[0][dl]: continue
    if any(np.sum(((p-c)/r)**2) < 0.995 for c, r in BALLS): continue   # 在別的零件裡面(例如頭被嘴邊蓋住的那片)
    sel.append(f)
r_ = bmesh.ops.duplicate(bm, geom=sel)
nf = [g for g in r_['geom'] if isinstance(g, bmesh.types.BMFace)]
for v in [g for g in r_['geom'] if isinstance(g, bmesh.types.BMVert)]: v.co += v.normal*0.006
uvl = bm.loops.layers.uv.active
for f in nf:
    f.material_index = FI
    for l in f.loops: l[uvl].uv = ((l.vert.co.x-X0)/(X1-X0), (l.vert.co.z-Z0)/(Z1-Z0))
bm.to_mesh(me); bm.free()
print('rigid bind', {n: int((VB == n).sum()) for n in B if n != 'root'}, 'face patch faces', len(nf))
bpy.ops.wm.save_as_mainfile(filepath=OUT)
