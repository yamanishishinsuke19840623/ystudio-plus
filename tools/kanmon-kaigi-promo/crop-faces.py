# 各回チラシ（kanmon-kaigi/flyer-*.jpg）のゲスト写真の丸を切り出し、kanmon-kaigi/faces/ に保存する。
#   python3 tools/kanmon-kaigi-promo/crop-faces.py
# 座標はチラシ画像の実寸ピクセル（中心x, 中心y, 半径）。
from PIL import Image, ImageFilter
C={'01':[(286,140,48),(403,141,50),(520,142,50),(55,254,30),(133,255,30)],
   '02':[(190,139,48),(328,139,48),(463,133,48)],
   '03':[(185,137,48),(318,136,48),(448,136,48)],
   '04':[(209,157,55),(364,155,55),(518,157,55)],
   '05':[(180,135,47),(313,135,47),(443,134,47)],
   '05x':[(62,152,51),(157,207,50),(260,152,51),(352,207,51),(445,150,51),(545,207,51)],
   '06':[(197,147,52),(339,147,52),(478,144,52)],
   '07':[(211,157,55),(364,157,55),(512,157,55)],
   '08':[(213,159,54),(363,154,54),(513,157,54)],
   '09':[(212,158,56),(366,158,56),(513,154,56)]}

for n,cs in C.items():
  im=Image.open(f'kanmon-kaigi/flyer-{n}.jpg').convert('RGB')
  for i,(x,y,r) in enumerate(cs):
    r=r*0.97
    c=im.crop((round(x-r),round(y-r),round(x+r),round(y+r))).resize((480,480),Image.LANCZOS)
    c=c.filter(ImageFilter.UnsharpMask(radius=2.2,percent=70,threshold=2))
    c.save(f'kanmon-kaigi/faces/{n}-{i+1}.jpg',quality=90)



