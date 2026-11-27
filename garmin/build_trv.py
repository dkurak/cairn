import os, sys, time, random
sys.path.insert(0, os.path.dirname(__file__))
from fitlib import build
from trv_specs import TRV
out = sys.argv[1]
base = int(time.time()) + 7200
rng = random.Random(base)
for i, (name, items) in enumerate(TRV):
    serial = rng.randint(1_000_000_000, 4_000_000_000)
    fn = name.replace(' ', '_') + '.fit'
    print(fn, build(name, items, os.path.join(out, fn), serial, base + i * 60), serial)
