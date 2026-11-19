import struct, zlib, math

def write_png(path, size, bg_round=True, mark_scale=1.0):
    w = h = size
    rows = []
    for y in range(h):
        row = []
        ny = (y + 0.5) / h
        for x in range(w):
            nx = (x + 0.5) / w
            # subtle diagonal gradient
            t = max(0.0, min(1.0, 0.5 * (nx + (1 - ny))))
            r = int(0x4f + t * (0x81 - 0x4f))
            g = int(0x46 + t * (0x8c - 0x46))
            b = int(0xe5 + t * (0xf8 - 0xe5))

            if bg_round:
                # rounded square, radius 22% of size
                rad = 0.22
                dx = max(abs(nx - 0.5) - (0.5 - rad), 0.0)
                dy = max(abs(ny - 0.5) - (0.5 - rad), 0.0)
                dist = math.hypot(dx, dy)
                alpha = max(0.0, min(1.0, (rad - dist) * size * 0.9 + 0.5))
            else:
                alpha = 1.0

            # checkmark: two segments, centered and scaled
            s = mark_scale
            def sx(v): return 0.5 + (v - 0.5) * s
            a = (sx(0.27), sx(0.52)); bb = (sx(0.44), sx(0.70)); c = (sx(0.75), sx(0.32))
            def seg(p, q):
                px, py = p; qx, qy = q
                vx, vy = qx - px, qy - py
                L = vx * vx + vy * vy
                u = max(0.0, min(1.0, ((nx - px) * vx + (ny - py) * vy) / L))
                return math.hypot(nx - (px + u * vx), ny - (py + u * vy))
            d = min(seg(a, bb), seg(bb, c))
            thick = 0.055 * s
            white = max(0.0, min(1.0, (thick - d) * size * 0.8 + 0.5))

            cr = int(r + (255 - r) * white)
            cg = int(g + (255 - g) * white)
            cb = int(b + (255 - b) * white)
            row.append((cr, cg, cb, int(round(alpha * 255))))
        rows.append(row)

    raw = b''.join(b'\x00' + b''.join(bytes(p) for p in row) for row in rows)
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(raw, 9))
    out += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(out)
    print(path, size)

base = r'C:\Users\HP\Documents\MES PROJETS\gestion-de-tache-pro\icons'
write_png(base + r'\icon-192.png', 192)
write_png(base + r'\icon-512.png', 512)
write_png(base + r'\maskable-192.png', 192, bg_round=False, mark_scale=0.62)
write_png(base + r'\maskable-512.png', 512, bg_round=False, mark_scale=0.62)
write_png(base + r'\apple-touch-icon.png', 180, bg_round=False, mark_scale=0.72)
