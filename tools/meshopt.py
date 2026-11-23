# EXT_meshopt_compression çözücü (saf Python + numpy). takiglb.py kullanır; sıkıştırılmış GLB dosyalarını açar.
import numpy as np

def _decode_bytes_group(data, pos, bitslog2, out):
    if bitslog2 == 0:
        out[:] = 0; return pos
    if bitslog2 == 3:
        out[:] = np.frombuffer(data, np.uint8, 16, pos); return pos + 16
    bits = 2 if bitslog2 == 1 else 4
    nbytes = 4 if bits == 2 else 8
    sentinel = (1 << bits) - 1
    packed = data[pos:pos + nbytes]; dv = pos + nbytes
    k = 0
    for byte in packed:
        for s in range(8 - bits, -1, -bits):
            v = (byte >> s) & sentinel
            if v == sentinel:
                v = data[dv]; dv += 1
            out[k] = v; k += 1
    return dv

def decode_vertex(data, count, size):
    assert data[0] & 0xF0 == 0xA0 and data[0] & 0x0F == 0, 'sadece v0 köşe kodlaması destekleniyor'
    out = np.zeros((count, size), np.uint8)
    last = np.frombuffer(data, np.uint8, size, len(data) - size).copy()
    bs = min((8192 // size) & ~15, 256)
    pos = 1; off = 0
    buf = np.zeros(bs, np.uint8)
    while off < count:
        n = min(bs, count - off); na = (n + 15) & ~15
        for k in range(size):
            hs = (na // 16 + 3) // 4
            header = data[pos:pos + hs]; pos += hs
            for g in range(na // 16):
                b = (header[g // 4] >> ((g % 4) * 2)) & 3
                pos = _decode_bytes_group(data, pos, b, buf[g * 16:g * 16 + 16])
            v = buf[:n].astype(np.int32)
            d = ((-(v & 1)) ^ (v >> 1)) & 0xFF        # unzigzag8
            col = (np.cumsum(d) + int(last[k])) & 0xFF
            out[off:off + n, k] = col
        last = out[off + n - 1].copy()
        off += n
    return out

def _vbyte(data, pos):
    r = 0; sh = 0
    while True:
        b = data[pos]; pos += 1
        r |= (b & 127) << sh; sh += 7
        if b < 128: return r, pos

def decode_index(data, count):
    assert data[0] & 0xF0 == 0xE0
    ver = data[0] & 15
    ntri = count // 3
    code = 1; pos = 1 + ntri
    aux = data[len(data) - 16:]
    ef = [[0xFFFFFFFF, 0xFFFFFFFF] for _ in range(16)]; eo = 0
    vf = [0xFFFFFFFF] * 16; vo = 0
    nxt = 0; last = 0
    fecmax = 13 if ver >= 1 else 15
    out = np.zeros(count, np.uint32)
    def dec_idx(pos, last):
        v, pos = _vbyte(data, pos)
        d = (v >> 1) ^ -(v & 1)
        return (last + d) & 0xFFFFFFFF, pos
    for t in range(ntri):
        ct = data[code]; code += 1
        if ct < 0xF0:
            fe = ct >> 4
            a, b = ef[(eo - 1 - fe) & 15]
            fec = ct & 15
            if fec < fecmax:
                c = nxt if fec == 0 else vf[(vo - 1 - fec) & 15]
                if fec == 0: nxt += 1
                out[t*3:t*3+3] = (a, b, c)
                vf[vo] = c; vo = (vo + (1 if fec == 0 else 0)) & 15
            else:
                if fec != 15: c = (last + (fec - (fec ^ 3))) & 0xFFFFFFFF
                else: c, pos = dec_idx(pos, last)
                last = c
                out[t*3:t*3+3] = (a, b, c)
                vf[vo] = c; vo = (vo + 1) & 15
            ef[eo] = [c, b]; eo = (eo + 1) & 15
            ef[eo] = [a, c]; eo = (eo + 1) & 15
        else:
            if ct < 0xFE:
                ca = aux[ct & 15]; feb = ca >> 4; fec = ca & 15
                a = nxt; nxt += 1
                b = nxt if feb == 0 else vf[(vo - feb) & 15]
                if feb == 0: nxt += 1
                c = nxt if fec == 0 else vf[(vo - 1 - fec) & 15]
                if fec == 0: nxt += 1
                out[t*3:t*3+3] = (a, b, c)
                vf[vo] = a; vo = (vo + 1) & 15
                vf[vo] = b; vo = (vo + (feb == 0)) & 15
                vf[vo] = c; vo = (vo + (fec == 0)) & 15
            else:
                ca = data[pos]; pos += 1
                fea = 0 if ct == 0xFE else 15; feb = ca >> 4; fec = ca & 15
                if ca == 0: nxt = 0
                a = 0
                b = vf[(vo - feb) & 15]; c = vf[(vo - fec) & 15]
                if fea == 0: a = nxt; nxt += 1
                if feb == 0: b = nxt; nxt += 1
                if fec == 0: c = nxt; nxt += 1
                if fea == 15: a, pos = dec_idx(pos, last); last = a
                if feb == 15: b, pos = dec_idx(pos, last); last = b
                if fec == 15: c, pos = dec_idx(pos, last); last = c
                out[t*3:t*3+3] = (a, b, c)
                vf[vo] = a; vo = (vo + 1) & 15
                vf[vo] = b; vo = (vo + ((feb == 0) or (feb == 15))) & 15
                vf[vo] = c; vo = (vo + ((fec == 0) or (fec == 15))) & 15
            ef[eo] = [b, a]; eo = (eo + 1) & 15
            ef[eo] = [c, b]; eo = (eo + 1) & 15
            ef[eo] = [a, c]; eo = (eo + 1) & 15
    return out

def filter_oct(raw, stride):
    if stride == 4:
        d = raw.view(np.int8).reshape(-1, 4).astype(np.float64); mx = 127
    else:
        d = raw.view(np.int16).reshape(-1, 4).astype(np.float64); mx = 32767
    x, y, one = d[:, 0], d[:, 1], d[:, 2]
    z = one - np.abs(x) - np.abs(y)
    t = np.minimum(z, 0)
    x = x + np.where(x >= 0, t, -t); y = y + np.where(y >= 0, t, -t)
    l = np.sqrt(x * x + y * y + z * z); l[l == 0] = 1
    s = mx / l
    o = d.copy(); o[:, 0] = np.round(x * s); o[:, 1] = np.round(y * s); o[:, 2] = np.round(z * s)
    return o.astype(np.int8 if stride == 4 else np.int16).view(np.uint8).reshape(-1, stride)
