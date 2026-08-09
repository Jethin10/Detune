import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type { SoundMode } from './audioEngine'
import type { ProbeEvent } from './useNetworkInstrument'
import { useNetworkInstrument } from './useNetworkInstrument'

function Waveform({ events, active }: { events: ProbeEvent[]; active: boolean }) {
  const bars = Array.from({ length: 44 }, (_, index) => {
    const event = events[index % Math.max(events.length, 1)]
    const latency = event?.latency ?? 80 + Math.sin(index * 1.7) * 30
    const height = active ? Math.min(94, 16 + latency / 4) : 10 + Math.sin(index * 0.8) * 5
    return <span key={index} style={{ height: `${height}%`, animationDelay: `${-index * 72}ms` }} />
  })
  return <div className={`waveform ${active ? 'is-active' : ''}`} aria-hidden="true">{bars}</div>
}

function NetworkCore({ events, active }: { events: ProbeEvent[]; active: boolean }) {
  const latest = events[0]
  return (
    <div className={`network-core ${active ? 'is-active' : ''}`}>
      <div className="orbit orbit-one"><i /><i /><i /></div>
      <div className="orbit orbit-two"><i /><i /></div>
      <div className="pulse-ring" />
      <div className="core-glow">
        <div className="core-noise" />
        <div className="core-readout">
          <strong>{latest ? latest.latency : '—'}</strong>
          <span>{latest ? 'ms' : 'idle'}</span>
        </div>
      </div>
    </div>
  )
}

function SoundIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.8 8.5H3v7h3.8L11 19V5Zm4.5 4.5 5 5m0-5-5 5" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.8 8.5H3v7h3.8L11 19V5Zm4 3.5c1.8 2 1.8 5 0 7m3-10c3.5 3.6 3.5 9.4 0 13" /></svg>
  )
}

const MODES: { id: SoundMode; name: string; detail: string }[] = [
  { id: 'drift', name: 'Drift', detail: 'Slow · spacious' },
  { id: 'pulse', name: 'Pulse', detail: 'Rhythmic · bright' },
  { id: 'surge', name: 'Surge', detail: 'Fast · unstable' },
]

const CHAPTERS = [
  { at: 0, name: 'First contact', detail: 'Signal percussion online' },
  { at: 15, name: 'Low current', detail: 'Sub frequencies emerge' },
  { at: 35, name: 'Harmonic bloom', detail: 'Upper harmonics unlocked' },
  { at: 65, name: 'Full spectrum', detail: 'The network reveals itself' },
]

function App() {
  const { isListening, isMuted, mode, events, stats, toggleListening, toggleMuted, changeMode, burst } = useNetworkInstrument()
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const connection = navigator.onLine ? 'Network online' : 'Network offline'

  useEffect(() => {
    if (!isListening) return
    const timer = window.setInterval(() => setSessionSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isListening])

  const currentChapter = [...CHAPTERS].reverse().find((chapter) => sessionSeconds >= chapter.at) ?? CHAPTERS[0]
  const nextChapter = CHAPTERS.find((chapter) => chapter.at > sessionSeconds)
  const fingerprint = useMemo(() => {
    if (events.length < 4) return 'Unclassified signal'
    const texture = stats.reliability < 80 ? 'Fractured' : stats.average > 300 ? 'Deep' : stats.average < 120 ? 'Glass' : 'Velvet'
    const motion = events[0].latency % 2 === 0 ? 'Current' : 'Static'
    return `${texture} ${motion}`
  }, [events, stats.average, stats.reliability])

  return (
    <main>
      <nav>
        <a className="brand" href="#top" aria-label="Detune home">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>DETUNE</span>
        </a>
        <div className="nav-status"><span className={navigator.onLine ? 'online' : ''} />{connection}</div>
        <button className="icon-button" onClick={toggleMuted} aria-label={isMuted ? 'Unmute' : 'Mute'}>
          <SoundIcon muted={isMuted} />
        </button>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> Network sonification instrument <span /></div>
        <h1>Hear what your<br /><em>network feels.</em></h1>
        <p className="intro">Every request has a rhythm. Every delay, a pitch. Detune turns the invisible pulse of your internet into a living soundscape.</p>

        <div className="instrument-shell">
          <div className="corner-label top-left">LIVE SIGNAL</div>
          <div className="corner-label top-right">{isListening ? 'CAPTURING' : 'STANDBY'}</div>
          <NetworkCore events={events} active={isListening} />
          <Waveform events={events} active={isListening} />
          <div className="instrument-footer">
            <div><span>LATENCY</span><strong>{stats.average || '—'}<small>{stats.average ? ' ms' : ''}</small></strong></div>
            <div><span>RELIABILITY</span><strong>{stats.reliability}<small>%</small></strong></div>
            <div><span>DISSONANCE</span><strong>{stats.failures}</strong></div>
          </div>
        </div>

        <div className="mode-selector" aria-label="Sound mode">
          {MODES.map((soundMode) => (
            <button className={mode === soundMode.id ? 'active' : ''} key={soundMode.id} onClick={() => changeMode(soundMode.id)}>
              <strong>{soundMode.name}</strong><small>{soundMode.detail}</small>
            </button>
          ))}
        </div>

        <div className="primary-controls">
          <button className={`listen-button ${isListening ? 'listening' : ''}`} onClick={() => void toggleListening()}>
            <span className="button-pulse"><i /></span>
            <span><strong>{isListening ? 'Stop listening' : 'Listen to your network'}</strong><small>{isListening ? 'The signal is now audible' : 'Headphones recommended'}</small></span>
          </button>
          <button className="burst-button" disabled={!isListening} onClick={burst}><span>⌁</span><strong>Send a signal burst</strong><small>Probe the full constellation</small></button>
        </div>
        <p className="privacy-note"><span>◇</span> Runs entirely in your browser. No data is collected.</p>

        <div className={`journey-card ${isListening ? 'active' : ''}`}>
          <div className="journey-copy">
            <span className="section-kicker">YOUR LIVE COMPOSITION</span>
            <h3>{fingerprint}</h3>
            <p>{isListening ? currentChapter.detail : 'Start the instrument to discover the unique sonic identity of this connection.'}</p>
          </div>
          <div className="journey-progress">
            <div className="journey-meta"><span>CHAPTER {CHAPTERS.indexOf(currentChapter) + 1} / {CHAPTERS.length}</span><time>{Math.floor(sessionSeconds / 60).toString().padStart(2, '0')}:{(sessionSeconds % 60).toString().padStart(2, '0')}</time></div>
            <div className="chapter-track">
              {CHAPTERS.map((chapter) => <i key={chapter.name} className={sessionSeconds >= chapter.at && isListening ? 'reached' : ''} />)}
            </div>
            <div className="chapter-labels"><strong>{isListening ? currentChapter.name : 'Waiting for signal'}</strong><span>{nextChapter && isListening ? `Next layer in ${nextChapter.at - sessionSeconds}s` : isListening ? 'All layers unlocked' : 'Four evolving layers'}</span></div>
          </div>
        </div>
      </section>

      <section className="translation">
        <div className="section-kicker">THE TRANSLATION</div>
        <h2>Your connection,<br />reimagined as sound.</h2>
        <div className="translation-grid">
          <article><div className="glyph dns"><i /><i /><i /><i /></div><span>01</span><h3>DNS becomes<br />percussion</h3><p>Every domain resolution strikes a tactile beat—the foundational rhythm of your browsing.</p></article>
          <article><div className="glyph latency"><i /><i /><i /><i /><i /></div><span>02</span><h3>Latency shapes<br />the melody</h3><p>Fast responses sing high and bright. Slower connections settle into deeper, warmer tones.</p></article>
          <article><div className="glyph failure"><i /><i /><i /></div><span>03</span><h3>Failures create<br />dissonance</h3><p>Dropped packets and unreachable hosts bend harmony into tension you can instantly feel.</p></article>
        </div>
      </section>

      <section className="live-log">
        <div className="log-header"><div><span className="section-kicker">SIGNAL LOG</span><h2>The latest notes.</h2></div><span className="log-count">{events.length.toString().padStart(2, '0')} EVENTS</span></div>
        <div className="log-table">
          {events.length === 0 ? <div className="empty-log">Start listening to reveal your network's composition.</div> : events.slice(0, 6).map((event) => (
            <div className="log-row" key={event.id}>
              <span className="signal-dot" style={{ background: event.color, boxShadow: `0 0 14px ${event.color}` }} />
              <strong>{event.host}</strong>
              <span>{event.success ? 'RESOLVED' : 'DROPPED'}</span>
              <span className="latency-value">{event.latency} ms</span>
              <time>{event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
            </div>
          ))}
        </div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark"><i /><i /><i /></span><span>DETUNE</span></a><p>The internet was always making music.<br />You just needed a way to hear it.</p><a href="https://github.com/Jethin10/Detune" target="_blank" rel="noreferrer">OPEN SOURCE ↗</a></footer>
    </main>
  )
}

export default App
