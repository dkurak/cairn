import os, sys, time, random
sys.path.insert(0, os.path.dirname(__file__))
from fitlib import build
from specs import ALL

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
base = int(time.time())
rng = random.Random(base)
used = set()
for i, (name, items) in enumerate(ALL):
    serial = rng.randint(1_000_000_000, 4_000_000_000)
    while serial in used:
        serial = rng.randint(1_000_000_000, 4_000_000_000)
    used.add(serial)
    fn = name.replace(' ', '_').replace('/', '-') + '.fit'
    n = build(name, items, os.path.join(out, fn), serial, base + i * 60)
    print(f'{fn:32s} steps={n:3d} serial={serial}')
