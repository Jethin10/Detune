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

## How it works

The app probes a rotating set of well-known public endpoints using privacy-preserving opaque browser requests. But the music is not pre-composed — it is **mapped live from your measurements**:

- Your **latency** sets the tempo and register (fast pings = faster, higher; lag = slow, low)
- Your **reliability** picks the harmony (consonant → tensed → fractured) and the density of the drum pattern
- Your **jitter** warps the pad texture — an unstable connection makes the whole bed wobble
- Each of the five sources has its own instrument voice, so you can hear *which server* is answering
- Failures sound in the failing source's own voice, bent out of tune

Glitch storms probe a reserved TEST-NET address (203.0.113.9) — genuine, guaranteed failures — to dramatize packet loss. The game layer (score, combos, levels, directives) runs entirely client-side; only your best score and combo are stored locally.

## Live site

[https://jethin10.github.io/Detune/](https://jethin10.github.io/Detune/)

Built with React, TypeScript, Vite, and the Web Audio API.
