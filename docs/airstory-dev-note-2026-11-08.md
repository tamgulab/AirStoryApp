# AirStory — Development Note

**Date:** November 8, 2026
**Repo:** `tamgulab/AirStoryApp`
**Branch:** `feature/workspace-and-placement`, now at `50714e9`
**Focus:** session screen UX, BLE connection lifecycle, battery reporting,
and profile sync between app and web.

Six commits, all pushed. Everything verified on a physical device with a real
sensor board.

| Commit | What |
|---|---|
| `7c0a7b6` | Session scroll clearance and BLE connection lifecycle |
| `225dde3` | Session setup state, leave confirmation, layout fixes |
| `d0f7045` | Lithium discharge curve for battery percentage |
| `b1aeae4` | Profile sync conflicts, teacher field visibility, Home polling |
| `50714e9` | Remove temporary debug logging |

---

## 1. Environment note worth keeping

The stale clone at `/Users/jooeunshim/AirStory/` cost time again. Metro was
running from it, so the phone received Phase 0 code while `git` commands in
`tamgulab/` reported the correct branch. The terminal prompt shows only the
last path segment, so the two are indistinguishable at a glance.

**Check the second line of `npx expo start` output every time.** It must read
`Starting project at /Users/jooeunshim/tamgulab/AirStoryApp`. A Metro already
holding port 8081 will serve its own directory regardless of where the command
was typed.

Renaming that folder is still pending.

---

## 2. End Session button unreachable

The bottom of the button stayed under the navigation bar and no amount of
scrolling brought it clear. The September fix added `paddingBottom` to the
content container, which was correct but insufficient.

**The actual cause:** `paddingTop: 60` sat on the ScrollView's own `style`.
Android computes scroll range from content height alone and ignores that
offset, so the bottom 60dp was permanently unreachable. The arithmetic
matched the symptom exactly: 60 (cut off) + 48 (nav bar) = 108dp above the
content end, with the button's bottom edge 88dp above it, leaving about 20dp
hidden.

Fix: all padding moved from `style` to `contentContainerStyle`.

---

## 3. BLE connection lifecycle

### 3.1 What was wrong

The app never released a connection except through the Settings Disconnect
button. End Session, Home navigation, screen unmount and backgrounding all
left it open. The `monitorCharacteristicForService` subscription was discarded
and never removed.

Subscriptions were stacking. After Save & Exit, `router.push("/history")`
leaves the session screen mounted underneath, and its subscription kept
writing readings into that hidden screen's rows while the next session ran on
top. Nothing was corrupted since those rows were never saved, but a hidden
recorder was running.

### 3.2 Decision: keep the connection across sessions

First pass released the device on end of session. Reverted after testing.

A student measures in one place, walks to another, and starts a new session.
Reconnecting between every session is wrong for that workflow.

Exactly two paths now release the device: the Settings Disconnect button, and
the library's own disconnect event when the link drops.

The cost: a student who finishes and closes the app leaves the board bound to
their phone. The next person must power-cycle it. The Disconnect button is
buried at the bottom of Settings, past the whole profile form. Home shows a
"Device Connected" badge that is a plain `View` and does nothing when tapped.
That badge is the natural place for a disconnect affordance. Not done.

### 3.3 Also fixed

- Stale connection check before scanning. `savedMacAddress` was written but
  never read; it is now read, and an existing connection to that device is
  cancelled before a scan.
- The error path in `connectDevice`: if `device.connect()` succeeded but the
  setup step after it failed, the link used to stay open untracked.

### 3.4 Out of scope: Metro reload leak

A JS reload creates a new native BLE manager and orphans the previous one
with its connection subscription still live. The board never receives a
disconnect, its LED stays on, and it stops advertising. The new JS cannot see
or close the leaked link.

Development-only, since production has no Metro. Recovery is a board power
cycle.

---

## 4. Session start flow

Tapping New Session started recording immediately. The existing guard
`if (!sessionName.trim()) return;` meant nothing was recorded until a name was
typed, so early readings were silently lost.

New flow:

```
Home -> New Session
  -> setup: session name, Indoor/Outdoor, Record button
  -> Record -> recording: indicator, live values, duration, End Session
```

Implemented as a state inside `session.tsx` rather than a separate route, so
the BLE subscription and the no-device redirect stay on one screen and back
cannot land on a stale setup screen.

Record is disabled while the name is empty. `keyboardShouldPersistTaps="handled"`
was needed, or the first tap on Record with the keyboard open would only
dismiss the keyboard.

The row guard became `if (!recording) return;`, which is the check that
matters now.

Name and site type show read-only on the recording screen, side by side with
the name truncating rather than wrapping.

### 4.1 Leave confirmation

Leaving mid-recording discarded everything without asking. Added
`usePreventRemove`, active only while recording. It covers the header back
arrow and the Android hardware back button through the same hook. The screen's
own exits set a skip flag.

---

## 5. Battery reporting

### 5.1 Badge overflow

The battery badge ran off the right edge. Part of the cause was 14 literal
spaces after the expression inside the `<Text>`, which JSX preserves. The row
now wraps; at 360dp the battery badge takes a second line.

### 5.2 Percentage was wrong

The mapping was linear from 3.0V to 4.2V. A lithium cell holds most of its
charge between about 3.6V and 4.0V and very little below 3.5V, so the linear
formula overstated remaining charge. At 3.5V the app showed 42% while the
firmware treated that same voltage as low enough to switch its green LED off.

**Source problem.** The cell is a JLJLUP 103665, 3000mAh. That part number is
a dimension code used by many vendors; no manufacturer discharge curve exists
for it. Equivalent datasheets confirm only the endpoints, 4.2V charge cutoff
and 3.0V discharge cutoff, which the existing range already matched. No
published voltage-to-SOC table was found for any comparable cell.

**What was used.** The Meshtastic firmware `power.h` table: 4190, 4050, 3990,
3890, 3800, 3720, 3630, 3530, 3420, 3300, 3100 mV for 100% down to 0%, with
linear interpolation between points. It agrees with TI SLUAAR3, which gives
3.72V at rest as 50%, but the table itself cites no origin. The comment in the
code says so plainly.

Known limitation: the table describes a cell at rest. This board measures
under load from the dust sensor fan and the BLE radio, so it still overstates
remaining charge by an unknown amount. Replacing it with measurements from an
actual discharge of this board would settle it.

| Voltage | Before | Now | Colour |
|---|---|---|---|
| 4.0V | 83% | 82% | green |
| 3.8V | 67% | 60% | green |
| 3.7V | 58% | 48% | green |
| 3.6V | 50% | 37% | green |
| 3.5V | 42% | 27% | orange |
| 3.3V | 25% | 10% | red |

Colour bands are defined by voltage and converted through the curve, so they
follow automatically if the curve is replaced. Orange starts at 3.50V, which
matches the firmware's LED cutoff exactly. Red at 3.30V, where the last 10%
begins and voltage falls steeply.

The charging indicator still uses `battery >= 4.2`, which is wrong in both
directions. A full cell at rest shows the bolt; a charging cell below 4.2V
does not. Fixing it needs the firmware to send charge state as a sixth field.
The firmware reads `chrg_pin` already but only uses it to blink an LED.

---

## 6. Profile sync

### 6.1 The reported symptom was not a bug

Changing Group in the app did not appear on the web, and a teacher's web
change did not reach the app.

Debug logging showed the PATCH going out with status 200 and the server
returning the updated profile. The `role` field in the log read `teacher`.

`PATCH /auth/me/profile` writes only the caller's own `user_profiles` row.
A teacher editing Group in the app changes the teacher's row, not a student's.
The web roster shows the student's row. Neither direction was ever going to
appear.

Confirmed working on a student account, both directions.

### 6.2 Real problems found and fixed

**The app could overwrite a teacher's placement change.** Save sent the whole
form. If a teacher changed a student's placement on the web and the app had
not refreshed, the student's Save wrote the stale values back over it. Session
keys cannot be corrected after upload.

Fix combines three mechanisms:
- only edited fields are sent, so an untouched field cannot overwrite anything
- current server values are fetched immediately before saving
- if an edited field also moved on the server, a dialog asks which to keep,
  with Cancel, Use Updated, and Keep Mine

A small window remains between the check and the PATCH. Closing it needs a
version check on the backend.

**A refresh destroyed unsaved edits.** The form refilled itself whenever any
stored value changed. Each field now keeps a base value; a field counts as
edited when it differs from its base, and only unedited fields take refreshed
values.

### 6.3 AuthGate was throwing every screen back to Home

Pull-to-refresh in Settings refreshed correctly and then jumped to Home.

The cause was not in Settings. `AuthGate` treated any in-flight `/auth/me`
request as "account not resolved", swapping the entire navigator for a
spinner. That unmounted every screen and the navigator returned at its first
route.

This affected every `refreshMe()` call: pull-to-refresh, Save, the conflict
dialog's Use Updated, and the post-upload profile update in History. **History
was being thrown back to Home after a placement-changing upload**, which went
unnoticed in September.

`AuthProvider` now has a separate `resolvingAccount` flag, true only during
the first resolution after sign-in or launch. Later refreshes run in the
background.

### 6.4 Placement fields hidden for teachers

A teacher does not belong to a period or group. Those fields exist on their
row but mean nothing there. Period and Group pickers now render for students
only, and the "Group not set" badge on Home is hidden for teachers.

**Open consequence:** History refuses to upload unless period and group are
set, and Settings no longer lets a teacher set them. A teacher whose row has
no placement cannot upload. Decided: teachers should upload under a
teacher-specific group designation, to be added properly on the backend rather
than hardcoded in the app.

### 6.5 Home polling

A teacher's web change reached the app only through Settings pull-to-refresh,
which no student would discover.

Three triggers now share one `refreshIfStale()` with a 60-second throttle and
an in-flight guard: return to foreground, Home regaining focus, and a
60-second timer while Home is focused.

The throttle times from when a request starts, not from its response. Timing
from success caused drift: a tick 60 seconds after a request found only ~59.7
seconds since the response, got skipped, and the real period doubled to 120
seconds.

Polling stops when Home loses focus or the app backgrounds. Auto-refresh is
paused during a recording, so a mid-session placement change cannot split the
period and group stamped across one session's rows. The Home timer could not
run during a recording anyway, but the foreground listener in `AuthProvider`
was a real gap.

Failures are silent. Background refreshes do not set `meError`, so a failed
poll cannot raise the full-screen account error. Cost is at most 61 GET
`/auth/me` per hour with the app open on Home, zero elsewhere.

---

## 7. Open items

**App**

1. BLE permission is neither requested nor explained. Scanning returns "No
   devices found" when Nearby Devices is missing. Still fixed only by editing
   phone settings by hand.
2. Storage cadence is change-driven. A row is written only when a value
   changes, so a period of stable air leaves no record.
3. The duration counter is a `setInterval`, which Android pauses in the
   background, so it under-counts. `Date.now() - startTime` fixes it, JS-only.
4. Home's "Device Connected" badge is inert. It is the natural place for a
   disconnect affordance, since the Settings button is buried.
5. Name shows `user.full_name`. The web My Page edits `profile.display_name`,
   so a name changed on the web does not appear in the app.
6. `profile.student_code` and `memberSchoolCode` are mapped but unused.
7. No foreground service, so Android can kill the app during a long
   background recording and the link dies with it. Needs native work and a
   rebuild.

**Web and backend (to be done directly, not handed off)**

8. No class-level instructor field. `workspaces` has no column for it, and a
   student's `user_profiles.instructor` is inserted empty at invite-accept and
   never filled. Every uploaded session carries an empty instructor in its
   key, permanently. Proposed: `workspaces.instructor_name`, mirroring school.
9. A teacher-specific group designation for teacher uploads (see 6.4).
10. Session lookup SQL omits `location` while the cache key includes it.
11. `npm run build` fails on `react-map-gl/maplibre`, also broken at
    `origin/dev`.
12. `src/utils/importedData.js` still minute-buckets the web CSV import path,
    so a CSV imported through the web splits by minute while a mobile upload
    does not.
13. `detectOutliers` runs over daily means while box plots now read individual
    readings. Different populations, inconsistent results.

**Firmware and sensor**

14. CO reads a flat 0.50 with no variation, including during combustion. Not a
    real reading.
15. Temperature and humidity carry a one-off offset correction made on Sep 11,
    on the board only, not in the repo. The required offset moved from 2.4 to
    1.6 within an hour as room temperature rose, so a constant cannot work.
    The real fix is moving the sensor away from the board's heat or into the
    intake path.
16. No checksum validation on PMS7003 or ZE07-CO.
17. Possible mismatch between the repo firmware and what is flashed.
18. Charge state is read but not transmitted (see section 5.2).

**Process**

19. `main` is at `6d1e0fe` and contains none of Phases 0 through 6.
20. Phase 6: `ownerCode` and `visibility` in the import payload.
21. The stale clone at `/Users/jooeunshim/AirStory/` should be renamed.

---

## 8. Deadline

The EAS development build `7905022` was created Sep 1 with 80 days of
availability, so it **expires around November 20**. A new build is needed
within two weeks. If a foreground service is wanted (item 7), that rebuild is
the natural place for it.
