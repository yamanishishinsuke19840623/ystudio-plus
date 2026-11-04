// 日下まりあさん応援リールのBGM（オリジナル。ピアノ風の和音＋パッド、後半に軽いリズム）
// 80BPM・1小節3秒・10小節＝30秒。場面（pv.html）の切り替えと同じ小節割り。
// 合成のしかたは tools/nightbubble-pv/music.js と同じ（OfflineAudioContext → 16bit WAV を base64 で返す）。
(function () {
  const BEAT = 60 / 80, BAR = BEAT * 4;
  // 小節ごとの和音（ルートのMIDI番号と長短）。前半は迷い、3小節目から明るく、最後はCをのばす
  const BARS = [
    [57, "min"], [53, "maj"], [48, "maj"], [55, "maj"], [57, "min"],
    [53, "maj"], [48, "maj"], [55, "maj"], [53, "maj"], [48, "maj"],
  ];
  const IV = { maj: [0, 4, 7], min: [0, 3, 7] };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  window.renderSong = async function (seconds = 30) {
    const SR = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
    const master = ctx.createGain();
    master.gain.value = 0.8;
    const verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, SR * 2.5, SR);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    master.connect(ctx.destination);
    master.connect(verb).connect(wet).connect(ctx.destination);

    // ピアノ風：三角波＋サイン、すぐ減衰
    const piano = (m, t, len, vel = 0.12) => {
      for (const [type, mul, g] of [["triangle", 1, 1], ["sine", 2, 0.25]]) {
        const o = ctx.createOscillator(), e = ctx.createGain();
        o.type = type;
        o.frequency.value = hz(m) * mul;
        e.gain.setValueAtTime(0, t);
        e.gain.linearRampToValueAtTime(vel * g, t + 0.01);
        e.gain.exponentialRampToValueAtTime(0.0008, t + len);
        o.connect(e).connect(master);
        o.start(t);
        o.stop(t + len + 0.05);
      }
    };
    const pad = (m, t, len, vel = 0.025) => {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), e = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = hz(m);
      f.type = "lowpass";
      f.frequency.value = 900;
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(vel, t + 0.6);
      e.gain.setValueAtTime(vel, t + len - 0.5);
      e.gain.linearRampToValueAtTime(0, t + len);
      o.connect(f).connect(e).connect(master);
      o.start(t);
      o.stop(t + len + 0.05);
    };
    const kick = (t, vel = 0.5) => {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      e.gain.setValueAtTime(vel, t);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(e).connect(master);
      o.start(t);
      o.stop(t + 0.4);
    };
    const shaker = (t, vel = 0.05) => {
      const b = ctx.createBuffer(1, SR * 0.08, SR), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), e = ctx.createGain();
      s.buffer = b;
      f.type = "highpass";
      f.frequency.value = 6000;
      e.gain.value = vel;
      s.connect(f).connect(e).connect(master);
      s.start(t);
    };

    BARS.forEach(([root, q], b) => {
      const t0 = b * BAR, last = b === BARS.length - 1;
      const notes = IV[q].map((i) => root + i);
      notes.forEach((m) => pad(m, t0, last ? BAR : BAR + 0.1));
      piano(root - 12, t0, last ? BAR : 2.2, 0.14);
      if (b === 0) {
        // 1小節目は静かに単音
        piano(notes[2] + 12, t0 + 0.15, 1.2, 0.08);
        return;
      }
      if (last) {
        notes.forEach((m, i) => piano(m + 12, t0 + i * 0.12, BAR, 0.09));
        piano(root + 24, t0 + 0.5, BAR, 0.06);
        return;
      }
      // 8分音符のアルペジオ（右手）
      const arp = [0, 1, 2, 1, 2, 1, 0, 1];
      arp.forEach((k, i) => piano(notes[k] + 12 + (i === 4 ? 12 : 0), t0 + i * BEAT / 2, 0.9, b < 2 ? 0.05 : 0.07));
      // 5小節目（活動の場面）から軽いリズム
      if (b >= 4 && b <= 8) {
        for (let i = 0; i < 4; i++) kick(t0 + i * BEAT, i % 2 ? 0.25 : 0.45);
        for (let i = 0; i < 8; i++) shaker(t0 + i * BEAT / 2 + BEAT / 4, 0.035);
      }
    });
    // 1場面目「4割。」の低い「ドン」
    kick(1.3, 0.9);

    const buf = await ctx.startRendering();
    // 最後の0.7秒をフェードアウトして16bit WAVに
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    const fadeFrom = n - Math.round(0.7 * SR);
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); str(8, "WAVEfmt ");
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
    str(36, "data"); out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      const f = i > fadeFrom ? 1 - (i - fadeFrom) / (n - fadeFrom) : 1;
      out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * f)) * 32767, true);
      out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * f)) * 32767, true);
    }
    const bytes = new Uint8Array(out.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
})();
