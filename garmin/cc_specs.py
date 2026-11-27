from fitlib import Ex, Rest, Rep

HIP = 'R hip >3/10: swap to dead bug'

def x(title, cat, name, lb=None, notes=None):
    """CC format: 3 rounds of 40s work / 20s rest, then next exercise."""
    return Rep(3, [Ex(title, cat, name, secs=40, lb=lb, notes=notes), Rest(20)])

ROW_CG = ('Close grip row', 'ROW', 'BENT_OVER_ROW_WITH_DUMBELL')
RDL = ('RDL', 'DEADLIFT', 'ROMANIAN_DEADLIFT')
ISO = ('ISO hold w bottom curl', 'CURL', 'DUMBBELL_BICEPS_CURL_WITH_STATIC_HOLD')
OHT = ('Overhead triceps ext', 'TRICEPS_EXTENSION', 'OVERHEAD_DUMBBELL_TRICEPS_EXTENSION')
DB = ('Dead bug', 'HIP_STABILITY', 'DEAD_BUG')
SKI = ('Skiers', 'HIP_SWING', 'SINGLE_ARM_DUMBBELL_SWING')
HAM = ('Hammer curl', 'CURL', 'DUMBBELL_HAMMER_CURL')
RCX = ('Rev crunch to extension', 'CRUNCH', 'REVERSE_CRUNCH')
LL = ('Lateral lunge', 'LUNGE', 'DUMBBELL_SIDE_LUNGE')
SQZ = ('Squeeze press', 'BENCH_PRESS', 'NEUTRAL_GRIP_DUMBBELL_BENCH_PRESS')
UPR = ('Upright row', 'SHRUG', 'DUMBBELL_UPRIGHT_ROW')

CC01 = ('CC01 Combo', [
    x('Side lateral raise', 'LATERAL_RAISE', 'DUMBBELL_LATERAL_RAISE', 10, 'Set 1 of 2. 40s on / 20s off x3 each'),
    x('B-stance squat', 'SQUAT', 'WEIGHTED_STAGGERED_SQUAT', 25, 'Switch lead leg each round'),
    x(*ROW_CG, 40),
    x('Chest press', 'BENCH_PRESS', 'DUMBBELL_BENCH_PRESS', 20),
    x(*RDL, 25, 'Set 2 of 2'),
    x(*ISO, 12.5),
    x(*OHT, 25),
    x(*DB),
])

CC05 = ('CC05 Combo', [
    x('Alt Arnold press', 'SHOULDER_PRESS', 'ARNOLD_PRESS', 15, 'Set 1 of 2. 40s on / 20s off x3 each'),
    x('Goblet squat', 'SQUAT', 'GOBLET_SQUAT', 40),
    x(*SKI, 15, 'DB skier swing'),
    x(*ROW_CG, 40),
    x(*HAM, 15, 'Set 2 of 2'),
    x('SDL knees soft', 'DEADLIFT', 'DUMBBELL_STRAIGHT_LEG_DEADLIFT', 25),
    x('Triceps press', 'TRICEPS_EXTENSION', 'DUMBBELL_LYING_TRICEPS_EXTENSION', 20),
    x(*RCX, notes=HIP),
])

CC10 = ('CC10 Combo', [
    x(*ISO, 12.5, 'Set 1 of 2. 40s on / 20s off x3 each'),
    x(*LL, 25),
    x(*OHT, 25),
    x(*SQZ, 20),
    x('Bent arm lateral raise', 'LATERAL_RAISE', 'DUMBBELL_LATERAL_RAISE', 12.5, 'Set 2 of 2'),
    x('Sumo squat', 'SQUAT', 'SUMO_SQUAT', 55),
    x('Supinated grip row', 'ROW', 'REVERSE_GRIP_BARBELL_ROW', 20, 'Dumbbells, palms up'),
    x('Tuck to extension', 'CORE', 'OPEN_KNEE_TUCKS', notes=HIP),
])

CC15 = ('CC15 Combo', [
    x(*UPR, 12.5, 'Set 1 of 2. 40s on / 20s off x3 each'),
    x(*RDL, 30),
    x('Alt chest press', 'BENCH_PRESS', 'ALTERNATING_DUMBBELL_CHEST_PRESS', 25),
    x(*SKI, 12.5, 'DB skier swing'),
    x(*HAM, 15, 'Set 2 of 2'),
    x('Narrow squat', 'SQUAT', 'DUMBBELL_SQUAT', 30, 'Feet hip width'),
    x(*ROW_CG, 40),
    x(*DB),
])

CC20 = ('CC20 Combo', [
    x(*UPR, 12.5, 'Set 1 of 2. 40s on / 20s off x3 each'),
    x('Alt reverse lunge', 'LUNGE', 'DUMBBELL_REVERSE_LUNGE', 25, 'R hip >3/10: swap to step-up'),
    x('Pronated grip row', 'ROW', 'BENT_OVER_ROW_WITH_DUMBELL', 20),
    x(*OHT, 25),
    x('Wide curl', 'CURL', 'DUMBBELL_BICEPS_CURL', 15, 'Set 2 of 2'),
    x(*LL, 30),
    x(*SQZ, 20),
    x(*RCX, notes=HIP),
])

CC = [CC01, CC05, CC10, CC15, CC20]
