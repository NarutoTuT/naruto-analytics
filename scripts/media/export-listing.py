from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
OUT=Path('docs/app-store-media'); OUT.mkdir(parents=True,exist_ok=True)
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
navy='#0d2051'; ink='#152442'; muted='#59657b'
def font(s,b=False): return ImageFont.truetype(BOLD if b else FONT,s)
def export(name,title,subtitle,source,box,note):
 im=Image.new('RGB',(1600,900),'#f2f5fa');d=ImageDraw.Draw(im)
 d.text((64,40),'NARUTO ANALYTICS',font=font(21,True),fill=navy)
 d.text((64,85),title,font=font(44,True),fill=ink)
 d.text((64,146),subtitle,font=font(24),fill=muted)
 src=Image.open(source).convert('RGB').crop(box)
 src.thumbnail((1472,612),Image.Resampling.LANCZOS)
 x=(1600-src.width)//2; y=205+(612-src.height)//2
 d.rounded_rectangle((x-2,y-2,x+src.width+2,y+src.height+2),radius=12,fill='#d7dfea')
 im.paste(src,(x,y))
 d.text((64,848),note,font=font(19),fill=muted)
 im.save(OUT/name,quality=94,optimize=True)
home='/private/tmp/naruto-home-raw.png';details='/private/tmp/naruto-details-raw.png'
export('01-daily-brief.jpg','A daily starting point for store review','Review the latest complete reporting period in your store timezone.',home,(240,113,1600,895),'Actual development-store screen. No qualifying orders in this reporting period.')
export('02-report-details.jpg','See the numbers behind the brief','Compare two complete seven-day periods and inspect metric definitions.',details,(610,126,1580,573),'Actual development-store screen. Zero values are shown without invented growth percentages.')
export('03-email-preferences.jpg','Choose when your daily brief arrives','One inbox. Your local time. Daily emails are optional and in English.',home,(611,468,1580,880),'Example email address for illustration. The preference was not saved and no message was sent.')
# Feature image uses the established icon and a crop of the real application.
im=Image.new('RGB',(1600,900),navy);d=ImageDraw.Draw(im)
logo=Image.open('public/brand/naruto-analytics-icon-1200.jpg').resize((112,112),Image.Resampling.LANCZOS);im.paste(logo,(65,58))
d.text((193,96),'Naruto Analytics',font=font(35,True),fill='white')
for y,t in [(280,'Your daily brief.'),(347,'Your next review.')]: d.text((76,y),t,font=font(54,True),fill='white')
d.text((78,453),'Compare complete seven-day periods.',font=font(25),fill='#dce5f8')
d.text((78,494),'Inspect the figures behind each insight.',font=font(25),fill='#dce5f8')
d.text((78,535),'Receive optional email briefs.',font=font(25),fill='#dce5f8')
src=Image.open(details).crop((617,222,1574,569)).convert('RGB');src.thumbnail((758,400),Image.Resampling.LANCZOS)
x=775;y=315;d.rounded_rectangle((x-14,y-14,x+src.width+14,y+src.height+14),radius=22,fill='#f1f3f7');im.paste(src,(x,y))
d.text((780,650),'Actual app screen · development store',font=font(19),fill='#dce5f8')
d.text((78,796),'PAID ORDER PERFORMANCE  /  DAILY EMAIL',font=font(20,True),fill='#ff9917')
im.save(OUT/'feature-1600x900.jpg',quality=95,optimize=True)
# Replace the earlier raw export so no personal email remains in deliverables.
Image.open(home).crop((240,113,1600,895)).save(OUT/'01-daily-brief.png')
print([(p.name,Image.open(p).size,p.stat().st_size) for p in OUT.glob('*.jpg')])
