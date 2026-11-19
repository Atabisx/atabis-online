# Minimal ikili FBX okuyucu (7.x): düğüm ağacı + özellikler
import struct, zlib, numpy as np
def parse(path):
    b = open(path, 'rb').read()
    ver = struct.unpack('<I', b[23:27])[0]
    big = ver >= 7500
    def read_prop(o):
        t = chr(b[o]); o += 1
        if t == 'Y': return struct.unpack('<h', b[o:o+2])[0], o+2
        if t == 'C': return bool(b[o]), o+1
        if t == 'I': return struct.unpack('<i', b[o:o+4])[0], o+4
        if t == 'F': return struct.unpack('<f', b[o:o+4])[0], o+4
        if t == 'D': return struct.unpack('<d', b[o:o+8])[0], o+8
        if t == 'L': return struct.unpack('<q', b[o:o+8])[0], o+8
        if t in 'SR':
            n = struct.unpack('<I', b[o:o+4])[0]; o += 4; v = b[o:o+n]
            return (v.decode('utf8', 'replace') if t == 'S' else v), o+n
        if t in 'fdlib':
            n, enc, clen = struct.unpack('<III', b[o:o+12]); o += 12
            raw = b[o:o+clen]; o += clen
            if enc == 1: raw = zlib.decompress(raw)
            dt = {'f': '<f4', 'd': '<f8', 'l': '<i8', 'i': '<i4', 'b': 'u1'}[t]
            return np.frombuffer(raw, dtype=dt, count=n), o
        raise ValueError('bilinmeyen tip ' + t)
    def read_node(o):
        if big: end, np_, plen = struct.unpack('<QQQ', b[o:o+24]); o += 24
        else: end, np_, plen = struct.unpack('<III', b[o:o+12]); o += 12
        nl = b[o]; o += 1
        if end == 0: return None, o
        name = b[o:o+nl].decode(); o += nl
        props = []
        po = o
        for _ in range(np_):
            v, po = read_prop(po); props.append(v)
        o += plen
        children = []
        while o < end:
            c, o2 = read_node(o)
            if c is None: o = o2; break
            children.append(c); o = o2
        return {'name': name, 'props': props, 'ch': children}, end
    o = 27; top = []
    while o < len(b) - 13:
        n, o2 = read_node(o)
        if n is None: break
        top.append(n); o = o2
    return ver, top
def find(nodes, name):
    return [n for n in nodes if n['name'] == name]
def child(n, name):
    for c in n['ch']:
        if c['name'] == name: return c
