import json, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0,'/private/tmp/naruto-video-runtime')
import imageio_ffmpeg
root=Path('/private/tmp/naruto-video-frames'); seg=json.loads(Path('/private/tmp/naruto-video-segments.json').read_text())
out=Path('public/review');out.mkdir(exist_ok=True)
fontroot='/System/Library/Fonts/Supplemental/'
font=lambda s,b=False:ImageFont.truetype(fontroot+('Arial Bold.ttf' if b else 'Arial.ttf'),s)
notes=[
['Live development-store walkthrough. The app is already installed.','No qualifying recent orders: zero values are expected.'],
['View details expands the two complete seven-day comparison periods.','Paid order value is not net sales or profit. Read the definitions.'],
['The interface supports English and Simplified Chinese.','This is the real language-switch operation. Email remains in English.'],
['Example recipient and local delivery time are edited without saving.','Daily email stays off. No message is sent during this recording.'],
['Public price: USD 19 per month per store; 7-day trial if eligible.','This test contract remains active with cancellation scheduled.'],
['Support, privacy and subscription management are available in-app.','The DPA is still a draft and is not shown as accepted.']]
fps=10
proc=subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s','1280x800','-r',str(fps),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',str(out/'naruto-analytics-walkthrough.mp4')],stdin=subprocess.PIPE)
def card(title,lines):
 im=Image.new('RGB',(1280,800),'#0d2051');d=ImageDraw.Draw(im);d.text((80,190),'NARUTO ANALYTICS',font=font(25,True),fill='#ff9917');d.text((80,270),title,font=font(43,True),fill='white')
 for n,line in enumerate(lines): d.text((80,360+n*48),line,font=font(25),fill='#e2e9f6')
 return im
intro=card('Application walkthrough',['Actual screens and operations from a development store.','Starts with an existing installation; initial install is not recorded.','English captions · no audio · no payment or email sent.'])
for _ in range(8*fps):proc.stdin.write(intro.tobytes())
for n,s in enumerate(seg):
 count=s['last']-s['first']+1; total=round(s['seconds']*fps); last=-1; cached=None
 for j in range(total):
  ix=s['first']+min(count-1,int(j/total*count))
  if ix!=last:
   raw=Image.open(root/f'frame-{ix:05d}.png').convert('RGB')
   if raw.size!=(1280,720):raise ValueError(f'Unexpected capture dimensions {raw.size}')
   crop=raw.crop((240,113,1280,720));im=Image.new('RGB',(1280,800),'#0d2051');im.paste(crop,(120,65));d=ImageDraw.Draw(im)
   d.text((32,20),f'{n+1:02d}  {s["label"]}',font=font(23,True),fill='white')
   for k,line in enumerate(notes[n]):d.text((34,704+k*34),line,font=font(23),fill='white')
   cached=im.tobytes();last=ix
  proc.stdin.write(cached)
end=card('Review status',['Core screens demonstrated. Initial installation still to be recorded.','Merchant data-protection declarations remain in preparation.','This video is not a claim of App Store approval.'])
for _ in range(6*fps):proc.stdin.write(end.tobytes())
proc.stdin.close();ret=proc.wait();assert ret==0
print(json.dumps({'file':str(out/'naruto-analytics-walkthrough.mp4'),'durationSeconds':14+sum(s['seconds'] for s in seg),'bytes':(out/'naruto-analytics-walkthrough.mp4').stat().st_size}))
