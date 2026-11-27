// 試し描画：指定秒のコマを PNG に（node stills.cjs 0.6 4 8 11.5 14）
const {chromium}=require('playwright');const path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const OUT=process.env.OUT||path.join(__dirname,'.tmp');
(async()=>{require('fs').mkdirSync(OUT,{recursive:true});
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+ROOT+'/yamanishi-suisan/line-art/index.html?reel');
await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
let last=0;for(const s of process.argv.slice(2).map(Number)){for(let t=last;t<=s*1000;t+=1000/30)await p.evaluate(t=>__render(t),t);last=s*1000;
await p.screenshot({path:path.join(OUT,`r${s}.png`)});}
console.log(errs.join('\n')||'ok');await b.close();})();
