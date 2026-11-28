import json, struct, numpy as np
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def read(path):
    f = open(path, 'rb').read(); L = struct.unpack('<I', f[12:16])[0]; j = json.loads(f[20:20 + L]); B = f[20 + L + 8:]
    return j, B
def acc(j, B, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    dt = CT[a['componentType']]; n = NC[a['type']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride')
    isz = np.dtype(dt).itemsize * n
    if stride and stride != isz:
        raw = np.frombuffer(B, np.uint8, a['count'] * stride, off).reshape(a['count'], stride)[:, :isz].copy()
        arr = raw.view(dt).reshape(a['count'], n)
    else:
        arr = np.frombuffer(B, dt, a['count'] * n, off).reshape(a['count'], n).copy()
    if a.get('normalized'):
        arr = arr.astype(np.float32) / np.iinfo(dt).max
    return arr
