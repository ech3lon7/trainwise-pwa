# TrainWise PWA

TrainWise is a free, static, offline-first hypertrophy workout and nutrition PWA.

## What is included

- Hypertrophy logging: exercise, target muscle, sets, reps, load, RIR, and notes
- Nutrition/body logging: body weight, calories, protein, and notes
- Progress charts for hard sets, exercise volume, estimated 1RM, body weight, calories, and protein
- Rule-based hypertrophy recommendations
- IndexedDB local storage
- Export/import JSON backups
- Optional Supabase cloud backup using a free Supabase project

## Hypertrophy coaching rules

The app is minimum-first and home-basics focused.

- Weekly volume uses a rolling 7-day window.
- The first target is 10 hard sets per muscle per week.
- The growth zone is 12-20 hard sets per muscle per week.
- Muscles should usually be trained at least 2 times per week.
- Most working sets should land around 1-3 reps in reserve.
- Sets with RIR above 3 count at half credit.
- Compound exercises count 1.0x for primary muscles and 0.5x for secondary muscles.
- Protein targets use the latest body weight: 1.6-2.2 g/kg/day.
- The exercise library assumes dumbbells, bands, bench, and bodyweight options.

This is personal training guidance, not medical advice. Avoid sharp pain and adjust for injury, recovery, and fatigue.

## Run locally

From this folder:

```powershell
python -m http.server 4173
```

Open:

```text
http://localhost:4173
```

## Free hosting options

Use one of these for the frontend:

- GitHub Pages
- Cloudflare Pages
- Netlify
- Vercel

The app is static HTML/CSS/JS, so it does not need paid hosting.

## GitHub Pages setup

For a fully free GitHub Pages site, use a public repository.

1. Create a public repository named `trainwise-pwa`.
2. Upload every file in this folder to the repository root.
3. Open the repository Settings.
4. Open Pages.
5. Set Source to "Deploy from a branch".
6. Set Branch to `main` and Folder to `/root`.
7. Save.

After GitHub finishes publishing, the app URL will look like:

```text
https://YOUR-GITHUB-USERNAME.github.io/trainwise-pwa/
```

## Free Supabase backup setup

1. Create a free Supabase project.
2. In Supabase, open SQL Editor.
3. Run the contents of `supabase-schema.sql`.
4. Go to Project Settings > API.
5. Copy the Project URL and anon public key.
6. In TrainWise, open Settings.
7. Paste the URL and anon key.
8. Create an account or sign in.
9. Use Push backup and Pull latest.

The Supabase free tier is enough for personal workout logs. Free projects can pause after inactivity, so if sync stops after a long break, wake the project from the Supabase dashboard.

## Install on iPhone

1. Host the app somewhere HTTPS-based.
2. Open the hosted URL in Safari.
3. Tap Share.
4. Tap Add to Home Screen.
5. Open TrainWise from the Home Screen icon.

## Important

Local data lives in browser storage. Use export/import or Supabase backup so clearing Safari website data does not wipe your only copy.

Backups include workouts, nutrition metrics, and non-secret hypertrophy settings. Supabase credentials and sessions are not included in exported backup files.
