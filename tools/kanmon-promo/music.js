// かんもんノート 15秒プロモーションリールのBGM（オリジナル。テーマソングは無いので、明るい4つ打ち＋場面転換の効果音）
// 120BPM・1小節2秒。1小節目は軽い前振り（ペンの音・ぽん×2）、2〜6小節目は4つ打ち、6小節目の後半でライザー、
// 7小節目の頭で「ドン」とロゴ、最後は和音を伸ばしてフェード。合成のしかたは tools/nightbubble-pv/music.js と同じ。
(function () {
  const BEAT = 0.5, BAR = 2;
  const MAJ = [0, 4, 7], MIN = [0, 3, 7];
  // 小節ごとのコード（D基準）: D | D A | Bm G | D A | Bm G | Em A | D(のばす)
  const CHORDS = [[[2, MAJ]], [[2, MAJ], [9, MAJ]], [[11, MIN], [7, MAJ]], [[2, MAJ], [9, MAJ]], [[11, MIN], [7, MAJ]], [[4, MIN], [9, MAJ]], [[2, MAJ]]];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  window.renderSong = async function (seconds = 15) {
    const SR = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
    const master = ctx.createGain();
    master.gain.value = 0.6;
    const verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, SR * 1.6, SR);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.5);
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    verb.connect(wet).connect(master);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    const bus = (lp, send = true) => {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = lp;
      f.connect(master); if (send) f.connect(verb);
      return f;
    };
    const padBus = bus(2600), leadBus = bus(5000), bassBus = bus(420, false);
    const drumBus = ctx.createGain(); drumBus.connect(master);
    const noise = ctx.createBuffer(1, SR * 2, SR);
    noise.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));

    function tone(dest, freq, start, dur, type, peak, atk = 0.01) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      const rel = Math.min(0.1, dur * 0.4);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + atk);
      g.gain.setValueAtTime(peak, Math.max(start + atk, start + dur - rel));
      g.gain.linearRampToValueAtTime(0, start + dur);
      o.connect(g).connect(dest);
      o.start(start); o.stop(start + dur + 0.05);
    }
    // 少しずらした2本のノコギリ波で厚みのある和音
    function stab(notes, start, dur, peak) {
      notes.forEach((n) => { tone(padBus, hz(n) * 1.004, start, dur, "sawtooth", peak); tone(padBus, hz(n) * 0.996, start, dur, "sawtooth", peak); });
    }
    function kick(t, peak = 0.75) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(g).connect(drumBus); o.start(t); o.stop(t + 0.34);
    }
    function hit(t, f, q, peak, dur, type = "highpass") {
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(fl).connect(g).connect(drumBus); s.start(t, Math.random()); s.stop(t + dur + 0.02);
    }
    const clap = (t) => { [0, 0.012, 0.024].forEach((d) => hit(t + d, 1500, 0.8, 0.32, 0.12, "bandpass")); };
    const hat = (t, p = 0.07) => hit(t, 8000, 0.5, p, 0.05);
    // 場面転換の「シュッ」（ノイズのフィルターを上げていく）
    function whoosh(end, len = 0.45, peak = 0.22) {
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; fl.type = "bandpass"; fl.Q.value = 1.2;
      fl.frequency.setValueAtTime(400, end - len); fl.frequency.exponentialRampToValueAtTime(7000, end);
      g.gain.setValueAtTime(0.001, end - len); g.gain.exponentialRampToValueAtTime(peak, end - 0.02); g.gain.linearRampToValueAtTime(0, end + 0.04);
      s.connect(fl).connect(g).connect(drumBus); s.start(end - len); s.stop(end + 0.06);
    }
    function blip(t, f0, f1, peak = 0.14) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g).connect(leadBus); o.start(t); o.stop(t + 0.22);
    }

    CHORDS.forEach((chs, bar) => {
      const b0 = bar * BAR, per = BAR / chs.length;
      chs.forEach(([root, q], i) => {
        const s = b0 + i * per, notes = q.map((iv) => 62 + ((root + iv - 2 + 12) % 12));
        if (bar === 0) { stab(notes, s + 1.0, 0.18, 0.018); stab(notes, s + 1.5, 0.18, 0.022); return; }
        if (bar === 6) {
          stab(notes, s, 2.6, 0.03); stab(notes.map((n) => n + 12), s, 2.6, 0.016);
          tone(bassBus, hz(38 + root - 2 + (root < 2 ? 12 : 0)), s, 2.4, "sine", 0.5);
          return;
        }
        // 8分のオフビートにスタブ、ベースは8分で刻む
        for (let k = 0; k < per / (BEAT / 2); k++) {
          const tt = s + k * BEAT / 2;
          if (k % 2 === 1) stab(notes, tt, 0.11, 0.02);
          tone(bassBus, hz(38 + ((root - 2 + 12) % 12)) * (k % 4 === 3 ? 2 : 1), tt, 0.2, "sawtooth", 0.16);
        }
        // 高い音で和音の分散（8分音符）
        [0, 1, 2, 1].forEach((ix, k) => tone(leadBus, hz(notes[ix] + 12), s + k * BEAT / 2, 0.2, "triangle", 0.05));
        [2, 1, 0, 1].forEach((ix, k) => tone(leadBus, hz(notes[ix] + 12), s + (k + 4) * BEAT / 2, 0.2, "triangle", 0.045));
      });
      if (bar >= 1 && bar <= 5) {
        for (let k = 0; k < 4; k++) {
          const tt = b0 + k * BEAT;
          kick(tt);
          if (k % 2 === 1) clap(tt);
          hat(tt + BEAT / 2, 0.09); hat(tt + BEAT / 4, 0.035); hat(tt + BEAT * 3 / 4, 0.035);
        }
      }
    });
    // 1小節目：ペンが走る音と「ぽん」×2
    hit(0.05, 3000, 0.7, 0.05, 1.1, "bandpass");
    blip(1.0, 500, 900); blip(1.5, 650, 1200);
    // 場面転換
    [2, 4, 6, 8, 10, 12].forEach((e) => whoosh(e, e === 2 || e === 12 ? 0.25 : 0.35, e === 12 ? 0.3 : 0.2));
    // 3小節目：マス目が埋まる「ぽぽぽ」
    for (let n = 0; n < 9; n++) blip(4.25 + n * 0.125, 700 + n * 60, 1100 + n * 80, 0.07);
    // 6小節目後半：ライザー → 7小節目頭の「ドン」
    {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(220, 11); o.frequency.exponentialRampToValueAtTime(1760, 12);
      g.gain.setValueAtTime(0.001, 11); g.gain.exponentialRampToValueAtTime(0.05, 11.95); g.gain.linearRampToValueAtTime(0, 12.02);
      o.connect(g).connect(padBus); o.start(11); o.stop(12.05);
    }
    kick(12, 0.95); hit(12, 120, 0.7, 0.5, 0.6, "lowpass"); hit(12, 5000, 0.5, 0.2, 0.5);
    kick(12.75, 0.6); blip(12.75, 400, 1200, 0.16);
    // 最後は和音を残してフェードアウト（頭のノートにつながるように静かに終える）
    master.gain.setValueAtTime(0.6, seconds - 1.4);
    master.gain.linearRampToValueAtTime(0, seconds - 0.05);

    const buf = await ctx.startRendering();
    // 16bit PCM の WAV にして base64 で返す
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); str(8, "WAVE"); str(12, "fmt ");
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
    str(36, "data"); out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
    }
    const bytes = new Uint8Array(out.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
})();
