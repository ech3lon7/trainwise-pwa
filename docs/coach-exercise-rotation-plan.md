# Coach exercise rotation and omission notices

## Verified problem

The October 6 report records Lateral Raises on September 11 and then October 5,
a 24-day gap ending with the user's manual override. The exercise is active.
Replaying candidate ranking for October 5 before that day's submitted work gives
Face Pulls 17, Overhead Press 13.5, and Lateral Raises 12.5: all are eligible.
With back and abs floor deficits, the scores become 23, 25.5, and 12.5.

Recency only penalizes use within 12 days; longer absence earns no priority.
The weekly optimizer scores muscle attainment, not exercise coverage, and can
replace or remove a direct block while retaining enough secondary credits.
There is no complete explanation of exercises omitted from the resulting plan.

The saved October 5 plan does contain two Lateral Raise sets on October 8.
The October 6 debug weekly plan is a fresh calculation, not that saved schedule.
It counts four submitted shoulder sets plus eight secondary credits and contains
no direct shoulder block. These are distinct outputs and must be identified as such.

## Expected behavior

Every active exercise participates in rotation across feasible training slots.
An eligible exercise must not be indefinitely outranked by repeatedly used peers.
Already submitted manual work counts toward rotation. Archived exercises are excluded.
Every active exercise is accounted for as submitted, planned, or deferred with a reason.
Rotation continues across weeks when the whole library cannot fit into one week.
Recovery, selected dates, time limits, minimum blocks, prescriptions, and target
coverage remain constraints; a conflict is reported rather than silently bypassed.

## Task 1: Selection that prevents indefinite omission

Files: app.js and coach-regression.test.js. Dependencies: none.

- Rank eligible exercises using least-recent submitted use and planned use before
  ordinary performance/stimulus tie breakers; include never-used active exercises.
- Apply the same rotation ordering to Today and weekly selection. Weekly eligibility
  must be evaluated for the planned date, rather than today's date alone.
- Tests: a 24-day unused eligible exercise wins over repeatedly used peers; successive
  submitted plans eventually cover the active alternatives; manual submissions,
  archived definitions, and recovery are handled correctly.

Verification: run focused scenarios and the Coach regression suite. Compare the
October 5 counterfactual with the current result, documenting the report's 120-day
history limit rather than treating exported lifetime counts as a full backup.

## Task 2: Preserve rotation through weekly planning

Files: app.js and coach-regression.test.js. Dependency: Task 1.

- Reserve feasible direct exercise turns so secondary credits cannot silently erase
  them; favor exchanging redundant work over increasing weekly volume.
- Carry exercise coverage through trimming, repair, and balancing. Retain useful
  target coverage if all exercises cannot fit, and identify deferred exercises.
- Tests: a due isolation exercise survives equivalent compound alternatives;
  constrained plans preserve recovery/time limits and report omissions; repeated
  generation without submitted work does not advance rotation or alter saved plans.

Verification: validate returned schedules with the existing weekly validator,
independently recalculate credits, and run Coach and Log regression suites.

## Task 3: Explain every omission in the existing Coach UI

Files: app.js, coach-regression.test.js, log-regression.test.js. Dependency: Task 2.

- Add an exercise rotation summary to the existing Coach explanation/warning area.
  Name each deferred exercise and distinguish recovery, performance safeguard,
  duplicate definition conflict, available time/slots, satisfied target volume,
  queued rotation, and bounded-search exhaustion.
- Persist the explanation with the generated weekly snapshot and include the
  rotation audit in debug exports. Clearly separate saved and recalculated plans.
- Tests: notices cover all active definitions, survive snapshot reload, correspond
  to the actual plan, and do not claim bounded search proved impossibility.

Verification: both regression suites, JavaScript syntax and diff checks, and a
mobile-width browser check of notices and Generate/Copy flows. Confirm matching
app/cache versions only after the behavior is verified.

## Review checkpoint

The user approved implementation on October 6, 2026.

## Implementation verification

- Tasks 1-3 implemented in app.js with helper comments and no styling changes.
- Coach and Log regression suites pass, including rotation turns, secondary-credit
  coverage, recovery/failure constraints, bounded search, conflicts, and snapshot reload.
- JavaScript syntax, manifest parsing/version, and Git whitespace checks pass.
- An isolated Edge browser replay of the October 6 report accounts for all 27 active
  exercises: 24 submitted or planned, with Overhead Press, Rows, and V-Bar Pulldown
  deferred after the tested replacements failed constraints. This is not a proof
  that another arrangement cannot include them.
- All ten muscle targets remain attained and the weekly validator passes.
- At 390px and 430px the notices have no horizontal overflow. Saved placements
  and notices survive reload; Copy appends in order and preserves an edited manual row.
- Debug exports distinguish saved placements from recalculated plans and contain
  all 27 audit entries. No browser page errors occurred.
- Final browser Generate interaction took approximately 6.4 seconds with the report's
  363 exported workouts. This is a desktop measurement, not physical iOS verification.
- Release markers are 1.6.10 and service-worker cache v133.
