# Detune

**Hear what your network feels.**

Detune is a browser-based network sonification instrument. It turns live requests into an evolving soundscape:

- DNS-style network events become percussion
- Response latency controls melodic pitch
- Failed requests produce dissonance

No network data leaves the browser beyond the probes themselves, and nothing is stored.

## Gameplay

- **Score & combos** — every clean signal scores; each success stacks a combo multiplier, each failure breaks it.
- **Levels & ranks** — XP from signals, storms, and directives earns ranks from Operator to The Dissonance.
- **Signal sources** — discover the five tracked sources (Cloudflare, Google, GitHub, Wikipedia, Quad9) to fill your constellation.
- **Glitch storms** — every so often the network misbehaves: a storm of failures hits your ears as harsh dissonance until the signal clears.
- **Directives** — three rotating missions per round; clear all three for bonus XP.
- **Three modes** — Drift (ambient), Pulse (rhythmic), Surge (frantic), each with its own scale, tempo, and drum pattern.

Everything runs in the browser; only your best score and combo are stored locally.

## Run locally

```bash
npm install
npm run dev
```

Use headphones, press **Listen to your network**, and browse the live signal log.

## Validate

```bash
npm run lint
npm run build
```

## How it works

The app probes a rotating set of well-known public endpoints using privacy-preserving opaque browser requests. Measured round-trip time drives a custom Web Audio synthesis engine. Each target receives a distinct harmonic voice, while unavailable endpoints trigger intentionally unstable intervals.

> Browser APIs do not expose isolated DNS timing consistently, so Detune sonifies complete request timing as a musical interpretation of the network—not as a diagnostic tool.

## Live site

[https://jethin10.github.io/Detune/](https://jethin10.github.io/Detune/)

Built with React, TypeScript, Vite, and the Web Audio API.
