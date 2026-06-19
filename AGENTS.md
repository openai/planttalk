# Plant Talk Codex Guide

This repo is designed to be opened directly in Codex Desktop. The README is the
public overview and handoff; this file is the operational tutorial for Codex.

Do not ask users to install a separate Codex skill. Read this file, then guide
the user through the correct path one step at a time.

## Operating Style

- Act like the tutorial guide, not like a docs search engine.
- Guide one step at a time. Do not dump the whole build plan unless the user
  asks for it.
- Before each command, say what it does and why it happens now.
- After each step, say what success looks like.
- If a step fails, stop and diagnose before continuing.
- Prefer exact commands, file names, URLs, and UI labels over conceptual
  summaries.
- Use plain language first. Say "upload the code to your Arduino" before
  saying "flash the firmware."
- Never ask the user to paste API keys or tokens into chat. API keys belong in
  `.env`.
- Confirm before destructive work, including deleting observation history,
  force-pushing, rewriting git history, or rotating keys.
- Keep API cost visible. Realtime voice is billed while connected, and the
  observation loop makes vision calls.

## First Move

When the user says something like:

```text
Help me set up Plant Talk and talk to my plant.
```

start with a short response like:

```text
You are in the right place. I will walk you through this one step at a time.

We will first get the browser app running with fallback sensor sliders, then
verify camera and voice, then add the Arduino sensors if you have the hardware.
```

Then identify the route:

- **Software only:** they want to run the app without Arduino hardware.
- **Hardware build:** they have an Arduino and sensors, or want real plant
  readings.
- **Ambient mode:** they want the full-screen public/kiosk view.
- **Customization:** they want to rename the plant, change the personality, add
  a sensor, or extend the app.

If unclear, assume software-only first. Do not start with hardware unless they
ask for it or already have the parts ready.

## Guide Rhythm

For each step:

1. Say the goal in one sentence.
2. Give only the command, physical action, or browser action needed now.
3. Say what success looks like.
4. Ask the user to tell you when that step is done, or to share the error with
   any secrets removed.

Examples:

- For `.env`, tell them to paste the API key into the file, never into chat.
- For Arduino wiring, give one sensor at a time and reference
  `arduino/arduino-instructions.md`.
- For browser permissions, ask them to allow camera and microphone access, then
  verify the UI changes.
- For failures, inspect the exact error before moving on.

## Critical Path: Software-Only First Run

Use this path for most users. It proves the OpenAI API, browser permissions, and
voice loop before hardware is involved.

1. Confirm they are in the repo root.

   ```bash
   pwd
   ls
   ```

   Success: the folder contains `package.json`, `README.md`, `src/`, and
   `server/`.

2. Check Node and npm.

   ```bash
   node --version
   npm --version
   ```

   Success: Node is `20.12` or newer.

3. Install dependencies.

   ```bash
   npm install
   ```

   Success: install completes and creates `node_modules/`.

4. Create the local environment file.

   ```bash
   cp .env.example .env
   ```

   Tell the user to open `.env` and replace `replace-me` with an OpenAI API key
   from `https://platform.openai.com/api-keys`. Do not ask them to paste it into
   chat.

5. Start the app.

   ```bash
   npm run dev
   ```

   Success: Vite reports `http://localhost:3000` and the API server reports
   `http://localhost:3001`.

6. Open the dashboard in Chrome or Edge.

   ```text
   http://localhost:3000
   ```

   Success: the Plant Talk dashboard loads.

7. Verify camera and observation.

   - Click **Start camera**.
   - Allow camera permission.
   - Press **Observe now**.

   Success: reasoning summaries stream in and a structured observation appears.

8. Verify voice.

   - Allow microphone permission when prompted.
   - Click **Talk to George**.
   - Ask a simple question such as "How are you doing?"
   - Hang up after the test.

   Success: the plant answers out loud and the transcript updates.

## Critical Path: Arduino Hardware

Only start this after the software-only path works, unless the user explicitly
wants to begin with hardware.

Use `arduino/arduino-instructions.md` as the detailed source of truth. Guide
the user through it step by step instead of telling them to read the whole file.

1. Confirm parts:

   - Arduino-compatible board
   - Capacitive soil moisture sensor
   - LM393 digital light sensor
   - Jumper wires
   - USB cable

2. Wire the soil moisture sensor:

   | Sensor pin | Arduino pin |
   |---|---|
   | Signal | A0 |
   | VCC | 5V |
   | GND | GND |

3. Wire the light sensor:

   | Module pin | Arduino pin |
   |---|---|
   | DO | D8 |
   | VCC | 5V |
   | GND | GND |

4. Open `arduino/PlantSensors/PlantSensors.ino` in Arduino IDE.

5. Select the board and port in Arduino IDE, then upload the sketch.

6. Open Serial Monitor at `115200` baud.

   Success: JSON appears about once per second, for example:

   ```json
   {"moisture":45,"light":100}
   ```

7. Calibrate soil moisture using the `calibrate` command and the instructions
   in `arduino/arduino-instructions.md`.

8. Adjust the light sensor threshold with its potentiometer until the reading
   toggles reliably between light and dark.

9. Return to the Plant Talk dashboard and click **Connect Arduino**.

   Success: the sensors panel shows live Arduino readings.

## Critical Path: Ambient Mode

Ambient mode is not a second app. It is a full-screen view over the same camera,
sensor, memory, and Realtime conversation stores.

1. Make sure the dashboard is running at <http://localhost:3000>.
2. Start camera and microphone permissions from the dashboard first.
3. Click **Open ambient mode**.
4. Click **Talk to George**.
5. Press `Esc` to return to the dashboard.

Success: sensor readings and conversation state stay in sync when leaving
Ambient mode.

For kiosk use, remind the user that voice is still billed while a call is
connected.

## Customization Map

- Rename the plant: `PLANT_NAME` in
  `src/lib/plant/realtime-config.ts`.
- Change personality: `PLANT_INSTRUCTIONS` in
  `src/lib/plant/realtime-config.ts`.
- Change voice: `PLANT_VOICE` or `PLANT_VOICES` in
  `src/lib/plant/realtime-config.ts`.
- Change Realtime model: `REALTIME_MODEL` in
  `src/lib/plant/realtime-config.ts`.
- Change observation model or reasoning settings: `server/observe.ts`.
- Add a conversation tool: declare it in `PLANT_TOOLS` and implement it in
  `src/lib/plant/realtime-tools.ts`.
- Add a sensor: update `arduino/PlantSensors/PlantSensors.ino`,
  `src/lib/plant/sensors.ts`, `src/stores/plant/sensors-store.ts`, and the
  Realtime tool output.
- Change Ambient mode: files in `src/components/public/`.
- Change dashboard panels: files in `src/components/dashboard/`.

## Repo Map

- `server/` - Express backend. This is the only place `OPENAI_API_KEY` is used.
- `server/realtime.ts` - mints ephemeral Realtime client secrets.
- `server/observe.ts` - OpenAI vision calls, structured output, and reasoning
  summary streaming.
- `src/app.tsx` - single-page app entry.
- `src/components/dashboard/` - dashboard panels.
- `src/components/public/` - Ambient mode UI.
- `src/lib/plant/` - prompts, schemas, Realtime config, Realtime tools, and
  shared sensor logic.
- `src/stores/plant/` - Zustand stores for camera, sensors, observations,
  conversation, settings, and UI mode.
- `arduino/PlantSensors/` - Arduino firmware.
- `arduino/arduino-instructions.md` - detailed hardware tutorial.

## Commands

- `npm install` - install dependencies.
- `npm run dev` - run Vite on `:3000` and Express on `:3001`.
- `npm run build` - build the frontend.
- `npm start` - serve the production build through Express.
- `npm run lint` - run ESLint.
- `npx tsc --noEmit` - run TypeScript checks.

## Troubleshooting Priorities

Check the common failures first:

- `OPENAI_API_KEY not configured`: `.env` is missing, in the wrong folder, or
  still contains `replace-me`.
- `npm install` fails: check Node version first, then retry on a reliable
  network.
- Port `3000` or `3001` in use: stop the other process or choose a free port.
- Camera or microphone blocked: use Chrome or Edge on `localhost`, then allow
  permissions.
- Voice connects but does not answer: re-check the API key, billing/credits, and
  server logs.
- Arduino does not connect: use Chrome or Edge, confirm the board is plugged in,
  and verify Serial Monitor output at `115200` baud.
- Sensor readings do not change: re-check wiring and calibration.

## Safety And Cost

- Never ask for API keys, access tokens, or passwords in chat.
- Do not log `.env`, API keys, audio, or images outside the local app.
- Remind users that webcam frames sent to observations go to the OpenAI API.
- Realtime voice costs money while connected; tell users to hang up after
  testing.
- The observation loop makes repeated vision calls; increase the interval if
  leaving the app running.
- Do not add automatic watering, relays, pumps, or other physical actuation
  without explicit user approval and a safety review.

## Before Calling Work Done

For code changes, run the relevant checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

If dependency installation or network access prevents checks from running, say
that clearly and include the exact failure.
