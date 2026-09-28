# Dashboard

A simple personal dashboard you can install on your phone's home screen:

- **Tasks**: dated to-dos, shown in a **Today** view or an **All** view sorted by due date. Unfinished tasks past their due date turn red and stay at the top of both views.
- **Daily**: recurring tasks that uncheck themselves each new day.
- **Weekly goals**: a checklist plus a notes area for planning ahead.
- **Long-term goals**: goals with target dates and a countdown to each.
- **Day progress**: a ring showing how much of today is over, next to the date.

It's built with plain HTML/CSS/JS (no build step), hosted on GitHub Pages, and synced across devices with Firebase.

Live site: https://ash-sid.github.io/dashboard/

## Local mode vs. synced mode

Until `firebase-config.js` is filled in, the app runs in **local mode**: everything is saved in the current browser only, and a "Local mode" badge shows in the corner. Once you add your Firebase config, you sign in, and your data syncs across all your devices. It also keeps working offline and catches up when you reconnect.

Data saved in local mode is **not** moved into Firebase when you switch.

## Firebase setup (one time, about 10 minutes)

1. Go to https://console.firebase.google.com and **create a project** (Google Analytics isn't needed).
2. **Authentication** → Get started → Sign-in method:
   - Enable **Google**.
   - Enable **Email/Password**.
3. **Authentication** → Settings → **Authorized domains** → add `ash-sid.github.io`.
4. **Firestore Database** → Create database, in any location and in production mode.
   - Then open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
5. **Project settings** (gear icon) → *Your apps* → click the **Web** icon (`</>`) → register the app (Firebase Hosting isn't needed).
   - Copy the `firebaseConfig` values it shows into [`firebase-config.js`](firebase-config.js).
6. Commit and push:
   ```
   git add firebase-config.js
   git commit -m "Add Firebase config"
   git push
   ```
   GitHub Pages redeploys within a minute or two.

The config values in `firebase-config.js` are meant to be public. The Firestore rules are what keep your data private to your account.

## Install on your phone

Open **https://ash-sid.github.io/dashboard/** on your phone, then:

- **iPhone (Safari):** Share button → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Install app** (or **Add to Home screen**).

Sign in once and you'll stay signed in on that device.

If **Continue with Google** doesn't work inside the installed iPhone app (iOS can be strict with sign-in popups), use **Create account** with an email and password instead. Use the same method on every device so your data matches.

## Run it on your computer

The app uses JavaScript modules, so it needs a local web server rather than opening `index.html` directly:

```
python -m http.server 8000
```

Then open http://localhost:8000. Firebase allows `localhost` by default.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure: header, sign-in screen, the four cards |
| `styles.css` | Dark theme and mobile-first layout |
| `app.js` | Rendering and behaviour for every section, plus the day-progress ring |
| `db.js` | Data layer: Firebase Auth + Firestore, or localStorage in local mode |
| `firebase-config.js` | Your Firebase project config |
| `firestore.rules` | Security rules to paste into the Firebase console |
| `manifest.webmanifest`, `sw.js`, `icons/` | Home-screen install and offline support |

## Updating

After changing files, push to `main` and GitHub Pages redeploys. The app fetches fresh files whenever it's online. If you change the list of files in `sw.js`, bump `CACHE` (for example `dashboard-v2`).
