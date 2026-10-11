// ナイトバブル 15秒PV のBGM（オリジナル。テーマソングは無いのでコード進行＋泡のきらきら音）
// 96BPM・6小節＝15秒。1小節目は静かな前振り＋泡が「ぷくっ」×2 →「パチン！」、2〜5小節目にリズム、6小節目は和音を伸ばしてフェード。
// 合成のしかたは tools/yamanishi-pv/music.js と同じ（OfflineAudioContext → 16bit WAV を base64 で返す）。
(function () {
  const BEAT = 60 / 96;
  const MAJ = [0, 4, 7], MIN = [0, 3, 7];
  // F | C | G | Am | F | C(のばす)
  const SECTIONS = [
    { chords: [[5, "maj"]], drums: 0, sparkle: 0 },
    { chords: [[0, "maj"], [7, "maj"], [9, "min"], [5, "maj"]], drums: 1, sparkle: 1 },
    { chords: [[0, "maj"]], drums: 0, sparkle: 0, hold: true },
  ];
  // 泡のきらきら：和音の音を高い音域で8分音符のアルペジオ
  const ARP = [0, 2, 1, 2, 0, 2, 1, 2];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  window.renderSong = async function (seconds = 15) {
    const SR = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
    const master = ctx.createGain();
    master.gain.value = 0.9;
    // 残響：減衰するノイズのインパルス
    const verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, SR * 2.2, SR);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    verb.connect(wet).connect(master);
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    const bus = (lp) => {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lp;
      f.connect(master);
      f.connect(verb);
      return f;
    };
    const padBus = bus(2200), melBus = bus(3200), bassBus = bus(600);
    const drumBus = ctx.createGain();
    drumBus.connect(master);

    function tone(dest, freq, start, dur, type, peak, vib = 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      if (vib) {
        const l = ctx.createOscillator(), lg = ctx.createGain();
        l.frequency.value = 5.2;
        lg.gain.value = freq * vib;
        l.connect(lg).connect(o.frequency);
        l.start(start + 0.15);
        l.stop(start + dur + 0.1);
      }
      const atk = 0.03, rel = Math.min(0.12, dur * 0.35);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + atk);
      g.gain.setValueAtTime(peak, Math.max(start + atk, start + dur - rel));
      g.gain.linearRampToValueAtTime(0, start + dur);
      o.connect(g).connect(dest);
      o.start(start);
      o.stop(start + dur + 0.05);
    }
    // ギターのストローク風に、和音を少しずらして鳴らす
    function strum(tones, start, dur, peak) {
      tones.forEach((n, i) => tone(padBus, hz(n), start + i * 0.018, dur, "triangle", peak));
    }
    function kick(t) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(drumBus);
      o.start(t);
      o.stop(t + 0.32);
    }
    const noise = ctx.createBuffer(1, SR * 0.3, SR);
    noise.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
    function shaker(t, peak) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise;
      f.type = "highpass";
      f.frequency.value = 6500;
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      s.connect(f).connect(g).connect(drumBus);
      s.start(t);
      s.stop(t + 0.1);
    }

    let t = 0;
    const bar = 4 * BEAT;
    for (const sec of SECTIONS) {
      sec.chords.forEach(([root, q], b) => {
        const tones = (q === "maj" ? MAJ : MIN).map((iv) => 48 + root + iv);
        const s = t + b * bar;
        if (sec.hold) {
          strum(tones, s, bar * 1.2, 0.06);
          strum(tones.map((n) => n + 12), s + 0.05, bar * 1.2, 0.035);
          tone(bassBus, hz(36 + root), s, bar * 1.1, "sine", 0.22);
          tone(melBus, hz(84 + root + 7), s, bar * 0.9, "sine", 0.05, 0.004);
          return;
        }
        strum(tones, s, bar * 0.5, sec.drums ? 0.05 : 0.04);
        strum(tones.map((n) => n + 12), s + 2 * BEAT, bar * 0.48, 0.03);
        tone(bassBus, hz(36 + root), s, bar * 0.45, "sine", sec.drums ? 0.22 : 0.12);
        tone(bassBus, hz(36 + root + 7), s + 2 * BEAT, bar * 0.4, "sine", sec.drums ? 0.16 : 0.09);
        for (let k = 0; k < 4; k++) {
          const bt = s + k * BEAT;
          if (sec.drums && k % 2 === 0) kick(bt);
          if (sec.drums) shaker(bt + BEAT / 2, 0.05);
        }
        if (sec.sparkle) ARP.forEach((ix, i) => tone(melBus, hz(72 + 12 + tones[ix] - 48), s + i * BEAT / 2, BEAT * 0.45, "sine", 0.045));
      });
      t += sec.chords.length * bar;
    }
    // 1小節目：泡がふくらむ（上がっていく音）×2 と、パチン！
    for (const [at, f0, f1] of [[BEAT, 260, 520], [BEAT * 2, 330, 700]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + 0.28);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.16, at + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.34);
      o.connect(g).connect(melBus);
      o.start(at);
      o.stop(at + 0.36);
    }
    const popAt = BEAT * 3;
    {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise;
      f.type = "bandpass";
      f.frequency.value = 2400;
      g.gain.setValueAtTime(0.9, popAt);
      g.gain.exponentialRampToValueAtTime(0.001, popAt + 0.08);
      s.connect(f).connect(g).connect(drumBus);
      s.start(popAt);
      s.stop(popAt + 0.1);
      [1568, 2093, 2637].forEach((fr, i) => tone(melBus, fr, popAt + 0.04 + i * 0.05, 0.25, "sine", 0.05));
    }
    // 最後は和音を残してフェードアウト
    master.gain.setValueAtTime(0.9, seconds - 1.6);
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
