// Garmin strength workout .fit writer. Port of garmin/fitlib.py (fit-tool), no dependencies.
// Rules learned the hard way (keep them):
// - sport = TRAINING, sub_sport = STRENGTH_TRAINING
// - exercise_category + exercise_name on every exercise step, plus ExerciseTitle messages for custom names
// - unique serial_number and time_created per file, or the watch overwrites
// - only wrap a step in a repeat when sets > 1
// - workout name <= 20 chars
import EX from "./exercises.json";
import type { GarminStep } from "./steps";

const EXERCISES = EX as Record<string, { id: number; names: Record<string, number> }>;
const LB_TO_KG = 0.45359237;
const FIT_EPOCH_MS = 631065600000; // 1989-12-31T00:00:00Z

const DUR = { TIME: 0, OPEN: 5, REPEAT_UNTIL_STEPS_CMPLT: 6, REPS: 29 } as const;
const INTENSITY: Record<string, number> = { active: 0, rest: 1, warmup: 2, cooldown: 3, recovery: 4 };
const TARGET_OPEN = 2;

// base types
const ENUM = 0x00, UINT16 = 0x84, UINT32 = 0x86, UINT32Z = 0x8c, STRING = 0x07;
const NAME_LEN = 50; // fitlib used min_string_size=50
const NOTES_LEN = 65; // 64 bytes + NUL

type FieldDef = [num: number, size: number, type: number];
type Value = number | string | undefined;

const MSG = {
  file_id: { global: 0, local: 0, fields: [[0, 1, ENUM], [1, 2, UINT16], [2, 2, UINT16], [3, 4, UINT32Z], [4, 4, UINT32]] as FieldDef[] },
  workout: { global: 26, local: 1, fields: [[4, 1, ENUM], [6, 2, UINT16], [8, NAME_LEN, STRING], [11, 1, ENUM]] as FieldDef[] },
  step: {
    global: 27, local: 2,
    fields: [[254, 2, UINT16], [0, NAME_LEN, STRING], [1, 1, ENUM], [2, 4, UINT32], [3, 1, ENUM], [4, 4, UINT32], [7, 1, ENUM], [8, NOTES_LEN, STRING], [10, 2, UINT16], [11, 2, UINT16], [12, 2, UINT16], [13, 2, UINT16]] as FieldDef[],
  },
  title: { global: 264, local: 3, fields: [[254, 2, UINT16], [0, 2, UINT16], [1, 2, UINT16], [2, NAME_LEN, STRING]] as FieldDef[] },
};

class Writer {
  private buf: number[] = [];
  u8(v: number) { this.buf.push(v & 0xff); }
  u16(v: number) { this.u8(v); this.u8(v >> 8); }
  u32(v: number) { this.u16(v & 0xffff); this.u16(Math.floor(v / 0x10000)); }
  bytes(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.u8(b[i]); }
  get length() { return this.buf.length; }
  toArray() { return Uint8Array.from(this.buf); }
}

/** UTF-8 bytes cut to a whole character so it fits in max bytes. */
export function utf8Cut(s: string, max: number): Uint8Array {
  const enc = new TextEncoder();
  let out = enc.encode(s);
  while (out.length > max) { s = s.slice(0, -1); out = enc.encode(s); }
  return out;
}

function writeDefinition(w: Writer, m: (typeof MSG)[keyof typeof MSG]) {
  w.u8(0x40 | m.local);
  w.u8(0); // reserved
  w.u8(0); // little endian
  w.u16(m.global);
  w.u8(m.fields.length);
  for (const [num, size, type] of m.fields) { w.u8(num); w.u8(size); w.u8(type); }
}

function writeData(w: Writer, m: (typeof MSG)[keyof typeof MSG], values: Record<number, Value>) {
  w.u8(m.local);
  for (const [num, size, type] of m.fields) {
    const v = values[num];
    if (type === STRING) {
      const b = typeof v === "string" ? utf8Cut(v, size - 1) : new Uint8Array();
      w.bytes(b);
      for (let i = b.length; i < size; i++) w.u8(0);
    } else if (v === undefined || v === null) {
      if (type === ENUM) w.u8(0xff);
      else if (type === UINT16) w.u16(0xffff);
      else if (type === UINT32Z) w.u32(0);
      else w.u32(0xffffffff);
    } else if (size === 1) w.u8(Number(v));
    else if (size === 2) w.u16(Number(v));
    else w.u32(Number(v));
  }
}

const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
function crc16(bytes: Uint8Array, crc = 0) {
  for (const byte of bytes) {
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf];
  }
  return crc;
}

export function garminIds(category: string, name: string): [number, number] | null {
  const c = EXERCISES[category];
  const n = c?.names[name];
  return c && n !== undefined ? [c.id, n] : null;
}

export type FitOptions = { serial: number; createdMs: number };

/** Build a .fit workout file from Cairn's Garmin steps (the `steps` column). */
export function buildWorkoutFit(name: string, steps: GarminStep[], opts: FitOptions): Uint8Array {
  type Flat = { kind: "rep"; times: number; start: number } | { kind: "step"; s: Exclude<GarminStep, { type: "repeat" }> };
  const flat: Flat[] = [];
  const emit = (seq: GarminStep[]) => {
    for (const s of seq) {
      if (s.type === "repeat") {
        if (s.times > 1) {
          const start = flat.length;
          emit(s.steps);
          flat.push({ kind: "rep", times: s.times, start });
        } else emit(s.steps); // only wrap in a repeat when sets > 1
      } else flat.push({ kind: "step", s });
    }
  };
  emit(steps);

  const titles = new Map<string, { cat: number; name: number; title: string }>();
  const body = new Writer();
  writeDefinition(body, MSG.file_id);
  writeData(body, MSG.file_id, { 0: 5 /* workout */, 1: 255 /* development */, 2: 0, 3: opts.serial >>> 0, 4: Math.round((opts.createdMs - FIT_EPOCH_MS) / 1000) });
  writeDefinition(body, MSG.workout);
  writeData(body, MSG.workout, { 4: 10 /* training */, 6: flat.length, 8: name.slice(0, 20), 11: 20 /* strength_training */ });
  writeDefinition(body, MSG.step);
  flat.forEach((f, i) => {
    const v: Record<number, Value> = { 254: i, 3: TARGET_OPEN };
    if (f.kind === "rep") {
      Object.assign(v, { 1: DUR.REPEAT_UNTIL_STEPS_CMPLT, 2: f.start, 4: f.times });
    } else if (f.s.type === "rest") {
      Object.assign(v, { 0: "Rest", 1: DUR.TIME, 2: Math.round(f.s.seconds * 1000), 7: INTENSITY.rest });
    } else {
      const s = f.s;
      const ids = garminIds(s.garmin_category, s.garmin_name);
      if (!ids) throw new Error(`${name}: unknown Garmin exercise ${s.garmin_category}/${s.garmin_name}`);
      v[0] = s.step_name || s.title;
      v[7] = INTENSITY[s.intensity ?? "active"] ?? 0;
      if (s.reps != null) { v[1] = DUR.REPS; v[2] = s.reps; }
      else if (s.seconds != null) { v[1] = DUR.TIME; v[2] = Math.round(s.seconds * 1000); }
      else v[1] = DUR.OPEN; // press lap when done
      [v[10], v[11]] = ids;
      if (s.weight_lb) { v[12] = Math.round(s.weight_lb * LB_TO_KG * 100); v[13] = 2; /* pound */ }
      if (s.notes) v[8] = s.notes;
      const key = ids.join(":");
      const had = titles.get(key);
      if (had && had.title !== s.title) throw new Error(`${name}: title clash ${had.title} vs ${s.title}`);
      if (!had) titles.set(key, { cat: ids[0], name: ids[1], title: s.title });
    }
    writeData(body, MSG.step, v);
  });
  writeDefinition(body, MSG.title);
  [...titles.values()].forEach((t, i) => writeData(body, MSG.title, { 254: i, 0: t.cat, 1: t.name, 2: t.title }));

  const data = body.toArray();
  const head = new Writer();
  head.u8(14); head.u8(0x20); head.u16(2141); head.u32(data.length); head.bytes([0x2e, 0x46, 0x49, 0x54]); // ".FIT"
  const h12 = head.toArray();
  head.u16(crc16(h12));
  const header = head.toArray();
  const out = new Uint8Array(header.length + data.length + 2);
  out.set(header, 0);
  out.set(data, header.length);
  const crc = crc16(out.subarray(0, header.length + data.length));
  out[out.length - 2] = crc & 0xff;
  out[out.length - 1] = crc >> 8;
  return out;
}

/** File name for a workout on the watch (and in downloads). */
export const fitFileName = (name: string) => `${name.slice(0, 20).replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "_") || "workout"}.fit`;

/** Random serial in the same range build_all.py used. */
export const randomSerial = () => 1_000_000_000 + Math.floor(Math.random() * 3_000_000_000);
