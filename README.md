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
2. Copy `config/app.config.example.json` to `config/app.config.json` and adjust to your needs.
3. Run the orchestrator in mock mode: `npm start`.

## Compliance Highlights
- Only Overwolf GEP is referenced for live Valorant signals (`riotStrictMode` default is `true`).
- No tactical overlays or coaching assistance; audio-only reactions by default.
- Spotify scopes requested at runtime depend on enabled features and are minimized by configuration.

## Next Steps
- Wire the Overwolf adapter to actual UI windows and register listeners via `overwolf.games.events` API.
- Implement Spotify OAuth flows and Web Playback SDK device lifecycle management.
- Expand test coverage for rule evaluation, queue behavior, and compliance guards.
