// テーマソング「潮風と、ふくと。」デモ（イントロ＋Aメロ＋Bメロ＋サビ、96BPM・約75秒）を
// OfflineAudioContext で音にする。譜面は song.html のデモと同じ。
// PV用に、メロディをフルート寄りの音色にし、軽いリズムと残響を足している。
// render.mjs がブラウザ内で window.renderSong() を呼び、16bit WAV（base64）を受け取る。
(function () {
  const BEAT = 60 / 96;
  const MAJ = [0, 4, 7], MIN = [0, 3, 7];
  const intro = [[0, "maj"], [7, "maj"], [9, "min"], [5, "maj"]];
  const amero = [[0, "maj"], [7, "maj"], [9, "min"], [5, "maj"], [0, "maj"], [7, "maj"], [9, "min"], [5, "maj"]];
  const ameroMel = [4, 4, 7, 4, 2, 2, 5, 2, 0, 0, 4, 0, -3, -3, 0, -3, 4, 7, 4, 2, 2, 5, 2, 0, 0, 4, 0, -1, -3, 0, 2, 4].map((s) => [s, 1]);
  const bmero = [[5, "maj"], [7, "maj"], [4, "min"], [9, "min"], [5, "maj"], [7, "maj"], [4, "min"], [9, "min"]];
  const bPhrase = [5, 9, 7, 5, 7, 11, 9, 7, 4, 7, 11, 7, 9, 7, 5, 4].map((s) => [s, 1]);
  const sabi = [[5, "maj"], [7, "maj"], [4, "min"], [9, "min"], [5, "maj"], [7, "maj"], [2, "min"], [7, "maj"], [0, "maj"], [0, "maj"]];
  const sabiMel = [[9, 1], [12, 1], [12, 1], [9, 1], [11, 1], [14, 1], [14, 1], [11, 1], [7, 1], [11, 1], [7, 1], [4, 1], [9, 1], [12, 1], [9, 1], [4, 1],
    [9, 1], [12, 1], [12, 1], [9, 1], [11, 1], [14, 1], [14, 1], [11, 1], [14, 1], [12, 1], [9, 1], [5, 1], [7, 1], [9, 1], [11, 1], [14, 1], [16, 1], [14, 1], [12, 2], [12, 4]];
  const SECTIONS = [
    { chords: intro, mel: null, drums: 0 },
    { chords: amero, mel: ameroMel, drums: 1 },
    { chords: bmero, mel: bPhrase.concat(bPhrase), drums: 1 },
    { chords: sabi, mel: sabiMel, drums: 2 },
  ];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  window.renderSong = async function (seconds = 76) {
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
    for (const sec of SECTIONS) {
      const bar = 4 * BEAT;
      sec.chords.forEach(([root, q], b) => {
        const tones = (q === "maj" ? MAJ : MIN).map((iv) => 48 + root + iv);
        const s = t + b * bar;
        // 1拍目と3拍目にストローク
        strum(tones, s, bar * 0.5, 0.05);
        strum(tones.map((n) => n + 12), s + 2 * BEAT, bar * 0.48, 0.03);
        tone(bassBus, hz(36 + root), s, bar * 0.45, "sine", 0.22);
        tone(bassBus, hz(36 + root + 7), s + 2 * BEAT, bar * 0.4, "sine", 0.16);
        for (let k = 0; k < 4; k++) {
          const bt = s + k * BEAT;
          if (sec.drums >= 1 && k % 2 === 0) kick(bt);
          if (sec.drums >= 1) shaker(bt + BEAT / 2, sec.drums === 2 ? 0.07 : 0.045);
          if (sec.drums === 2) shaker(bt, 0.035);
        }
      });
      if (sec.mel) {
        let mt = t;
        for (const [s, d] of sec.mel) {
          tone(melBus, hz(72 + s), mt, d * BEAT * 0.94, "sine", 0.11, 0.006);
          tone(melBus, hz(72 + s), mt, d * BEAT * 0.94, "triangle", 0.035);
          mt += d * BEAT;
        }
      }
      t += sec.chords.length * bar;
    }
    // 最後の和音を少し伸ばしてフェードアウト
    master.gain.setValueAtTime(0.9, t - 1.5);
    master.gain.linearRampToValueAtTime(0, seconds - 0.2);

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
