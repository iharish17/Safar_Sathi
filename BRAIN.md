# Safar Sathi Project Brain

This file is the working memory for the Safar Sathi repository. Keep it updated when routes, data contracts, environment variables, deployment, or realtime events change.

## 1. Project Purpose

Safar Sathi is a train recovery and passenger-protection app for Indian Railways-style journeys. The main flows are:

- Search trains by number, name, or route station.
- Inspect a train route and simulated live position.
- Enter a PNR and missed/boarding station.
- Decide whether the passenger can catch the original train later.
- Suggest alternate trains when available.
- Send a TTE boarding request and receive approval/rejection/presence updates.
- Generate and scan a QR catch pass through the passenger and TTE views.

The current application uses local train datasets and in-memory request state. It is a prototype, not a production booking or railway-authority integration.

## 2. Repository Layout

```text
safarsathi/
|-- BRAIN.md                       Project memory and maintenance notes
|-- README.md                      Setup, feature summary, and deployment notes
|-- backend/
|   |-- package.json               Express/Socket.IO server scripts and dependencies
|   |-- server.js                  HTTP server, middleware, route mounting, Socket.IO setup
|   |-- data/
|   |   |-- EXP-TRAINS.json        Express train dataset
|   |   |-- PASS-TRAINS.json       Passenger train dataset
|   |   |-- SF-TRAINS.json         Superfast train dataset
|   |   `-- mockPnrs.js            Local PNR passenger fixtures/fallback data
|   |-- routes/
|   |   |-- search.js              Train search endpoint
|   |   |-- train.js               Train details and live route endpoints
|   |   |-- pnr.js                 Mock PNR endpoint backed by local fixtures
|   |   |-- canCatch.js             Missed-train and alternate-train calculation
|   |   `-- tte.js                 In-memory TTE request store and list endpoint
|   |-- socket/
|   |   `-- socket.js              Passenger/TTE realtime events and state mutations
|   `-- utils/
|       |-- dataLoader.js          Loads and combines train JSON files at startup
|       `-- helpers.js              Station/time/distance helper functions
|-- frontend/
|   |-- package.json               Vite/React scripts and dependencies
|   |-- vite.config.js             Vite React plugin configuration
|   |-- vercel.json                SPA rewrite for Vercel
|   |-- public/                    header-logo.png, hero-bg.png, favicon.png, Safar_Sathi.mp4
|   `-- src/
|       |-- main.jsx               React root and BrowserRouter entry
|       |-- App.jsx                Application routes and loader/navbar shell
|       |-- services/api.js        Axios HTTP client functions
|       |-- pages/
|       |   |-- LandingPage.jsx
|       |   |-- SearchTrains.jsx
|       |   |-- TrainView.jsx       Redirects /train/:number into /search
|       |   |-- MissedTrainCalculator.jsx
|       |   `-- TteDashboard.jsx
|       |-- components/
|       |   |-- AppNavbar.jsx
|       |   |-- RequestCard.jsx
|       |   |-- VideoLoader.jsx
|       |   `-- Trackers/            StationNode, TrainTimeline, TrainTracker
|       `-- styles/                  Global tokens and page/component CSS
```

There is no root `package.json`; install and run backend and frontend independently.

## 3. Local Development

Use two terminals from the repository root.

### Backend

```bash
cd backend
npm install
npm start
```

The backend listens on `http://localhost:5000` by default. `npm run dev` currently runs the same plain `node server.js` command; there is no file watcher.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite normally serves the frontend at `http://localhost:5173`.

Useful frontend commands:

```bash
npm run lint
npm run build
npm run preview
```

There are currently no automated backend tests and no root-level test command.

## 4. Environment Variables

Backend variables are read from `backend/.env` by `dotenv`:

```text
PORT=5000
NODE_ENV=development
```

The backend no longer uses external railway APIs. PNR data comes from `backend/data/mockPnrs.js`, and live route status is simulated from local train routes.

Frontend variables are read by Vite from `frontend/.env`:

```text
VITE_API_BASE=http://localhost:5000
```

`VITE_API_BASE` is used for both Axios and Socket.IO connections. It must point to the deployed backend in production, including the correct protocol (`https://` when applicable).

## 5. Backend Startup and Data Loading

`backend/server.js`:

1. Loads dotenv, Express, HTTP, Socket.IO, and CORS.
2. Enables unrestricted CORS and JSON request parsing.
3. Loads all train data once at startup through `loadTrains()`.
4. Mounts HTTP routes.
5. Registers Socket.IO handlers.
6. Starts the HTTP server.

`utils/dataLoader.js` loads `EXP-TRAINS.json`, `PASS-TRAINS.json`, and `SF-TRAINS.json`, concatenating them into one array. It also checks `SF-TRAINS` without an extension, although that file is not currently present. Malformed or unreadable data causes an empty train list to be returned after logging an error.

Important data assumptions:

- Train numbers are compared as strings.
- A train has `trainNumber`, `trainName`, `trainRoute`, and usually `runningDays`.
- Route stops are expected to include `sno`, `stationName`, `arrives`, `departs`, and `day`.
- Many station labels contain a code suffix such as `Station Name - ABC`; helper functions extract that suffix.
- Train detail and missed-train calculations sort routes by `sno`.

## 6. HTTP API

All endpoints are relative to `VITE_API_BASE`.

### Search

`GET /search?q=<text>`

Searches train number, train name, and station names. Empty queries return `[]`. Results are limited to 20 full train objects.

### Train details

`GET /train/:trainNumber`

Returns the matching train with `trainRoute` sorted by serial number. Returns `404` with `{ "error": "Train not found" }` if absent.

### Live route

`GET /live/:trainNumber`

Returns a simulated live route from the local train dataset. The response contains `trainNumber`, `trainName`, `currentStation`, `nextStation`, `delay`, and `route`. The simulated current station is based on the server's current clock and route arrival times, and the delay is a random value from 0 to 14 minutes, so it is intentionally approximate.

### PNR

`GET /pnr/:pnr`

Looks up the PNR in `backend/data/mockPnrs.js`, then enriches it with local train dataset route/name details. The normalized result includes PNR, train identity, source/destination, status, passengers, route, and raw mock data.

- `404`: PNR is not present in the mock data.
- Add or update passenger fixtures in `backend/data/mockPnrs.js`.

### Missed-train calculation

`GET /can-catch?train=<number>&boarding=<station>&current=<station>`

Returns a calculation based on route positions and schedule times.

- If the current station is before boarding: `missed: false`, `canCatch: true`.
- If boarding has been passed: calculates a skip limit of 5, 10, or 15 stations based on route length.
- May return `alternateTrains: null` or an array of alternate options.
- Alternate options include departure/arrival stations and times, catch station, original arrival comparison, running-day information, and a randomized delay estimate.
- Invalid train or stations return `404` or `400`.

The calculation uses local schedule data and current calendar day. It is a recommendation engine, not a guaranteed railway timetable result.

### TTE requests

`GET /tte/requests`

Returns the current in-memory request array. There are no HTTP mutation endpoints; request creation and status changes happen through Socket.IO.

## 7. Frontend Routes

Routes are defined in `frontend/src/App.jsx`:

- `/`: landing page.
- `/search`: train search, detail selection, schedule/live timeline.
- `/train/:trainNumber`: redirect route into `/search?train=<number>`; optional `focus` query parameter is preserved.
- `/missed-train`: PNR/recovery flow start.
- `/missed-train/pnr/:pnr`: PNR result and boarding-station selection.
- `/missed-train/pnr/:pnr/catch/:boarding`: calculation/recovery view.
- `/tte-dashboard`: TTE dashboard. The global navbar is hidden on this route.

Vercel uses `frontend/vercel.json` to rewrite every path to `index.html`, which is required for React Router refreshes.

## 8. Socket.IO Contract

The backend currently broadcasts to every connected client. `tte_join` is reserved for future room segregation and does not create a room today.

### Passenger to server

- `send_tte_request`: creates a request with status `Pending`.
- `update_tte_request`: updates the message of a matching pending request.
- `cancel_tte_request`: marks a matching pending request `Cancelled`.

Requests can be matched by `id`, or by PNR plus boarding/missed station. A request includes an id, PNR, train data, boarding/missed station, catch station, ETA, passengers, message, timestamp, and `changeLog`.

### TTE to server

- `tte_approve` or legacy `approve_tte_request`: marks a pending request `Approved`.
- `tte_reject` or legacy `reject_tte_request`: marks a pending request `Rejected`.
- `tte_mark_present`: marks a matching request `Present`.

### Server broadcasts

- New request: `new_request` and legacy `tte_request_received`.
- Approval: `request_approved`, then full `tte_request_updated`.
- Rejection: `request_rejected`, then full `tte_request_updated`.
- Cancellation: `request_cancelled`, then full `tte_request_updated`.
- Presence: `request_marked_present`, then full `tte_request_updated`.

Status values are title-cased in backend payloads: `Pending`, `Approved`, `Present`, `Rejected`, and `Cancelled`. Frontend code normalizes them for comparisons, but new consumers should preserve this compatibility.

The TTE dashboard queues outbound actions in localStorage while disconnected and flushes them after reconnection. The missed-train page listens for request status changes and updates the passenger view.

## 9. Persistence and State Boundaries

- Train datasets are read only at backend startup.
- TTE requests are stored in the module-level `tteRequests` array in `routes/tte.js`.
- Restarting the backend clears all TTE requests.
- Multiple backend instances do not share request state.
- Frontend recent searches, selected tracking state, cached TTE requests, and queued TTE actions use browser `localStorage` or `sessionStorage`.
- Client caches do not replace backend truth; reconnect/sync behavior should be considered when changing request flows.

Known localStorage keys include:

- `safar-sathi-recent-train-searches`
- `safar-sathi-tracking-state:<trainNumber>`
- `safarsathi_recent_missed_train_searches_v1`
- `safarsathi_tte_cached_requests_v1`
- `safarsathi_tte_action_queue_v1`
- `safarsathi_app_loader_seen_v1` in session storage

## 10. UI and Styling Conventions

- React is written in JSX with functional components and hooks.
- React Router handles navigation; do not add a second routing system.
- Axios HTTP calls belong in `frontend/src/services/api.js` where practical.
- Socket.IO is used for TTE request state, not polling.
- `lucide-react` supplies icons; `framer-motion` supplies animations.
- Shared CSS tokens live in `styles/design-tokens.css`; global layout/utilities live in `styles/global.css`.
- Page-specific styles use a matching file in `frontend/src/styles/`.
- Static media is referenced from `/header-logo.png`, `/hero-bg.png`, `/Safar_Sathi.mp4`, and `/favicon.png`.
- Keep user-facing page styles responsive and preserve the existing blue/orange Safar Sathi visual language unless intentionally redesigning it.

## 11. Maintenance Rules and Gotchas

- Start the backend after changing server route or socket code. If a new route unexpectedly returns 404, an older Node process may still be running.
- PNR data is fully local. Known mock PNRs live in `backend/data/mockPnrs.js`.
- Preserve both current and legacy Socket.IO event names unless all clients are migrated together.
- Keep passenger arrays present in TTE request payloads. Dashboard cards expect them and normalize to a fallback passenger when missing.
- Use the title-cased request statuses documented above in server changes.
- When changing route station matching, test both full labels and three-letter station codes.
- Schedule values may be `Source` or `Destination`; time helpers intentionally treat those as non-numeric.
- Some live and alternate-train values are simulated with `Math.random()`, so exact delay/result assertions will be unstable.
- The frontend has no authentication guard. The TTE login label currently navigates directly to `/tte-dashboard`.
- CORS is currently open (`origin: '*'`). Tighten it deliberately during production hardening, and account for Socket.IO as well as HTTP requests.
- Avoid committing generated `dist/` output or secrets.
- The repository currently has no automated tests. At minimum, manually smoke-test search, train detail, PNR failure/success paths, missed-train calculation, request creation, TTE approval, rejection, cancellation, and mark-present flows after behavior changes.

## 12. Deployment Notes

Frontend deployment is designed for Vercel:

- Build from `frontend` with `npm run build`.
- Set `VITE_API_BASE` to the public backend URL.
- Keep the SPA rewrite in `frontend/vercel.json`.

Backend can be deployed to a Node-compatible host such as Render, Railway, or Fly.io:

- Install from `backend/package.json`.
- Start with `npm start`.
- Configure `PORT` in the host environment.
- Ensure the host supports long-lived WebSocket connections for Socket.IO.
- Do not rely on the in-memory TTE request array for durable production data.

## 13. Safe Change Checklist

Before changing backend behavior:

1. Identify whether the source of truth is the train dataset, mock PNR fixtures, HTTP route, or Socket.IO state.
2. Preserve response field names used by `api.js`, `MissedTrainCalculator`, `TteDashboard`, and `TrainTimeline`.
3. Check both successful mock-data behavior and not-found/error behavior.
4. Restart the backend and exercise the affected endpoint/event.

Before changing frontend behavior:

1. Check the route and query/path shape used by navigation and refresh hydration.
2. Keep API and Socket.IO base URLs aligned through `VITE_API_BASE`.
3. Preserve localStorage keys unless intentionally migrating stored data.
4. Run `npm run lint` and `npm run build` from `frontend`.
5. Smoke-test at least one desktop and one narrow viewport for layout-sensitive changes.
