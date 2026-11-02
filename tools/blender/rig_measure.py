# 用法:先用 rig_prep.py(縮放成高 1.9)再 blender -b <norm.blend> -P rig_measure.py,印出 rig_chars.py 設定初稿與表情位置
# 自動量角色尺寸 → 印出 rig_chars.py 用的設定初稿(模型要先經 tripo/prep.py 縮放成高 1.9、置中)
import bpy, numpy as np, sys
o=bpy.data.objects['Bunny']; n=len(o.data.vertices); co=np.zeros(n*3,dtype=np.float32); o.data.vertices.foreach_get('co',co); co=co.reshape(-1,3)
co=co[::max(1,n//300000)]
zs=np.arange(-0.95,0.96,0.02)
def segs(z,band=0.012):
  s=co[(co[:,2]>=z-band)&(co[:,2]<z+band)]
  if not len(s): return [],s
  xs=np.sort(s[:,0]); g=np.nonzero(np.diff(xs)>0.03)[0]; out=[]; st=xs[0]
  for i in g: out.append((st,xs[i])); st=xs[i+1]
  out.append((st,xs[-1])); return out,s
prof=[]
for z in zs:
  sg,s=segs(z)
  core=[x for x in sg if x[0]<0.02 and x[1]>-0.02]   # 包含中心線的那一段 = 身體 / 頭
  w=(core[0][1]-core[0][0])/2 if core else 0
  prof.append((z,len(sg),w,abs(s[:,0]).max() if len(s) else 0, s[:,1].max() if len(s) else 0, s[:,1].min() if len(s) else 0))
prof=np.array(prof)
# 腳:最底下分成兩段的範圍
legtop=max(p[0] for p in prof if p[1]>=2 and p[0]<-0.6) if any(p[1]>=2 and p[0]<-0.6 for p in prof) else -0.8
lsg,_=segs(-0.9); legx=float(np.mean([abs((a+b)/2) for a,b in lsg if abs((a+b)/2)>0.03])) if len(lsg)>=2 else 0.17
# 脖子:-0.45..0.15 之間身體最窄處
cand=[p for p in prof if -0.45<p[0]<0.15 and p[2]>0]; neck=min(cand,key=lambda p:p[2])[0]
# 頭頂(不含耳朵):從上往下,第一個只剩一段(耳朵併進頭)的高度
earbase=None
for p in prof[::-1]:
  if p[0]<neck: break
  if p[1]>=2: earbase=p[0]
  elif earbase is not None: break
headtop=earbase if earbase is not None else 0.95
esg,_=segs(min(0.93,(earbase or 0.9)+0.12)); earx=float(np.mean([abs((a+b)/2) for a,b in esg])) if esg else 0.25
# 頭最寬處
hw=max(p[2] for p in prof if p[0]>neck)
# 手臂:身體範圍 neck-0.45 .. neck,|x| 最遠
armz=[p for p in prof if neck-0.45<p[0]<neck]; arm=max(armz,key=lambda p:p[3]); armtip=float(arm[3]); armz0=float(arm[0])
bodyw=float(min(p[2] for p in armz if p[2]>0))
# 書包:身體區段 y 最大值
bagy=float(max(p[4] for p in prof if legtop<p[0]<neck))
headbot=neck; hh=headtop-headbot
eyeZ=headbot+hh*0.46; mouthZ=headbot+hh*0.33; eyeX=hw*0.40
r=lambda v:round(float(v),3)
print('CFG', dict(
  feats=[], root=(-0.95,r(legtop-0.02)), hips=(r(legtop-0.02),r((legtop+neck)/2)), chest=(r((legtop+neck)/2),r(neck)),
  head=(r(neck),r(headtop),-0.04),
  ear1=((r(earx*0.7),-0.04,r(headtop-0.05)),(r(earx),-0.04,r(headtop+0.1))), ear2=(r(earx*1.15),-0.04,0.95),
  arm=((r(bodyw*0.55),-0.05,r(armz0+0.06)),(r(armtip-0.03),-0.05,r(armz0-0.06))), leg=((r(legx),-0.05,r(legtop+0.02)),(r(legx),-0.06,-0.95)),
  bag_y=(r(bagy-0.2),r(bagy-0.1)), bag_z=(r(neck+0.03),r(neck+0.09)), arm_x=(r(bodyw*0.6),r(bodyw*0.95)), leg_z=(r(legtop-0.02),r(legtop+0.04)),
  face_box=(r(-hw),r(hw),r(headbot+hh*0.15),r(eyeZ+0.16)), face_ny=-0.08))
print('FACE', dict(box=[r(-hw),r(hw),r(headbot+hh*0.15),r(eyeZ+0.16)], eyeX=r(eyeX), eyeZ=r(eyeZ), mouthZ=r(mouthZ), noseZ=r((eyeZ+mouthZ)/2)))
print('INFO neck',r(neck),'headtop',r(headtop),'earbase',earbase,'hw',r(hw),'legtop',r(legtop),'armtip',r(armtip),'armz',r(armz0),'bodyw',r(bodyw),'bagy',r(bagy))
