#!/usr/bin/env python3
"""Read the session summary out of Garmin activity .fit files (fast, tolerant of bad strings).
Usage: python3 scripts/garmin_sessions.py <folder-with-.fit> <out.json>
Writes one row per activity: local date/time from the file name, sport, totals. Private data: keep the output out of git."""
import glob, json, os, struct, sys, datetime

FIT_EPOCH = 631065600  # 1989-12-31 UTC
SESSION = 18
F = {2: "start", 5: "sport", 6: "sub_sport", 7: "elapsed", 8: "timer", 9: "distance", 11: "calories", 16: "avg_hr", 17: "max_hr", 22: "ascent", 23: "descent", 110: "profile"}
SCALE = {"timer": 1000, "elapsed": 1000, "distance": 100}
BASE = {0: ("B", 1), 1: ("b", 1), 2: ("B", 1), 131: ("h", 2), 132: ("H", 2), 133: ("i", 4), 134: ("I", 4), 7: ("s", 1), 136: ("f", 4), 137: ("d", 8), 10: ("B", 1), 139: ("H", 2), 140: ("I", 4), 142: ("q", 8), 143: ("Q", 8), 144: ("Q", 8), 13: ("B", 1), 11: ("H", 2), 12: ("I", 4)}
INVALID = {"B": 0xFF, "H": 0xFFFF, "I": 0xFFFFFFFF, "b": 0x7F, "h": 0x7FFF, "i": 0x7FFFFFFF}

def parse(path):
    b = open(path, "rb").read()
    hl = b[0]
    end = len(b) - 2 if hl else 0
    pos, defs, out = hl, {}, []
    while pos < end:
        h = b[pos]; pos += 1
        if h & 0x80:  # compressed timestamp header
            d = defs[(h >> 5) & 3]; pos += d["size"]; continue
        local = h & 0x0F
        if h & 0x40:
            pos += 1
            arch = b[pos]; pos += 1
            gm = struct.unpack("<H" if arch == 0 else ">H", b[pos:pos + 2])[0]; pos += 2
            n = b[pos]; pos += 1
            fields = []
            for _ in range(n):
                fields.append((b[pos], b[pos + 1], b[pos + 2])); pos += 3
            dev = 0
            if h & 0x20:
                m = b[pos]; pos += 1
                for _ in range(m): dev += b[pos + 1]; pos += 3
            defs[local] = {"arch": arch, "gm": gm, "fields": fields, "size": sum(f[1] for f in fields) + dev, "dev": dev}
        else:
            d = defs[local]; rec = b[pos:pos + d["size"]]; pos += d["size"]
            if d["gm"] != SESSION: continue
            row, o = {}, 0
            for num, size, bt in d["fields"]:
                raw = rec[o:o + size]; o += size
                name = F.get(num)
                if not name: continue
                if name == "profile":
                    row[name] = raw.split(b"\0")[0].decode("utf-8", "replace"); continue
                code, w = BASE.get(bt & 0x1F if bt not in BASE else bt, ("B", 1))
                if size != w: continue
                v = struct.unpack(("<" if d["arch"] == 0 else ">") + code, raw)[0]
                if INVALID.get(code) == v: continue
                row[name] = v / SCALE[name] if name in SCALE else v
            out.append(row)
    return out

def main(folder, dest):
    rows = []
    for f in sorted(glob.glob(os.path.join(folder, "*.fit")) + glob.glob(os.path.join(folder, "*.FIT"))):
        stem = os.path.splitext(os.path.basename(f))[0]
        try: ses = parse(f)
        except Exception as e:
            print("skip", stem, str(e)[:60]); continue
        try: local = datetime.datetime.strptime(stem[:19], "%Y-%m-%d-%H-%M-%S")
        except ValueError: local = None
        for i, s in enumerate(ses):
            utc = datetime.datetime.fromtimestamp(s["start"] + FIT_EPOCH, datetime.timezone.utc) if "start" in s else None
            rows.append({"id": stem if i == 0 else f"{stem}#{i}", "local": local.isoformat() if local else None, "date": local.date().isoformat() if local else (utc.date().isoformat() if utc else None),
                         "utc": utc.isoformat() if utc else None, "sport": s.get("sport"), "sub": s.get("sub_sport"), "name": s.get("profile"), "seconds": s.get("timer"), "meters": s.get("distance"),
                         "ascent_m": s.get("ascent"), "descent_m": s.get("descent"), "avg_hr": s.get("avg_hr"), "max_hr": s.get("max_hr"), "calories": s.get("calories")})
    json.dump(rows, open(dest, "w"), indent=1)
    print(len(rows), "activities ->", dest)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
