# Table and the City: app (App Store + Google Play) handoff
Prepared 30 Oct 2026. Branch **preview-app** (not merged; main is untouched).
Everything below is ready *except* the store accounts, signing and the iOS build. Those need you.

## What's done
1. **PWA basics on current main** (branch `preview-app`, worktree `/workspace/wt-app`)
   - Old branches: `preview-pwa` (25 Oct) and `preview-pwa-rebased` were **never merged into main**, and main has changed a lot since (guide.html, i18n, globe landing). So I did not merge them. I took over their new files: `manifest.webmanifest` (name "Table and the City", short "Table & City"), `sw.js`, `offline.html`, `js/pwa.js`, `img/icons/*` (192, 512, maskable 512/1024, apple-touch 180, favicons 16/32/48 + svg, all made from the existing logo, the same mark as img/brand/favicon.svg), `scripts/make_icons.py`
   - Wired into index.html, guide.html, restaurant.html, privacy.html: manifest link + `js/pwa.js` (service-worker registration). `scripts/stamp_assets.py` now also writes the SW cache version + app-shell precache list
   - **Site look unchanged:** the old "install the app" pop-up is switched off (`AUTO_HINT = false` in js/pwa.js), there is no viewport/safe-area CSS change, and existing icons stay the same. City data (4.4 MB) is not precached. It is cached as each city is opened.
2. **privacy.html**: EN + NL/DE/FR/ES via `scripts/i18n_strings.txt` → `i18n_build.py` (use `?lang=nl` etc.). It covers: no accounts, no ads, no analytics, no tracking cookies; forms → FormSubmit (fallback Web3Forms); OSM tiles; "Near me" location stays on the device; Google Maps for directions; the Abacus visit counter (found in js/visits.js); Google Fonts, unpkg, Google Places photos, Instagram embeds; localStorage + offline cache; GDPR rights + the Belgian DPA. The footer has a small "Privacy" link next to "Back to top". **⚠ This is a draft for you to review. It is not legal advice.** You may want to add your legal name/address if you register as a company.
3. **Capacitor project** in `app/` (Capacitor 8.6, appId `com.tableandthecity.app`, appName "Table and the City")
   - `npm run sync` copies the site into `app/www` (via copy-web.mjs) and syncs both platforms. `www/`, node_modules and build outputs are git-ignored
   - `android/` added (minSdk 24, target/compile 36). It has the app icons and location permissions for "Near me"
   - `ios/` generated (Swift Package Manager, no CocoaPods). It has the 1024 app icon, the location usage text and `ITSAppUsesNonExemptEncryption=false`
   - Note: GitHub Pages serves the whole repo (no workflow, `.nojekyll`), so `app/` is also publicly reachable as plain files. It holds no secrets and does no harm. **Never commit a keystore** (*.jks/*.keystore are git-ignored).
4. **Android debug APK built on the box:** `table-and-the-city-debug.apk` (**119 MB**, unsigned debug build). Install on a phone with "install unknown apps" turned on, or `adb install`. Why it is big: `img/` (111 MB of photos) is bundled for offline use. To slim it down, load `img/places` + `img/cities` from https://www.tableandthecity.com instead. That would give an APK of about 15 MB.
5. Store listing drafts: `store-listing.md`. Screenshots: `screens/` (iPhone 6.9" 1290×2796 and Android 1080×1920). Icons: `store-icon-1024.png`, `play-icon-512.png`, `play-feature-graphic-1024x500.png`.
6. Tests on preview-app: test_hours.js 105/105, city isolation 212/212 (temp port copy, deleted), test_i18n PASS.

## Known things to check in the app
- **Forms from inside the app:** the page origin is `https://localhost` (Android) / `capacitor://localhost` (iOS). FormSubmit ties forms to the site it was activated on, so test a "Suggest a place" from the APK. If it fails, the Web3Forms fallback should take over. Otherwise send forms with the live site's referrer, or move them to Web3Forms only.
- The service worker does nothing inside the native shell (files are already local). That's expected.

## Apple review: guideline 4.2 (minimum functionality)
Apple rejects apps that are "a repackaged website" without app-like features, content or UI. Bundled offline content plus 2–3 native touches usually gets through. Proposed (not built yet):
1. **Saved favourites, offline.** A heart on each place, a "Saved" tab, stored on the device (Capacitor Preferences). It works with no network.
2. **Native "Near me".** Use @capacitor/geolocation (the native permission sheet) plus a "Nearby now" home view: open now + closest, with distance.
3. **Event reminders without push.** "Remind me" on a chef event schedules a *local* notification (@capacitor/local-notifications) or adds it to the calendar. No server, no push account.
4. **Native polish.** Share sheet (@capacitor/share) for places, a bottom tab bar (Guide · Map · Saved · Events), splash screen + status bar, haptics. Also make sure no tap ends up in Safari for core content.

Also required: privacy policy URL (done), App Privacy questionnaire, a demo/review note saying it's a curated offline-capable guide, and iPhone-only unless you want to supply iPad screenshots.

## Verified prices (official pages, checked 30 Oct 2026)
- **Apple Developer Program: 99 USD per membership year** (shown in local currency at enrollment). developer.apple.com/programs/enroll
- **Google Play Console: 25 USD one-time** registration fee. support.google.com/googleplay/android-developer/answer/6112435
- **Google personal accounts** (created after 13 Nov 2023) must run a **closed test with ≥12 testers opted in for 14 days in a row** before production access. Organization accounts are exempt. Google also verifies your identity (government ID + card in your legal name) and asks you to verify an Android device.
- **D-U-N-S number:** free (from Dun & Bradstreet), needed only when enrolling **as an organization** (Apple and Google). Apple: allow up to ~2 weeks. As an individual you don't need it, but the stores then show your personal name as the seller.
- **iOS cloud build (no Mac):**
  - Codemagic: individual plan has 500 free macOS M2 minutes per month, then 0.095 USD/min. One iOS build takes about 5–10 min, so that is effectively free.
  - GitHub Actions macOS runner: 0.062 USD/min on private repos. Standard runners are free for public repos.
  - Either one needs the Apple account (App Store Connect API key) for signing.

## Your to-do list
1. Review `privacy.html` (and `store-listing.md`). Then decide whether to merge `preview-app` into main, because the privacy URL must be live before you submit.
2. Decide: **individual or company?** Company → get a D-U-N-S number first (free, takes days to weeks).
3. Enroll in the **Apple Developer Program** (99 USD/yr). You need an Apple Account with 2FA.
4. Create a **Google Play Console** account (25 USD). Verify your ID and an Android device. For a personal account, line up 12 testers for the 14-day closed test.
5. Install the debug APK on an Android phone and try it (forms, Near me, map, offline).
6. Pick 2–4 of the app-like features above. I can build them next, before the iOS submission.
7. iOS: connect the repo to Codemagic (or a GitHub Actions macOS workflow) with an App Store Connect API key → TestFlight → submit.
8. Android release: create an upload keystore (keep it safe, never in git), build a signed AAB (`./gradlew bundleRelease`), upload it to internal testing → closed test → production.

## Rebuilding the APK on the box
```
export JAVA_HOME=/workspace/android-sdk/jdk ANDROID_HOME=/workspace/android-sdk PATH=$JAVA_HOME/bin:$PATH
cd /workspace/wt-app/app && npm run android:debug     # → android/app/build/outputs/apk/debug/app-debug.apk
```
