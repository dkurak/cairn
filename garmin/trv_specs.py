from fitlib import Ex, Rest, Rep, sides

KD = 'LEG_RAISE'
def x(title, cat, name, notes=None):
    return Rep(3, [Ex(title, cat, name, secs=40, notes=notes), Rest(20)])

TRV1 = ('TRV1 Hotel Hip', [
    Ex('Leg swings', 'WARM_UP', 'FORWARD_AND_BACKWARD_LEG_SWINGS', secs=120, notes='Front-back and side-side, easy'),
    Rep(4, [sides('Wall march hold', KD, 'HANGING_KNEE_RAISE', secs=40, notes='Back to hotel wall, knee above hip, 3/10 max'), Rest(30)]),
    Ex('Wall march hold', KD, 'HANGING_KNEE_RAISE', secs=40, step='Wall march hold R+1', notes='Extra right-side set'),
    Rest(30),
    Rep(3, [sides('Standing knee drive', KD, 'WEIGHTED_HANGING_KNEE_RAISE', reps=15,
                  notes='Ankle wts if packed, else 3s up 3s down'), Rest(45)]),
    Ex('Standing knee drive', KD, 'WEIGHTED_HANGING_KNEE_RAISE', reps=15, step='Standing knee drive R+1', notes='Extra right-side set'),
    Rest(45),
    Rep(3, [sides('Seated knee lift', KD, 'HANGING_SINGLE_LEG_RAISE', reps=10, notes='Hotel chair, sit tall, hold 3s'), Rest(30)]),
    Rep(3, [Ex('Slow march', 'WARM_UP', 'WALKING_HIGH_KNEES', secs=120, notes='In place, ankle wts if packed. Build to 3:00'), Rest(60)]),
    Rep(3, [sides('SL glute bridge', 'HIP_RAISE', 'SINGLE_LEG_HIP_RAISE', reps=12, notes='Floor or bed edge, squeeze glute'), Rest(30)]),
    Rep(2, [sides('Side plank', 'PLANK', 'SIDE_PLANK', secs=30), Ex('Dead bug', 'HIP_STABILITY', 'DEAD_BUG', reps=10), Rest(30)]),
])

TRV2 = ('TRV2 Hotel Full Body', [
    x('Push-up', 'PUSH_UP', 'PUSH_UP', 'Set 1 of 2. 40s on / 20s off x3 each'),
    x('Tempo air squat', 'SQUAT', 'AIR_SQUAT', '3s down, 1s pause'),
    x('SL RDL bodyweight', 'DEADLIFT', 'SINGLE_LEG_RDL_CIRCUIT', 'Switch legs each round, reach long'),
    x('Plank shoulder tap', 'PLANK', 'PLANK_WITH_ARM_RAISE', 'Hips still'),
    x('Pike push-up', 'PUSH_UP', 'PIKE_PUSH_UP', 'Set 2 of 2. Feet on bed to make it harder'),
    x('Side lunge', 'LUNGE', 'SIDE_LUNGE', 'Alternate sides'),
    x('Glute bridge', 'HIP_RAISE', 'HIP_RAISE', 'Squeeze 2s at top'),
    x('Dead bug', 'HIP_STABILITY', 'DEAD_BUG'),
])

TRV3 = ('TRV3 Hotel Upper', [
    Ex('Arm circles', 'WARM_UP', 'ARM_CIRCLES', reps=10),
    Ex('Thoracic rotation', 'WARM_UP', 'THORACIC_ROTATION', reps=16, notes='8 each side'),
    Rep(3, [Ex('Push-up', 'PUSH_UP', 'PUSH_UP', reps=25, notes='Legs off day. RPE 6'),
            Ex('Chair dip', 'TRICEPS_EXTENSION', 'BENCH_DIP', reps=12, notes='Sturdy chair or bed edge'),
            Ex('Prone Y-T-W', 'SHOULDER_STABILITY', 'FLOOR_Y_RAISE', reps=8, notes='8 each letter'),
            Rest(45)]),
    Rep(3, [Ex('Pike push-up', 'PUSH_UP', 'PIKE_PUSH_UP', reps=8),
            Ex('Superman', 'HYPEREXTENSION', 'SUPERMAN_FROM_FLOOR', reps=10),
            Ex('Diamond push-up', 'PUSH_UP', 'DIAMOND_PUSH_UP', reps=8),
            Rest(45)]),
    Rep(2, [sides('Side plank', 'PLANK', 'SIDE_PLANK', secs=30), Ex('Dead bug', 'HIP_STABILITY', 'DEAD_BUG', reps=10), Rest(30)]),
])

TRV4 = ('TRV4 Drive Reset', [
    Ex('Leg swings', 'WARM_UP', 'FORWARD_AND_BACKWARD_LEG_SWINGS', reps=20, notes='Every stop. 10 each leg, hold the car'),
    Ex('Walking knee hugs', 'WARM_UP', 'WALKING_KNEE_HUGS', reps=10),
    sides('Standing HF stretch', 'WARM_UP', 'STRETCH_LUNGING_HIP_FLEXOR', secs=30, notes='Short stance, tuck pelvis, gentle'),
    Ex('Glute bridge', 'HIP_RAISE', 'HIP_RAISE', reps=10, notes='Optional, if there is grass or a hotel floor'),
    Ex('Calf raise', 'CALF_RAISE', 'STANDING_CALF_RAISE', reps=20),
    Ex('Thoracic rotation', 'WARM_UP', 'THORACIC_ROTATION', reps=10, notes='5 each side'),
])

TRV = [TRV1, TRV2, TRV3, TRV4]
