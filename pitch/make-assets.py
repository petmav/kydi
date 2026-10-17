"""Pitch assets: white-wordmark logo for dark slides and an Australia state map shaded by a value per state.
Usage: python -I make-assets.py logo | map '<json {state: value}>'"""
import json, math, sys
from PIL import Image, ImageDraw

HERE = __file__.rsplit("\\", 1)[0] if "\\" in __file__ else __file__.rsplit("/", 1)[0]

def logo_white():
    """Background removed by flood fill from the border, so the light page inside the mark stays opaque."""
    from PIL import ImageFilter
    src = Image.open(f"{HERE}/kydi-logo-src.png").convert("RGB")
    probe = src.copy()
    ImageDraw.floodfill(probe, (0, 0), (255, 0, 255), thresh=14)
    bg = Image.eval(Image.eval(probe, lambda v: v).convert("RGB"), lambda v: v)
    bgmask = Image.new("L", src.size, 0)
    sp, pp, mp = src.load(), probe.load(), bgmask.load()
    for y in range(src.height):
        for x in range(src.width):
            if pp[x, y] == (255, 0, 255):
                mp[x, y] = 255
    fringe = bgmask.filter(ImageFilter.MaxFilter(5))
    fp = fringe.load()
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    op = out.load()
    word_x = 600  # the wordmark starts right of this column in the source image
    for y in range(src.height):
        for x in range(src.width):
            if mp[x, y]:
                continue
            r, g, b = sp[x, y]
            if x >= word_x and not (b - r > 90):
                lum = 0.3 * r + 0.59 * g + 0.11 * b
                ink = max(0.0, min(1.0, (250 - lum) / (250 - 28)))
                op[x, y] = (255, 255, 255, int(255 * ink))
            elif fp[x, y]:
                a = max(0.0, min(1.0, (252 - min(r, g, b)) / 60))
                op[x, y] = (r, g, b, int(255 * a))
            else:
                op[x, y] = (r, g, b, 255)
    out = out.crop(out.getbbox())
    out.save(f"{HERE}/kydi-logo-white.png")
    print("logo", out.size)

ABBR = {"New South Wales": "NSW", "Victoria": "VIC", "Queensland": "QLD", "Western Australia": "WA", "South Australia": "SA",
        "Tasmania": "TAS", "Australian Capital Territory": "ACT", "Northern Territory": "NT"}

def lerp(c1, c2, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))

def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def state_map(values):
    gj = json.load(open(f"{HERE}/_dl/states.geojson", encoding="utf-8"))
    lat0 = math.radians(-27)
    proj = lambda lon, lat: (lon * math.cos(lat0), -lat)
    shapes = {}
    for f in gj["features"]:
        name = ABBR.get(f["properties"]["STATE_NAME"])
        if not name:
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings = [[proj(*p) for p in poly[0]] for poly in polys if 112 < poly[0][0][0] < 155]
        shapes[name] = rings
    xs = [x for r in sum(shapes.values(), []) for x, _ in r]
    ys = [y for r in sum(shapes.values(), []) for _, y in r]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    W = 2400
    s = (W - 40) / (maxx - minx)
    H = int((maxy - miny) * s) + 40
    SS = 3
    img = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    to_px = lambda x, y: ((x - minx) * s * SS + 20 * SS, (y - miny) * s * SS + 20 * SS)
    lo, hi = min(values.values()), max(values.values())
    pale, deep = hexrgb("CFE0FB"), hexrgb("0B4FC4")
    anchors = {}
    for name, rings in shapes.items():
        t = (math.log(values[name]) - math.log(lo)) / (math.log(hi) - math.log(lo))
        fill = lerp(pale, deep, t) + (255,)
        for ring in rings:
            d.polygon([to_px(*p) for p in ring], fill=fill, outline=(255, 255, 255, 255), width=4 * SS)
        def area_centroid(r):
            a = cx = cy = 0.0
            for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]):
                k = x0 * y1 - x1 * y0
                a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k
            return (abs(a) / 2, cx / (3 * a), cy / (3 * a)) if a else (0, r[0][0], r[0][1])
        _, cx, cy = max((area_centroid(r) for r in rings), key=lambda t: t[0])
        px_, py_ = to_px(cx, cy)
        anchors[name] = {"x": px_ / SS / W, "y": py_ / SS / H, "dark": t > 0.45}
    img = img.resize((W, H), Image.LANCZOS)
    img.save(f"{HERE}/au-map.png")
    json.dump({"w": W, "h": H, "anchors": anchors}, open(f"{HERE}/au-map.json", "w"), indent=1)
    print("map", W, H)

if __name__ == "__main__":
    if sys.argv[1] == "logo":
        logo_white()
    else:
        state_map(json.loads(sys.argv[2]))
