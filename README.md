# hrCollector

Captures heart rate data from Apple Watch "Cooldown" workout sessions (via HealthKit, on the phone the Watch is paired to) and uploads it to a local Express/MongoDB backend so it can be viewed elsewhere.

## Layout

- `ios/` — SwiftUI iOS app (project generated with [XcodeGen](https://github.com/yonaskolb/XcodeGen) from `project.yml`). Installed on the Watch-owner's iPhone; reads HealthKit, uploads sessions.
- `server/` — Node/TypeScript Express API backed by MongoDB. Runs locally for now.

## iOS app setup (run these on your Mac, in Terminal — not from this sandbox)

1. Install XcodeGen if you don't have it: `brew install xcodegen`
2. Generate the Xcode project:
   ```
   cd ios
   xcodegen generate
   open hrCollector.xcodeproj
   ```
3. In Xcode, select the `hrCollector` target → Signing & Capabilities → set your Team (needed for HealthKit entitlements to sign).
4. Build and run on a **physical iPhone** (HealthKit heart rate / workout data doesn't exist in the Simulator).
5. On first launch, grant the HealthKit permission prompt (Health access for heart rate + workouts).
6. In the app's Settings screen, set the server URL to your Mac's LAN IP and port, e.g. `http://192.168.1.23:4000` (see server setup below for finding this). Plain `http://` to a LAN address is allowed via the `NSAllowsLocalNetworking` exception already set in `project.yml` — no need to set up HTTPS for local dev.

## Server setup (run these on your Mac)

Requires Node.js (already installed) and MongoDB running locally.

1. Install MongoDB Community Edition if you don't have it: `brew tap mongodb/brew && brew install mongodb-community` then `brew services start mongodb-community`
   (or run it in Docker: `docker run -d -p 27017:27017 --name hrcollector-mongo mongo:7`)
2. Install deps and configure:
   ```
   cd server
   npm install
   cp .env.example .env
   ```
3. Run it:
   ```
   npm run dev
   ```
   The API listens on `http://0.0.0.0:4000` by default (see `.env`), so it's reachable from your phone over the LAN at your Mac's IP.
4. Find your Mac's LAN IP for the phone to use: System Settings → Wi-Fi → Details (or `ipconfig getifaddr en0` in Terminal). Both the Mac and the iPhone need to be on the same Wi-Fi network.

## API

- `POST /api/sessions` — upsert a workout session (by `workoutId`) with its heart rate samples.
- `GET /api/sessions` — list sessions, most recent first.
- `GET /api/sessions/:id` — fetch one session with full heart rate series.

## Status

MVP: manual "Sync Now" in the app pulls Cooldown workouts + heart rate from HealthKit and posts them to the server. Background auto-sync (HealthKit observer queries + background delivery) is stubbed in `HealthKitManager` but needs on-device testing to confirm reliability — see comments in that file.
