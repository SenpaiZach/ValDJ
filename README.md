# Valorant Spotify Companion (Starter)

Event-reactive Overwolf application skeleton mapping Valorant game events to Spotify playback. This starter emphasizes configuration-first architecture, policy compliance with Riot and Spotify, and modular rule evaluation so features can evolve without core rewrites.

## Features
- Overwolf Valorant Game Events Provider adapter with health awareness.
- Configuration schema with versioning, per-profile overrides, and compliance toggles.
- Pluggable rule graph pipeline that supports filters, debounces, cooldowns, and mapping to playback actions.
- Spotify client abstractions for Web Playback SDK and Connect control with basic rate-limit guardrails.
- Queue-based dispatcher coordinating rule outputs and Spotify API usage.

## Getting Started
1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` and fill in your `SPOTIFY_CLIENT_ID` (obtain from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)).
3. Register `https://d2nh8tyjgzavqo.cloudfront.net/spotify-relay.html` (or your own hosted relay) as a redirect URI in your Spotify app settings.
4. Run `npm run auth` to authorize and receive Spotify tokens; they will be written to `.env` automatically.
5. Copy `config/app.config.example.json` to `config/app.config.json` and adjust to your needs.
6. Run the orchestrator: `npm start` (defaults to mock mode; set `developer.mockMode: false` to connect live adapters).

## Spotify OAuth Relay
The helper uses HTTPS redirect via a hosted relay page (`public/spotify-relay.html`) that decodes the `state` parameter and forwards the browser to your local callback. Deploy the relay to any HTTPS domain (e.g., AWS S3 + CloudFront) and update `SPOTIFY_REDIRECT_URI` in `.env` accordingly.

## Compliance Highlights
- Only Overwolf GEP is referenced for live Valorant signals (`riotStrictMode` default is `true`).
- No tactical overlays or coaching assistance; audio-only reactions by default.
- Spotify scopes requested at runtime depend on enabled features and are minimized by configuration.

## Next Steps
- Wire the Overwolf adapter to actual UI windows and register listeners via `overwolf.games.events` API.
- Expand test coverage for rule evaluation, queue behavior, and compliance guards.
- Integrate real-time Spotify Web Playback SDK device lifecycle management for in-app playback.


ts a TS script im ngl icl ts pmo sb 

"uhh im a TypeScript" ahh script

we get it vro you're a TS script 💀
