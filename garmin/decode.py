import sys, glob, os
from fit_tool.fit_file import FitFile
from fit_tool.profile.messages.workout_step_message import WorkoutStepMessage
from fit_tool.profile.messages.workout_message import WorkoutMessage
from fit_tool.profile.messages.exercise_title_message import ExerciseTitleMessage

def fmt_dur(step):
    dt = step.duration_type
    dv = step.duration_value
    name = getattr(dt, 'name', str(dt)) if dt is not None else None
    return name, dv

for path in sorted(glob.glob(os.path.join(sys.argv[1], '*.fit'))):
    print('=' * 70)
    print(os.path.basename(path))
    try:
        ff = FitFile.from_file(path)
    except Exception as e:
        print('  ERROR', e); continue
    titles = {}
    steps = []
    wname = None
    for rec in ff.records:
        m = rec.message
        if isinstance(m, WorkoutMessage):
            wname = m.workout_name
        elif isinstance(m, ExerciseTitleMessage):
            titles[(m.exercise_category, m.exercise_name)] = m.workout_step_name
        elif isinstance(m, WorkoutStepMessage):
            steps.append(m)
    print('Workout:', wname)
    for s in steps:
        dt = s.duration_type
        dtn = dt if not hasattr(dt, 'name') else dt.name
        it = s.intensity
        itn = it if not hasattr(it, 'name') else it.name
        line = f"  [{s.message_index}] {s.workout_step_name or ''} | dur_type={dtn} val={s.duration_value}"
        try:
            line += f" reps={s.duration_reps}"
        except Exception: pass
        try:
            line += f" time={s.duration_time}"
        except Exception: pass
        line += f" | int={itn} cat={s.exercise_category} ex={s.exercise_name}"
        try:
            if s.exercise_weight: line += f" wt={s.exercise_weight}"
        except Exception: pass
        try:
            line += f" target_val={s.target_value}"
        except Exception: pass
        if s.notes: line += f" | notes={s.notes}"
        t = titles.get((s.exercise_category, s.exercise_name))
        if t: line += f" | title={t}"
        print(line)
