from fitlib import Ex, Rest, Rep, sides

# ---------- shared blocks ----------
def warmup():
    return [
        Ex('Leg swings fwd/back', 'WARM_UP', 'FORWARD_AND_BACKWARD_LEG_SWINGS', reps=20, notes='10 each leg'),
        Ex('Leg swings side', 'WARM_UP', 'SIDE_TO_SIDE_LEG_SWINGS', reps=20, notes='10 each leg'),
        Ex('Walking knee hugs', 'WARM_UP', 'WALKING_KNEE_HUGS', reps=10),
        Ex('Hip circles', 'HIP_STABILITY', 'HIP_CIRCLES', reps=10),
        Ex('Air squat', 'SQUAT', 'AIR_SQUAT', reps=10),
        Ex('Arm circles', 'WARM_UP', 'ARM_CIRCLES', reps=10),
        Ex('Band pull-apart', 'BANDED_EXERCISES', 'PULL_APART', reps=15),
        Ex('Dead bug', 'HIP_STABILITY', 'DEAD_BUG', reps=10),
    ]

HIP = 'R hip >3/10: stop or swap'

# ---------- STR: heavy, anchor lift cycled with a pair ----------
STR1 = ('STR1 Squat Bench', warmup() + [
    Ex('Back squat', 'SQUAT', 'BARBELL_BACK_SQUAT', reps=5, lb=95, step='Squat ramp 95', intensity='WARMUP'),
    Ex('Back squat', 'SQUAT', 'BARBELL_BACK_SQUAT', reps=5, lb=115, step='Squat ramp 115', intensity='WARMUP'),
    Rep(5, [
        Ex('Back squat', 'SQUAT', 'BARBELL_BACK_SQUAT', reps=5, lb=135, notes='5x5 ~80% of 165 max. Knees first'),
        Ex('Band pull-apart', 'BANDED_EXERCISES', 'PULL_APART', reps=15),
        Rest(90)]),
    Ex('Bench press', 'BENCH_PRESS', 'BARBELL_BENCH_PRESS', reps=5, lb=135, step='Bench ramp 135', intensity='WARMUP'),
    Ex('Bench press', 'BENCH_PRESS', 'BARBELL_BENCH_PRESS', reps=5, lb=165, step='Bench ramp 165', intensity='WARMUP'),
    Rep(4, [
        Ex('Bench press', 'BENCH_PRESS', 'BARBELL_BENCH_PRESS', reps=5, lb=205, notes='4x5 ~80% of 255 max. +5 lb when clean'),
        sides('DB row', 'ROW', 'DUMBBELL_ROW', reps=8, lb=60),
        Rest(90)]),
    Rep(3, [
        sides('DB step-up', 'SQUAT', 'DUMBBELL_STEP_UP', reps=8, lb=50, notes='Drive knee up at top'),
        Ex('Face pull', 'ROW', 'FACE_PULL', reps=12, lb=40),
        Ex('SL calf raise', 'CALF_RAISE', 'SINGLE_LEG_STANDING_DUMBBELL_CALF_RAISE', reps=15, lb=25, notes='15 each leg'),
        Rest(60)]),
    Ex('Finisher EMOM', 'SQUAT', 'GOBLET_SQUAT', secs=360, lb=50,
       notes='Optional EMOM 6: 6 goblet sq + 8 push-ups'),
])

STR2 = ('STR2 Deadlift Pull', warmup() + [
    Ex('Deadlift', 'DEADLIFT', 'BARBELL_DEADLIFT', reps=5, lb=135, step='Deadlift ramp 135', intensity='WARMUP'),
    Ex('Deadlift', 'DEADLIFT', 'BARBELL_DEADLIFT', reps=5, lb=165, step='Deadlift ramp 165', intensity='WARMUP'),
    Rep(5, [
        Ex('Deadlift', 'DEADLIFT', 'BARBELL_DEADLIFT', reps=5, lb=205, notes='5x5 ~80% of max. Stop if back rounds'),
        Ex('Weighted pull-up', 'PULL_UP', 'WEIGHTED_PULL_UP', reps=5, lb=35, notes='+35 lb. Bodyweight if tired'),
        Rest(90)]),
    Rep(3, [
        sides('SL RDL', 'DEADLIFT', 'SINGLE_LEG_ROMANIAN_DEADLIFT_WITH_DUMBBELL', reps=8, lb=35),
        Ex('Farmer carry', 'CARRY', 'FARMERS_CARRY', secs=45, lb=70, notes='70 lb each hand'),
        Rest(60)]),
    Rep(3, [
        Ex('Goblet squat', 'SQUAT', 'GOBLET_SQUAT', reps=12, lb=60, notes='3s down'),
        Ex('Back extension', 'CORE', 'GHD_BACK_EXTENSIONS', reps=12),
        sides('Side plank', 'PLANK', 'SIDE_PLANK', secs=30),
        Rest(45)]),
    Ex('Finisher AMRAP', 'HIP_RAISE', 'KETTLEBELL_SWING', secs=360, lb=53,
       notes='Optional AMRAP 6: 12 KB swings + 6 burpees'),
])

STR3 = ('STR3 Front Sq Press', warmup() + [
    Rep(4, [
        Ex('Box jump', 'PLYO', 'BOX_JUMP', reps=3, notes='Step down. Skip if R hip flares'),
        Rest(45)]),
    Ex('Front squat', 'SQUAT', 'BARBELL_FRONT_SQUAT', reps=5, lb=45, step='Front sq ramp 45', intensity='WARMUP'),
    Ex('Front squat', 'SQUAT', 'BARBELL_FRONT_SQUAT', reps=5, lb=75, step='Front sq ramp 75', intensity='WARMUP'),
    Rep(4, [
        Ex('Front squat', 'SQUAT', 'BARBELL_FRONT_SQUAT', reps=5, lb=105, notes='4x5. +5 lb when all sets clean'),
        Ex('Dead bug', 'HIP_STABILITY', 'DEAD_BUG', reps=8),
        Rest(90)]),
    Ex('Overhead press', 'SHOULDER_PRESS', 'OVERHEAD_BARBELL_PRESS', reps=5, lb=75, step='OHP ramp 75', intensity='WARMUP'),
    Ex('Overhead press', 'SHOULDER_PRESS', 'OVERHEAD_BARBELL_PRESS', reps=5, lb=95, step='OHP ramp 95', intensity='WARMUP'),
    Rep(4, [
        Ex('Overhead press', 'SHOULDER_PRESS', 'OVERHEAD_BARBELL_PRESS', reps=5, lb=125, notes='4x5 ~80% of 155 max. +5 lb when clean'),
        Ex('Pull-up', 'PULL_UP', 'PULL_UP', reps=10),
        Rest(90)]),
    Rep(3, [
        sides('DB side lunge', 'LUNGE', 'DUMBBELL_SIDE_LUNGE', reps=8, lb=35),
        Ex('Calf raise', 'CALF_RAISE', 'STANDING_DUMBBELL_CALF_RAISE', reps=15, lb=50),
        Ex('Face pull', 'ROW', 'FACE_PULL', reps=12, lb=40),
        Rest(60)]),
    Ex('Finisher AMRAP', 'SQUAT', 'DUMBBELL_THRUSTERS', secs=420, lb=35,
       notes='Optional AMRAP 7: 5 thrusters, 7 push-up, 10 air sq'),
])

# ---------- EZ: easy days, stay at RPE 5 ----------
EZ_NOTE = 'Easy day. RPE 5, nothing to failure'

EZ1 = ('EZ1 Upper Core', [
    Ex('Arm circles', 'WARM_UP', 'ARM_CIRCLES', reps=10),
    Ex('Band pull-apart', 'BANDED_EXERCISES', 'PULL_APART', reps=15),
    Rep(3, [
        Ex('Push-up', 'PUSH_UP', 'PUSH_UP', reps=25, notes=EZ_NOTE),
        Ex('Pull-up', 'PULL_UP', 'PULL_UP', reps=8),
        Ex('Band pull-apart', 'BANDED_EXERCISES', 'PULL_APART', reps=15),
        Rest(45)]),
    Rep(3, [
        Ex('DB shoulder press', 'SHOULDER_PRESS', 'DUMBBELL_SHOULDER_PRESS', reps=10, lb=35),
        Ex('Chest-supported row', 'ROW', 'CHEST_SUPPORTED_DUMBBELL_ROW', reps=12, lb=45),
        Ex('Dead bug', 'HIP_STABILITY', 'DEAD_BUG', reps=10),
        Rest(45)]),
    Rep(2, [
        sides('Side plank', 'PLANK', 'SIDE_PLANK', secs=30),
        Ex('Farmer carry', 'CARRY', 'FARMERS_CARRY', secs=45, lb=60, notes='60 lb each hand'),
        Rest(30)]),
])

EZ2 = ('EZ2 Light Full Body', warmup()[:5] + [
    Rep(3, [
        Ex('Goblet squat', 'SQUAT', 'GOBLET_SQUAT', reps=10, lb=35, notes=EZ_NOTE),
        Ex('Push-up', 'PUSH_UP', 'PUSH_UP', reps=10),
        Ex('DB RDL', 'DEADLIFT', 'ROMANIAN_DEADLIFT', reps=10, lb=35, notes='35 lb each hand'),
        Rest(45)]),
    Rep(3, [
        sides('Step-up', 'SQUAT', 'STEP_UP', reps=8, notes='Bodyweight, slow'),
        sides('DB row', 'ROW', 'DUMBBELL_ROW', reps=10, lb=35),
        Rest(45)]),
    Rep(2, [
        sides('SL glute bridge', 'HIP_RAISE', 'SINGLE_LEG_HIP_RAISE', reps=10),
        Ex('Dead bug', 'HIP_STABILITY', 'DEAD_BUG', reps=10),
        Ex('Calf raise', 'CALF_RAISE', 'STANDING_CALF_RAISE', reps=20),
        Rest(30)]),
])

EZ3 = ('EZ3 Bike Core', [
    Ex('Easy bike', 'INDOOR_BIKE', 'STATIONARY_BIKE', secs=720, notes='Zone 1-2 spin, legs flush'),
    Rep(3, [
        Ex('Dead bug', 'HIP_STABILITY', 'DEAD_BUG', reps=10, notes=EZ_NOTE),
        sides('Side plank', 'PLANK', 'SIDE_PLANK', secs=30),
        Ex('Superman', 'HYPEREXTENSION', 'SUPERMAN_FROM_FLOOR', reps=10),
        Ex('Glute bridge', 'HIP_RAISE', 'HIP_RAISE', reps=15),
        Rest(30)]),
    Ex('Cat-cow', 'WARM_UP', 'STRETCH_CAT_COW', reps=10),
    sides('Kneeling HF stretch', 'WARM_UP', 'STRETCH_LUNGING_HIP_FLEXOR', secs=45, notes='Tuck pelvis, gentle'),
])

# ---------- SKI phase 1: hip rehab (from Ski Hip A-D) ----------
KD = 'LEG_RAISE'
SKI1 = ('SKI1 Hip Strength', [
    Ex('Leg swings', 'WARM_UP', 'FORWARD_AND_BACKWARD_LEG_SWINGS', secs=120, notes='Front-back and side-side, easy'),
    Rest(15),
    Rep(4, [
        sides('Wall march hold', KD, 'HANGING_KNEE_RAISE', secs=40, notes='Knee above hip, back to wall, 3/10 max'),
        Rest(30)]),
    Ex('Wall march hold', KD, 'HANGING_KNEE_RAISE', secs=40, step='Wall march hold R+1', notes='Extra right-side set'),
    Rest(30),
    Rep(3, [
        sides('Knee drive ankle wt', KD, 'WEIGHTED_HANGING_KNEE_RAISE', reps=15, lb=5,
              notes='5 lb, 2s up 2s down. 10 lb at 3/10 max'),
        Rest(60)]),
    Ex('Knee drive ankle wt', KD, 'WEIGHTED_HANGING_KNEE_RAISE', reps=15, lb=5, step='Knee drive ankle wt R+1',
       notes='Extra right-side set'),
    Rest(60),
    Rep(3, [
        sides('Seated knee lift', KD, 'HANGING_SINGLE_LEG_RAISE', reps=10, notes='Sit tall, lift knee off seat, hold 3s'),
        Rest(45)]),
    Rep(3, [
        sides('SL glute bridge', 'HIP_RAISE', 'SINGLE_LEG_HIP_RAISE', reps=12, notes='Squeeze glute at top'),
        Rest(45)]),
    Rep(3, [
        sides('Side plank', 'PLANK', 'SIDE_PLANK', secs=30),
        Rest(30)]),
    Rep(3, [
        Ex('Dead bug', 'HIP_STABILITY', 'DEAD_BUG', reps=10, notes='Low back flat'),
        Rest(30)]),
])

SKI2 = ('SKI2 Hip Endurance', [
    Ex('Leg swings', 'WARM_UP', 'FORWARD_AND_BACKWARD_LEG_SWINGS', secs=120),
    Rest(15),
    Rep(3, [
        Ex('Weighted march', 'WARM_UP', 'WALKING_HIGH_KNEES', secs=120, lb=5,
           notes='Ankle wts 5 lb, slow. Build 2:00 to 3:00'),
        Rest(90)]),
    Rep(3, [
        sides('Step-up w pack', 'SQUAT', 'WEIGHTED_STEP_UP', reps=10, notes='Wear touring pack, drive knee at top'),
        Rest(60)]),
    Ex('Step-up w pack', 'SQUAT', 'WEIGHTED_STEP_UP', reps=10, step='Step-up w pack R+1', notes='Extra right-side set'),
    Rest(60),
    Rep(2, [
        sides('Knee drive ankle wt', KD, 'WEIGHTED_HANGING_KNEE_RAISE', reps=20, lb=5, notes='Ankle wts, controlled'),
        Rest(60)]),
    Rep(3, [
        sides('Side-lying leg raise', 'HIP_STABILITY', 'SIDE_LYING_LEG_RAISE', reps=15, notes='Glute med, toes forward'),
        Rest(30)]),
    Rep(2, [
        Ex('Dead bug', 'HIP_STABILITY', 'DEAD_BUG', reps=10),
        Rest(30)]),
])

SKI3 = ('SKI3 Mobility Recov', [
    Ex('Easy bike', 'INDOOR_BIKE', 'STATIONARY_BIKE', secs=480, notes='Optional. Easy spin to warm up'),
    Ex('Leg swings', 'WARM_UP', 'FORWARD_AND_BACKWARD_LEG_SWINGS', secs=90),
    Ex('Cat-cow', 'WARM_UP', 'STRETCH_CAT_COW', reps=10, notes='Arch look up, round look down'),
    Rep(2, [
        sides('Kneeling HF stretch', 'WARM_UP', 'STRETCH_LUNGING_HIP_FLEXOR', secs=45, notes='Tuck pelvis, squeeze glute'),
        Rest(10)]),
    Rep(2, [
        Ex('90/90 switches', 'WARM_UP', 'STRETCH_90_90', reps=10, notes='Gentle, stay out of rotation pain'),
        Rest(15)]),
    Rep(2, [
        sides('Pigeon / figure-4', 'WARM_UP', 'STRETCH_PIGEON_POSE', secs=45),
        Rest(10)]),
    Rep(2, [
        sides('Couch stretch', 'WARM_UP', 'STRETCH_HIP_FLEXOR_AND_QUAD', secs=45, notes='Week 3+ only, skip if sharp'),
        Rest(10)]),
    sides('Knee-wall ankle mob', 'WARM_UP', 'ANKLE_DORSIFLEXION_WITH_BAND', reps=10),
    Ex('Calf raise', 'CALF_RAISE', 'STANDING_CALF_RAISE', reps=20),
])

SKI4 = ('SKI4 Trailhead', [
    Ex('Leg swings', 'WARM_UP', 'FORWARD_AND_BACKWARD_LEG_SWINGS', secs=90),
    Rest(5),
    Ex('Walking knee hugs', 'WARM_UP', 'WALKING_KNEE_HUGS', reps=10),
    Rest(5),
    Ex('Easy march', 'WARM_UP', 'WALKING_HIGH_KNEES', secs=60, notes='No weights, easy high knees'),
    Rest(5),
    sides('Kneeling HF stretch', 'WARM_UP', 'STRETCH_LUNGING_HIP_FLEXOR', secs=20, notes='Short and gentle, not a deep stretch'),
])

# ---------- SKI phase 2: general ski fitness (after the hip gate) ----------
SKI5 = ('SKI5 Uphill', [
    Ex('Leg swings', 'WARM_UP', 'FORWARD_AND_BACKWARD_LEG_SWINGS', secs=90),
    Ex('Walking knee hugs', 'WARM_UP', 'WALKING_KNEE_HUGS', reps=10),
    Rep(4, [
        sides('Step-up w pack', 'SQUAT', 'WEIGHTED_STEP_UP', reps=10, notes='25-30 lb pack, high box, drive knee'),
        Rest(60)]),
    Rep(3, [
        sides('SL RDL', 'DEADLIFT', 'SINGLE_LEG_ROMANIAN_DEADLIFT_WITH_DUMBBELL', reps=8, lb=35),
        sides('Knee drive ankle wt', 'LEG_RAISE', 'WEIGHTED_HANGING_KNEE_RAISE', reps=15, lb=10),
        Rest(60)]),
    Rep(3, [
        Ex('Weighted march', 'WARM_UP', 'WALKING_HIGH_KNEES', secs=180, lb=10, notes='10 lb ankle wts, steady'),
        sides('SL calf raise', 'CALF_RAISE', 'SINGLE_LEG_STANDING_CALF_RAISE', reps=15),
        Rest(60)]),
    Rep(2, [
        sides('Copenhagen plank', 'PLANK', 'SIDE_PLANK_WITH_FEET_ON_BENCH', secs=20, notes='Top leg on bench, short lever ok'),
        Rest(30)]),
])

SKI6 = ('SKI6 Downhill', [
    Ex('Leg swings', 'WARM_UP', 'FORWARD_AND_BACKWARD_LEG_SWINGS', secs=90),
    Ex('Air squat', 'SQUAT', 'AIR_SQUAT', reps=10),
    Rep(4, [
        Ex('Lateral bound', 'PLYO', 'LATERAL_LEAP_AND_HOP', reps=12, notes='6 each way, stick landing 2s'),
        Rest(45)]),
    Rep(3, [
        Ex('Wall sit', 'SQUAT', 'WEIGHTED_WALL_SQUAT', secs=60, lb=25, notes='Plate on lap, thighs parallel'),
        Ex('Tempo goblet squat', 'SQUAT', 'GOBLET_SQUAT', reps=8, lb=50, notes='4s down, 1s pause'),
        Rest(60)]),
    Rep(3, [
        Ex('Box jump', 'PLYO', 'BOX_JUMP', reps=5, notes='Step down'),
        sides('DB side lunge', 'LUNGE', 'DUMBBELL_SIDE_LUNGE', reps=8, lb=35),
        Rest(60)]),
    Rep(3, [
        sides('Cable woodchop', 'CHOP', 'CABLE_WOODCHOP', reps=10),
        Ex('Dead bug', 'HIP_STABILITY', 'DEAD_BUG', reps=10),
        Rest(30)]),
])

SKI7 = ('SKI7 Tour Inside', [
    Ex('Stair stepper', 'STAIR_STEPPER', 'STAIR_STEPPER', secs=300, step='Stepper warm-up',
       intensity='WARMUP', notes='Easy, no pack'),
    Ex('Stair stepper', 'STAIR_STEPPER', 'STAIR_STEPPER', secs=3000, lb=25, step='Stepper with pack',
       notes='25 lb pack, Zone 2 skin-track pace'),
    Ex('Stair stepper', 'STAIR_STEPPER', 'STAIR_STEPPER', secs=300, step='Stepper cool-down',
       intensity='COOLDOWN'),
])

# ---------- SURF: dryland, start 4-6 weeks before a trip ----------
SURF1 = ('SURF1 Paddle', [
    Ex('Arm circles', 'WARM_UP', 'ARM_CIRCLES', reps=10),
    Ex('Band pull-apart', 'BANDED_EXERCISES', 'PULL_APART', reps=15),
    Ex('Cat-cow', 'WARM_UP', 'STRETCH_CAT_COW', reps=8),
    Ex('Thoracic rotation', 'WARM_UP', 'THORACIC_ROTATION', reps=16, notes='8 each side'),
    Rep(4, [
        Ex('Pull-up', 'PULL_UP', 'PULL_UP', reps=8),
        Ex('Prone Y-T-W', 'SHOULDER_STABILITY', 'FLOOR_Y_RAISE', reps=8, notes='8 each letter, chest on floor'),
        Ex('Push-up', 'PUSH_UP', 'PUSH_UP', reps=15),
        Rest(60)]),
    Rep(3, [
        Ex('Band paddle pull', 'BANDED_EXERCISES', 'LATPULL', reps=20, notes='Straight arms, alternate like paddling'),
        Ex('Superman hold', 'HYPEREXTENSION', 'SUPERMAN_FROM_FLOOR', secs=30, notes='Chest and arms up, paddle position'),
        Rest(45)]),
    Rep(3, [
        Ex('Pop-up', 'TOTAL_BODY', 'SQUAT_PLANK_PUSH_UP', reps=8, notes='Prone to stance. R hip: go slow'),
        Ex('Cobra hold', 'HYPEREXTENSION', 'COBRA', secs=30),
        Rest(45)]),
])

SURF2 = ('SURF2 Pop-up Cond', [
    Ex('Arm circles', 'WARM_UP', 'ARM_CIRCLES', reps=10),
    Ex('Leg swings', 'WARM_UP', 'FORWARD_AND_BACKWARD_LEG_SWINGS', reps=20, notes='10 each leg'),
    Ex('Inchworm', 'CORE', 'INCHWORM', reps=5),
    Rep(5, [
        Ex('Burpee pop-up', 'TOTAL_BODY', 'BURPEE', secs=40, notes='Land in surf stance each rep'),
        Rest(20),
        Ex('Skater hop', 'PLYO', 'LATERAL_SLIDE', secs=40),
        Rest(20),
        Ex('Band paddle pull', 'BANDED_EXERCISES', 'LATPULL', secs=40),
        Rest(20),
        Ex('Rotational chop', 'CHOP', 'STANDING_ROTATIONAL_CHOP', secs=40, notes='Cable or band, switch sides each round'),
        Rest(60)]),
    Rep(3, [
        sides('Single-leg balance', 'TOTAL_BODY', 'STANDING_T_ROTATION_BALANCE', secs=30, notes='Bosu or pad if available'),
        sides('Side plank', 'PLANK', 'SIDE_PLANK', secs=30),
        Rest(30)]),
])

ALL = [STR1, STR2, STR3, EZ1, EZ2, EZ3, SKI1, SKI2, SKI3, SKI4, SKI5, SKI6, SKI7, SURF1, SURF2]
