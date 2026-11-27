"""Tiny DSL for building Garmin strength workout .fit files with fit-tool."""
import random
import time
from fit_tool.fit_file_builder import FitFileBuilder
from fit_tool.profile.messages.file_id_message import FileIdMessage
from fit_tool.profile.messages.workout_message import WorkoutMessage
from fit_tool.profile.messages.workout_step_message import WorkoutStepMessage
from fit_tool.profile.messages.exercise_title_message import ExerciseTitleMessage
import fit_tool.profile.profile_type as P

LB = 0.45359237

CAT = {c.name: c.value for c in P.ExerciseCategory}
_ENUM = {
    'BENCH_PRESS': P.BenchPressExerciseName, 'CALF_RAISE': P.CalfRaiseExerciseName,
    'CARRY': P.CarryExerciseName, 'CHOP': P.ChopExerciseName, 'CORE': P.CoreExerciseName,
    'CRUNCH': P.CrunchExerciseName, 'DEADLIFT': P.DeadliftExerciseName,
    'HIP_RAISE': P.HipRaiseExerciseName, 'HIP_STABILITY': P.HipStabilityExerciseName,
    'HIP_SWING': P.HipSwingExerciseName, 'HYPEREXTENSION': P.HyperextensionExerciseName,
    'LEG_RAISE': P.LegRaiseExerciseName, 'LUNGE': P.LungeExerciseName,
    'OLYMPIC_LIFT': P.OlympicLiftExerciseName, 'PLANK': P.PlankExerciseName,
    'PLYO': P.PlyoExerciseName, 'PULL_UP': P.PullUpExerciseName, 'PUSH_UP': P.PushUpExerciseName,
    'ROW': P.RowExerciseName, 'SHOULDER_PRESS': P.ShoulderPressExerciseName,
    'SHOULDER_STABILITY': P.ShoulderStabilityExerciseName, 'SIT_UP': P.SitUpExerciseName,
    'SQUAT': P.SquatExerciseName, 'TOTAL_BODY': P.TotalBodyExerciseName,
    'WARM_UP': P.WarmUpExerciseName, 'BANDED_EXERCISES': P.BandedExercisesExerciseName,
    'INDOOR_BIKE': P.IndoorBikeExerciseName, 'STAIR_STEPPER': P.StairStepperExerciseName,
    'CARDIO': P.CardioExerciseName, 'LATERAL_RAISE': P.LateralRaiseExerciseName,
    'CURL': P.CurlExerciseName, 'TRICEPS_EXTENSION': P.TricepsExtensionExerciseName,
    'SHRUG': P.ShrugExerciseName,
}


class Ex:
    def __init__(self, title, cat, name, reps=None, secs=None, lb=None, notes=None, step=None,
                 intensity='ACTIVE'):
        assert (reps is None) != (secs is None), title
        self.title, self.cat, self.name = title, cat, name
        self.reps, self.secs, self.lb, self.notes = reps, secs, lb, notes
        self.step = step or title
        self.intensity = intensity
        assert len(self.step) <= 32, self.step
        if notes:
            assert len(notes) <= 64, (title, len(notes), notes)
        CAT[cat]; getattr(_ENUM[cat], name)  # validate


class Rest:
    def __init__(self, secs):
        self.secs = secs


class Rep:
    def __init__(self, n, items):
        assert n > 1, 'only wrap in a repeat when sets > 1'
        self.n, self.items = n, items


def sides(title, cat, name, notes=None, **kw):
    """R then L steps for a single-side exercise."""
    return [Ex(title, cat, name, step=f'{title} R', notes=notes, **kw),
            Ex(title, cat, name, step=f'{title} L', **kw)]


def flatten(items):
    out = []
    for it in items:
        if isinstance(it, list):
            out.extend(flatten(it))
        else:
            out.append(it)
    return out


def build(name, items, path, serial, created_s):
    assert len(name) <= 20, name
    steps = []      # (kind, obj, extra)
    titles = {}     # (cat_val, name_val) -> title

    def emit(seq):
        for it in flatten(seq):
            if isinstance(it, Rep):
                start = len(steps)
                emit(it.items)
                steps.append(('rep', it, start))
            else:
                steps.append(('step', it, None))

    emit(items)
    msgs = []
    for i, (kind, it, extra) in enumerate(steps):
        m = WorkoutStepMessage()
        m.message_index = i
        if kind == 'rep':
            m.duration_type = P.WorkoutStepDuration.REPEAT_UNTIL_STEPS_CMPLT
            m.duration_step = extra
            m.target_type = P.WorkoutStepTarget.OPEN
            m.target_repeat_steps = it.n
        elif isinstance(it, Rest):
            m.workout_step_name = 'Rest'
            m.intensity = P.Intensity.REST
            m.duration_type = P.WorkoutStepDuration.TIME
            m.duration_time = float(it.secs)
            m.target_type = P.WorkoutStepTarget.OPEN
        else:
            m.workout_step_name = it.step
            m.intensity = getattr(P.Intensity, it.intensity)
            if it.reps is not None:
                m.duration_type = P.WorkoutStepDuration.REPS
                m.duration_reps = it.reps
            else:
                m.duration_type = P.WorkoutStepDuration.TIME
                m.duration_time = float(it.secs)
            m.target_type = P.WorkoutStepTarget.OPEN
            cv = CAT[it.cat]
            nv = getattr(_ENUM[it.cat], it.name).value
            m.exercise_category = cv
            m.exercise_name = nv
            if it.lb:
                m.exercise_weight = round(it.lb * LB, 2)
                m.weight_display_unit = 2  # pound
            if it.notes:
                m.notes = it.notes
            key = (cv, nv)
            if key in titles and titles[key] != it.title:
                raise ValueError(f'{name}: title clash {titles[key]} vs {it.title}')
            titles.setdefault(key, it.title)
        msgs.append(m)

    fid = FileIdMessage()
    fid.type = P.FileType.WORKOUT
    fid.manufacturer = P.Manufacturer.DEVELOPMENT.value
    fid.product = 0
    fid.serial_number = serial
    fid.time_created = created_s * 1000

    w = WorkoutMessage()
    w.workout_name = name
    w.sport = P.Sport.TRAINING
    w.sub_sport = P.SubSport.STRENGTH_TRAINING
    w.num_valid_steps = len(msgs)

    b = FitFileBuilder(auto_define=True, min_string_size=50)
    b.add(fid)
    b.add(w)
    for m in msgs:
        b.add(m)
    for i, ((cv, nv), t) in enumerate(titles.items()):
        et = ExerciseTitleMessage()
        et.message_index = i
        et.exercise_category = cv
        et.exercise_name = nv
        et.workout_step_name = t
        b.add(et)
    b.build().to_file(path)
    return len(msgs)
