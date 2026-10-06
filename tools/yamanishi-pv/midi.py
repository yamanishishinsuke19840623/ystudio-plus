"""最小限の SMF パーサ。fuku-to-ikiru.mid を (start_sec, dur_sec, note, vel, track, program) に変換する。"""
import struct

def _vlq(d, i):
    v = 0
    while True:
        b = d[i]; i += 1
        v = (v << 7) | (b & 0x7F)
        if not b & 0x80:
            return v, i

def parse(path):
    d = open(path, 'rb').read()
    _, ntr, div = struct.unpack('>HHH', d[8:14])
    i = 14
    tracks, tempos = [], []
    for tn in range(ntr):
        assert d[i:i+4] == b'MTrk'
        ln = struct.unpack('>I', d[i+4:i+8])[0]
        j, end = i + 8, i + 8 + ln
        tick, status, ev = 0, 0, []
        while j < end:
            dt, j = _vlq(d, j); tick += dt
            b = d[j]
            if b == 0xFF:
                t = d[j+1]; ln2, j = _vlq(d, j+2); data = d[j:j+ln2]; j += ln2
                if t == 0x51:
                    tempos.append((tick, int.from_bytes(data, 'big')))
                ev.append((tick, 'meta', t, data))
                continue
            if b in (0xF0, 0xF7):
                ln2, j = _vlq(d, j+1); j += ln2; continue
            if b & 0x80:
                status = b; j += 1
            hi = status & 0xF0
            n = 1 if hi in (0xC0, 0xD0) else 2
            args = d[j:j+n]; j += n
            ev.append((tick, hi, status & 0x0F, bytes(args)))
        tracks.append(ev)
        i = end
    tempos = sorted(tempos) or [(0, 500000)]

    def sec(tk):
        s, last_t, last_tempo = 0.0, 0, 500000
        for tt, tp in tempos:
            if tt > tk: break
            s += (tt - last_t) * last_tempo / div / 1e6; last_t, last_tempo = tt, tp
        return s + (tk - last_t) * last_tempo / div / 1e6

    notes = []
    for tn, ev in enumerate(tracks):
        prog, on = {}, {}
        for tick, kind, ch, a in ev:
            if kind == 0xC0: prog[ch] = a[0]
            elif kind == 0x90 and a[1] > 0: on[(ch, a[0])] = (tick, a[1])
            elif kind in (0x80, 0x90) and (ch, a[0]) in on:
                st, vel = on.pop((ch, a[0]))
                notes.append((sec(st), sec(tick) - sec(st), a[0], vel, tn, ch, prog.get(ch, 0)))
    return sorted(notes), tempos, div

if __name__ == '__main__':
    import sys, collections
    notes, tempos, div = parse(sys.argv[1])
    print('tempos', tempos, 'div', div, 'notes', len(notes), 'end', max(n[0]+n[1] for n in notes))
    c = collections.Counter((n[4], n[5], n[6]) for n in notes)
    for k, v in sorted(c.items()):
        ns = [n[2] for n in notes if (n[4], n[5], n[6]) == k]
        print('track/ch/prog', k, v, 'range', min(ns), max(ns))
    print(notes[:12])
