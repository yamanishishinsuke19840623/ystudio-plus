// 山西水産 線画アニメのインスタ用リール（縦1080×1920・15秒・30fps）を MP4 にする。
//   node tools/line-art-reel/render.cjs
// 映像: yamanishi-suisan/line-art/index.html?reel を window.__render(ms) で1コマずつ描画
// 音: tools/yamanishi-pv/music.js のテーマソング「潮風と、ふくと。」デモのサビ（35秒〜）を15秒切り出し
// 出力: yamanishi-suisan/media/line-art-reel.mp4 / line-art-reel-cover.jpg
const {chromium}=require('playwright');
const {spawn,spawnSync}=require('child_process');
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const OUT=path.join(ROOT,'yamanishi-suisan/media');
const TMP=path.join(__dirname,'.tmp');
const FPS=30,DUR=15,SABI=35;
(async()=>{
  fs.mkdirSync(TMP,{recursive:true});fs.mkdirSync(OUT,{recursive:true});
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1080,height:1920}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+ROOT+'/yamanishi-suisan/line-art/index.html?reel');
  await p.addScriptTag({path:path.join(ROOT,'tools/yamanishi-pv/music.js')});
  await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(600);

  console.log('BGM…');
  const wav=path.join(TMP,'song.wav');
  fs.writeFileSync(wav,Buffer.from(await p.evaluate(s=>window.renderSong(s),SABI+DUR+2),'base64'));

  const mp4=path.join(OUT,'line-art-reel.mp4');
  const ff=spawn('ffmpeg',['-y','-loglevel','error',
    '-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-',
    '-ss',String(SABI),'-t',String(DUR),'-i',wav,
    '-map','0:v','-map','1:a',
    '-af',`afade=t=in:d=0.4,afade=t=out:st=${DUR-1.5}:d=1.5`,
    '-c:v','libx264','-pix_fmt','yuv420p','-preset','medium','-crf','18','-r',String(FPS),
    '-c:a','aac','-b:a','192k','-movflags','+faststart','-t',String(DUR),mp4],{stdio:['pipe','inherit','inherit']});
  const N=FPS*DUR;
  for(let i=0;i<N;i++){
    await p.evaluate(t=>__render(t),i*1000/FPS);
    const buf=await p.screenshot({type:'jpeg',quality:92});
    if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));
    if(i===Math.round(13.5*FPS))fs.writeFileSync(path.join(OUT,'line-art-reel-cover.jpg'),buf);
    if(i%60===0)process.stdout.write(`${i}/${N}\n`);
  }
  ff.stdin.end();await new Promise(r=>ff.on('close',r));
  await b.close();
  console.log(errs.join('\n')||'ok',mp4);
})();
