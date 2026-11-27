import os, sys, time, random
sys.path.insert(0, os.path.dirname(__file__))
from fitlib import build
from cc_specs import CC
out = sys.argv[1]
base = int(time.time()) + 3600
rng = random.Random(base)
for i, (name, items) in enumerate(CC):
    serial = rng.randint(1_000_000_000, 4_000_000_000)
    fn = name.replace(' ', '_') + '.fit'
    n = build(name, items, os.path.join(out, fn), serial, base + i * 60)
    print(f'{fn:20s} steps={n} serial={serial}')
