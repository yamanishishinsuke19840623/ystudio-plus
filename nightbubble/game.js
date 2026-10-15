// シャボン玉わりゲーム（旧ページから移植・色だけ新デザインに合わせた）＋予定の日付チェック
// ── BUBBLE POP GAME v2 ──
(function(){
  const gc = document.getElementById('game-canvas');
  if(!gc) return;
  const gx = gc.getContext('2d');
  const scoreEl = document.getElementById('g-score');
  const timerEl = document.getElementById('g-timer');
  const bestEl  = document.getElementById('g-best');
  const overlay = document.getElementById('game-overlay');
  const startBtn= document.getElementById('g-start-btn');

  let W,H,gBubbles=[],gParticles=[],gFloats=[],gScore=0,gTimer=20,gRunning=false,gInterval,gRaf;
  let gBest=0;try{gBest=parseInt(localStorage.getItem('nb-game-best')||'0');}catch(e){}
  let gCombo=0,gLastPopTime=0,gFever=false,gFeverEnd=0;
  bestEl.textContent=gBest;

  // ── RANKING ──
  const RANK_KEY='nb-game-ranking-v2';
  function getRanking(){try{return JSON.parse(localStorage.getItem(RANK_KEY)||'[]');}catch(e){return[];}}
  function saveRanking(score){
    if(score<=0)return;
    const r=getRanking();
    const d=new Date();
    r.push({score,date:(d.getMonth()+1)+'/'+(d.getDate())});
    r.sort((a,b)=>b.score-a.score); r.splice(5);
    try{localStorage.setItem(RANK_KEY,JSON.stringify(r));}catch(e){}
  }
  function rankHTML(currentScore){
    const r=getRanking(); if(!r.length)return'';
    const medals=['🥇','🥈','🥉','4位','5位'];
    const rows=r.map((e,i)=>{
      const cur=i===0&&e.score===currentScore;
      return`<tr${cur?' class="g-rank-current"':''}><td>${medals[i]}</td><td>${e.score}点</td><td>${e.date}</td></tr>`;
    }).join('');
    return`<div class="g-rank-wrap"><table class="g-rank-tbl"><thead><tr><th>順位</th><th>スコア</th><th>日付</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ── AUDIO ──
  let _ac;
  function ac(){if(!_ac)_ac=new(window.AudioContext||window.webkitAudioContext)();return _ac;}
  function beep(freq,dur,vol=0.25,type='sine'){
    try{
      const o=ac().createOscillator(),g=ac().createGain();
      o.connect(g);g.connect(ac().destination);
      o.type=type; o.frequency.setValueAtTime(freq,ac().currentTime);
      o.frequency.exponentialRampToValueAtTime(freq*.5,ac().currentTime+dur);
      g.gain.setValueAtTime(vol,ac().currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,ac().currentTime+dur);
      o.start(ac().currentTime); o.stop(ac().currentTime+dur);
    }catch(e){}
  }
  function sndPop(combo){beep(350+combo*55,.1,.28);}
  function sndBomb(){beep(120,.18,.4,'sawtooth');}
  function sndFever(){[440,550,660,880].forEach((f,i)=>setTimeout(()=>beep(f,.08,.22),i*70));}
  function sndGold(){beep(660,.06,.2);setTimeout(()=>beep(880,.06,.15),70);}

  // ── BUBBLE TYPES ──
  const GC=[[127,243,255],[255,155,228],[255,245,154],[157,255,181],[243,238,227]];
  const GOLD=[255,207,58];
  const BOMB=[239,68,68];

  function gResize(){W=gc.width=gc.offsetWidth;H=gc.height=gc.offsetHeight;}

  function mkBubble(){
    const rnd=Math.random();
    let type,color,pts;
    if(rnd<.10){type='bomb';color=BOMB;pts=-2;}
    else if(rnd<.28){type='gold';color=GOLD;pts=3;}
    else{type='normal';color=GC[Math.floor(Math.random()*GC.length)];pts=1;}
    const r=Math.random()*22+30;
    return{x:Math.random()*(W-r*2)+r,y:H+r+10,r,
      vx:(Math.random()-.5)*.5,vy:-(Math.random()*.6+.28),
      color,phase:Math.random()*Math.PI*2,wobble:Math.random()*.4+.2,pts,type};
  }

  function mkParticles(b){
    const n=b.type==='bomb'?16:12;
    for(let i=0;i<n;i++){
      const a=Math.PI*2/n*i,spd=b.type==='bomb'?5:3.5;
      gParticles.push({x:b.x,y:b.y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,
        r:b.r*.2,color:b.color,alpha:1});
    }
  }

  function mkFloat(x,y,txt,clr){
    gFloats.push({x,y,vy:-2,txt,clr,alpha:1});
  }

  function drawB(b){
    const [r,g,bl]=b.color;
    const t=performance.now()/1000;
    gx.save();
    if(b.type==='gold'){gx.shadowColor='rgba(251,191,36,.9)';gx.shadowBlur=gFever?24:14;}
    if(b.type==='bomb'){gx.shadowColor='rgba(239,68,68,.7)';gx.shadowBlur=10;}
    const gr=gx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
    gr.addColorStop(0,`rgba(${r},${g},${bl},.18)`);
    gr.addColorStop(1,`rgba(${r},${g},${bl},.04)`);
    gx.beginPath();gx.arc(b.x,b.y,b.r,0,Math.PI*2);
    gx.fillStyle=gr;gx.fill();
    gx.strokeStyle=`rgba(${r},${g},${bl},.9)`;
    gx.lineWidth=b.type==='gold'?2.8:1.8;gx.stroke();
    gx.beginPath();gx.arc(b.x-b.r*.3,b.y-b.r*.3,b.r*.22,0,Math.PI*2);
    gx.fillStyle='rgba(255,255,255,.6)';gx.fill();
    if(b.type==='bomb'){
      gx.strokeStyle=`rgba(${r},${g},${bl},.85)`;gx.lineWidth=2.5;
      const s=b.r*.32;
      gx.beginPath();gx.moveTo(b.x-s,b.y-s);gx.lineTo(b.x+s,b.y+s);gx.stroke();
      gx.beginPath();gx.moveTo(b.x+s,b.y-s);gx.lineTo(b.x-s,b.y+s);gx.stroke();
    }
    if(b.type==='gold'){
      gx.fillStyle=`rgba(${r},${g},${bl},1)`;
      gx.font=`900 ${Math.floor(b.r*.38)}px 'Zen Maru Gothic',sans-serif`;
      gx.textAlign='center';gx.textBaseline='middle';
      gx.fillText('+3',b.x,b.y+b.r*.08);
    }
    gx.restore();
  }

  function gameLoop(){
    gx.clearRect(0,0,W,H);
    const t=performance.now()/1000;
    const now=Date.now();

    // FEVER border pulse
    if(gFever&&gRunning){
      const pulse=.4+.3*Math.sin(t*10);
      gx.save();gx.strokeStyle=`rgba(251,191,36,${pulse})`;gx.lineWidth=10;
      gx.strokeRect(0,0,W,H);gx.restore();
      if(now>gFeverEnd){gFever=false;gCombo=0;}
    }

    const rate=gFever?.075:.04;
    if(Math.random()<rate&&gBubbles.length<50)gBubbles.push(mkBubble());

    for(let i=gBubbles.length-1;i>=0;i--){
      const b=gBubbles[i];
      b.x+=b.vx+Math.sin(t*b.wobble+b.phase)*.35;b.y+=b.vy;
      if(b.y<-b.r*2){gBubbles.splice(i,1);continue;}
      drawB(b);
    }
    for(let i=gParticles.length-1;i>=0;i--){
      const p=gParticles[i];
      p.x+=p.vx;p.y+=p.vy;p.vy+=.13;p.alpha-=.055;
      if(p.alpha<=0){gParticles.splice(i,1);continue;}
      const [r,g,bl]=p.color;
      gx.save();gx.globalAlpha=p.alpha;
      gx.beginPath();gx.arc(p.x,p.y,p.r,0,Math.PI*2);
      gx.fillStyle=`rgb(${r},${g},${bl})`;gx.fill();gx.restore();
    }
    for(let i=gFloats.length-1;i>=0;i--){
      const f=gFloats[i];
      f.y+=f.vy;f.alpha-=.032;
      if(f.alpha<=0){gFloats.splice(i,1);continue;}
      gx.save();gx.globalAlpha=f.alpha;
      gx.font="900 20px 'Zen Maru Gothic',sans-serif";
      gx.fillStyle=f.clr;gx.textAlign='center';gx.textBaseline='middle';
      gx.fillText(f.txt,f.x,f.y);gx.restore();
    }

    // Timer warning
    if(gTimer<=5&&gRunning){
      timerEl.style.color=Math.floor(t*4)%2===0?'#f87171':'#fbbf24';
    }else{timerEl.style.color='';}

    gRaf=requestAnimationFrame(gameLoop);
  }

  function endGame(){
    gRunning=false;clearInterval(gInterval);gFever=false;
    timerEl.style.color='';
    const isNewBest=gScore>gBest&&gScore>0;
    if(isNewBest){gBest=gScore;try{localStorage.setItem('nb-game-best',gBest);}catch(e){}bestEl.textContent=gBest;}
    saveRanking(gScore);
    const msg=gScore>=25?'シャボン玉マスター！🎉':gScore>=15?'すごい！もう一回！':gScore>=8?'いいね！練習あるのみ！':'まだまだ！爆弾に注意！';
    overlay.innerHTML=`<p class="g-title">${gScore}点！</p>
      <p class="g-sub">${msg}</p>
      ${isNewBest?'<p class="g-sub" style="color:var(--moon);font-weight:700;">🏆 ベスト更新！</p>':''}
      ${rankHTML(gScore)}
      <button class="btn" id="g-restart-btn">もう一度！</button>`;
    overlay.classList.remove('hidden');
    document.getElementById('g-restart-btn').addEventListener('click',startGame);
  }

  function startGame(){
    gScore=0;gTimer=20;gBubbles=[];gParticles=[];gFloats=[];
    gCombo=0;gLastPopTime=0;gFever=false;
    timerEl.style.color='';
    scoreEl.textContent=0;timerEl.textContent=20;
    overlay.classList.add('hidden');
    gRunning=true;
    cancelAnimationFrame(gRaf);
    gameLoop();
    gInterval=setInterval(()=>{
      gTimer--;timerEl.textContent=gTimer;
      if(gTimer<=0)endGame();
    },1000);
  }

  function onTap(e){
    e.preventDefault();
    if(!gRunning)return;
    const rect=gc.getBoundingClientRect();
    const scaleX=W/rect.width,scaleY=H/rect.height;
    const cx=((e.touches?e.touches[0].clientX:e.clientX)-rect.left)*scaleX;
    const cy=((e.touches?e.touches[0].clientY:e.clientY)-rect.top)*scaleY;
    for(let i=gBubbles.length-1;i>=0;i--){
      const b=gBubbles[i];
      if((cx-b.x)**2+(cy-b.y)**2<=b.r**2){
        mkParticles(b);gBubbles.splice(i,1);
        const now=Date.now();
        if(now-gLastPopTime<1400)gCombo++;else gCombo=1;
        gLastPopTime=now;
        let pts=b.pts;
        if(gFever&&pts>0)pts*=2;
        gScore=Math.max(0,gScore+pts);
        scoreEl.textContent=gScore;
        // Float text
        const [r,g,bl]=b.color;
        let ftxt=pts>0?`+${pts}`:String(pts);
        if(gCombo>=3&&pts>0)ftxt+=` ×${gCombo}`;
        mkFloat(b.x,b.y-24,ftxt,pts>0?`rgb(${r},${g},${bl})`:'#f87171');
        // Sound
        if(b.type==='bomb')sndBomb();
        else if(b.type==='gold'){sndGold();mkFloat(b.x,b.y+18,'⭐ GOLD!','#fbbf24');}
        else sndPop(gCombo);
        // FEVER trigger
        if(gCombo>=5&&!gFever){
          gFever=true;gFeverEnd=Date.now()+5000;
          sndFever();
          mkFloat(W/2,H*.4,'🔥 FEVER!','#fbbf24');
        }
        break;
      }
    }
  }

  gResize();
  window.addEventListener('resize',gResize);
  gc.addEventListener('click',onTap);
  gc.addEventListener('touchstart',onTap,{passive:false});
  startBtn.addEventListener('click',startGame);
  gameLoop();
})();

// ── 今年の予定：過ぎた日付は「開催済み」に ──
(function(){
  var today=new Date();today.setHours(0,0,0,0);
  document.querySelectorAll('.sched .row[data-date]').forEach(function(row){
    var d=new Date(row.dataset.date+'T00:00:00');
    if(d<today){var b=row.querySelector('.badge');if(b){b.textContent='開催済み ✓';b.classList.add('done');}row.style.opacity='.7';}
  });
})();

// ── 15秒PV：ボタンで音ありで再生。再生後は操作バーを出す ──
(function(){
  var v=document.getElementById('pv'); if(!v) return;
  var box=v.parentElement, btn=box.querySelector('.play');
  btn.addEventListener('click',function(){
    v.muted=false; v.controls=true; box.classList.add('playing');
    var p=v.play(); if(p&&p.catch) p.catch(function(){ box.classList.remove('playing'); });
  });
  v.addEventListener('ended',function(){ v.controls=false; box.classList.remove('playing'); });
})();
