import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NetworkAudioEngine, type SoundMode, type NetworkProfile, INITIAL_PROFILE } from './audioEngine'

export type ProbeEvent = {
  id: number
  host: string
  latency: number
  success: boolean
  timestamp: Date
  color: string
  storm: boolean
}

export type Toast = {
  id: number
  title: string
  detail: string
  kind: 'discovery' | 'level' | 'combo' | 'storm' | 'mission' | 'fumble' | 'info'
}

export type Mission = {
  id: string
  title: string
  target: number
  count: number
  done: boolean
}

const TARGETS = [
  { host: 'Cloudflare', url: 'https://www.cloudflare.com/favicon.ico', color: '#b7ff5a' },
  { host: 'Google', url: 'https://www.google.com/favicon.ico', color: '#70dfff' },
  { host: 'GitHub', url: 'https://github.com/favicon.ico', color: '#bf8cff' },
  { host: 'Wikipedia', url: 'https://www.wikipedia.org/static/favicon/wikipedia.ico', color: '#ffb86b' },
  { host: 'Quad9', url: 'https://www.quad9.net/favicon.ico', color: '#ff719a' },
]

const STORM_TARGET = { host: 'Blackout Node', url: 'https://203.0.113.9/favicon.ico', color: '#ff5a6e' }

export const TITLES = ['Operator', 'Signal Analyst', 'Navigator', 'Cartographer', 'Packet Oracle', 'Network Shaman', 'Lord of Latency', 'Bandwidth Bard', 'The Dissonance']

const MISSION_POOL = [
  { id: 'signals', title: 'Transmit 30 signals', target: 30 },
  { id: 'combo', title: 'Hold a ×12 combo', target: 12 },
  { id: 'burst', title: 'Fire 3 signal bursts', target: 3 },
  { id: 'discover', title: 'Discover 3 signal sources', target: 3 },
  { id: 'storm', title: 'Survive a glitch storm', target: 1 },
  { id: 'clean', title: 'Run 15 clean signals in a row', target: 15 },
]

const timeout = (ms: number, controller: AbortController) =>
  window.setTimeout(() => controller.abort(), ms)

function xpFor(level: number) {
  return Math.floor(130 * Math.pow(level, 1.28))
}

function loadBest(key: string) {
  try {
    const raw = window.localStorage.getItem(`detune-${key}`)
    return raw ? Number(raw) : 0
  } catch {
    return 0
  }
}

function saveBest(key: string, value: number) {
  try {
    window.localStorage.setItem(`detune-${key}`, String(value))
  } catch {
    // private mode — ignore
  }
}

export function useNetworkInstrument() {
  const [isListening, setIsListening] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [mode, setMode] = useState<SoundMode>('drift')
  const [events, setEvents] = useState<ProbeEvent[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState(() => loadBest('best-score'))
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(() => loadBest('best-combo'))
  const [level, setLevel] = useState(1)
  const [xp, setXp] = useState(0)
  const [discovered, setDiscovered] = useState<string[]>([])
  const [inStorm, setInStorm] = useState(false)
  const [profile, setProfile] = useState<NetworkProfile>(INITIAL_PROFILE)
  const [missions, setMissions] = useState<Mission[]>(() =>
    MISSION_POOL.slice(0, 3).map((mission) => ({ ...mission, count: 0, done: false })),
  )
  const [totalSignals, setTotalSignals] = useState(0)

  const audio = useRef<NetworkAudioEngine | null>(null)
  const sequence = useRef(0)
  const toastId = useRef(0)
  const discoveredRef = useRef<string[]>([])
  const levelRef = useRef(1)
  const xpRef = useRef(0)
  const comboRef = useRef(0)
  const inStormRef = useRef(false)
  const listeningRef = useRef(false)
  const stormEndAt = useRef(0)
  const nextStormAt = useRef(0)
  const setIndex = useRef(0)
  const missionDone = useRef(false)
  const setCounters = useRef({ signals: 0, bursts: 0, discovered: 0, storms: 0, clean: 0, comboMax: 0 })

  const pushToast = useCallback((title: string, detail: string, kind: Toast['kind']) => {
    toastId.current += 1
    const id = toastId.current
    setToasts((current) => [...current.slice(-3), { id, title, detail, kind }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), kind === 'fumble' ? 2000 : 4600)
  }, [])

  const addXp = useCallback((amount: number) => {
    xpRef.current += amount
    setXp(xpRef.current)
    let lvl = levelRef.current
    let gained = 0
    while (xpRef.current >= xpFor(lvl)) {
      xpRef.current -= xpFor(lvl)
      lvl += 1
      gained += 1
    }
    if (gained > 0) {
      levelRef.current = lvl
      setLevel(lvl)
      setXp(xpRef.current)
      const title = TITLES[Math.min(lvl - 1, TITLES.length - 1)]
      pushToast(`LEVEL ${lvl} — ${title}`, gained > 1 ? 'Multiple ranks gained at once' : 'The network deepens for you', 'level')
      audio.current?.playLevelUp()
    }
  }, [pushToast])

  const awardScore = useCallback((points: number) => {
    setScore((current) => {
      const next = current + points
      if (next > loadBest('best-score')) {
        setBestScore(next)
        saveBest('best-score', next)
      }
      return next
    })
  }, [])

  const evaluateMissions = useCallback(() => {
    if (missionDone.current) return
    const counters = setCounters.current
    const counts: Record<string, number> = {
      signals: counters.signals,
      combo: counters.comboMax,
      burst: counters.bursts,
      discover: counters.discovered,
      storm: counters.storms,
      clean: counters.clean,
    }
    setMissions((current) => {
      const updated = current.map((mission) => ({
        ...mission,
        count: Math.min(mission.target, counts[mission.id] ?? 0),
        done: (counts[mission.id] ?? 0) >= mission.target,
      }))
      if (updated.every((mission) => mission.done) && !missionDone.current) {
        missionDone.current = true
        window.setTimeout(() => {
          pushToast('DIRECTIVES COMPLETE', '+150 XP for flawless signal command', 'mission')
          audio.current?.playMissionComplete()
          addXp(150)
          setIndex.current += 1
          setCounters.current = { signals: 0, bursts: 0, discovered: 0, storms: 0, clean: 0, comboMax: 0 }
          missionDone.current = false
          const start = (setIndex.current * 3) % MISSION_POOL.length
          setMissions(MISSION_POOL.slice(start, start + 3).map((mission) => ({ ...mission, count: 0, done: false })))
        }, 600)
      }
      return updated
    })
  }, [addXp, pushToast])

  const applyResult = useCallback((event: ProbeEvent, voice: number) => {
    const engine = audio.current
    const intensity = Math.min(1, Math.max(0.15, event.latency / 600))
    engine?.play({ latency: event.latency, success: event.success, intensity }, voice)
    setProfile(engine?.getProfile() ?? INITIAL_PROFILE)

    if (event.success) {
      const nextCombo = comboRef.current + 1
      comboRef.current = nextCombo
      setCombo(nextCombo)
      if (nextCombo > setCounters.current.comboMax) setCounters.current.comboMax = nextCombo
      if (nextCombo > loadBest('best-combo')) {
        setBestCombo(nextCombo)
        saveBest('best-combo', nextCombo)
      }
      if (nextCombo >= 5 && nextCombo % 5 === 0) {
        pushToast(`COMBO ×${nextCombo}`, `Multiplier ${(1 + Math.min(2, nextCombo * 0.05)).toFixed(2)}× — keep it clean`, 'combo')
        engine?.playCombo(nextCombo)
      }
      if (!event.storm && !discoveredRef.current.includes(event.host)) {
        discoveredRef.current = [...discoveredRef.current, event.host]
        setDiscovered(discoveredRef.current)
        setCounters.current.discovered += 1
        pushToast('SIGNAL SOURCE DISCOVERED', `${event.host} is now tracked in your constellation`, 'discovery')
        engine?.playDiscovery()
      }
      if (!event.storm) {
        setCounters.current.clean += 1
      }
      const multiplier = 1 + Math.min(2, nextCombo * 0.05)
      const latencyBonus = Math.max(0, Math.round((110 - event.latency) / 12))
      awardScore(Math.round((12 + latencyBonus) * multiplier))
      addXp(event.storm ? 12 : 10)
    } else {
      if (comboRef.current >= 5) {
        pushToast('COMBO LOST', `${comboRef.current}× streak broken — the network punished you`, 'fumble')
        engine?.playFumble()
      }
      comboRef.current = 0
      setCombo(0)
      setCounters.current.clean = 0
      awardScore(14)
      addXp(event.storm ? 22 : 16)
    }
    setCounters.current.signals += 1
    evaluateMissions()
  }, [addXp, awardScore, evaluateMissions, pushToast])

  const probe = useCallback(async (isStormProbe: boolean) => {
    const target = isStormProbe ? STORM_TARGET : TARGETS[sequence.current % TARGETS.length]
    if (!isStormProbe) sequence.current += 1
    const controller = new AbortController()
    const timer = timeout(4200, controller)
    const startedAt = performance.now()
    let success = true
    try {
      const separator = target.url.includes('?') ? '&' : '?'
      await fetch(`${target.url}${separator}detune=${Date.now()}`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch {
      success = false
    } finally {
      window.clearTimeout(timer)
    }
    const latency = Math.round(performance.now() - startedAt)
    const event: ProbeEvent = {
      id: Date.now() + sequence.current,
      host: target.host,
      latency,
      success,
      timestamp: new Date(),
      color: target.color,
      storm: isStormProbe,
    }
    setEvents((current) => [event, ...current].slice(0, 24))
    setTotalSignals((current) => current + 1)
    applyResult(event, isStormProbe ? 3 : sequence.current % TARGETS.length)
  }, [applyResult])

  useEffect(() => {
    listeningRef.current = isListening
    if (!isListening) return
    void probe(inStormRef.current)
    const intervalMs = mode === 'drift' ? 1450 : mode === 'pulse' ? 1050 : 680
    const interval = window.setInterval(() => void probe(inStormRef.current), intervalMs)
    const stormTimer = window.setInterval(() => {
      const now = Date.now()
      if (inStormRef.current) {
        if (now >= stormEndAt.current) {
          inStormRef.current = false
          setInStorm(false)
          audio.current?.setStorm(false)
          nextStormAt.current = now + 55000 + Math.random() * 60000
          setCounters.current.storms += 1
          evaluateMissions()
          audio.current?.playStormEnd()
          pushToast('SIGNAL RESTORED', 'The network survived the storm. +60 XP', 'storm')
          addXp(60)
        }
      } else if (now >= nextStormAt.current) {
        inStormRef.current = true
        setInStorm(true)
        audio.current?.setStorm(true)
        stormEndAt.current = now + 8000
        nextStormAt.current = now + 120000
        audio.current?.playStormStart()
        pushToast('GLITCH STORM DETECTED', 'Packet loss ahead — brace for dissonance', 'storm')
      }
    }, 500)
    return () => {
      window.clearInterval(interval)
      window.clearInterval(stormTimer)
    }
  }, [isListening, mode, probe, addXp, evaluateMissions, pushToast])

  const toggleListening = useCallback(async () => {
    if (!isListening) {
      audio.current ??= new NetworkAudioEngine()
      audio.current.setMode(mode)
      audio.current.setMuted(isMuted)
      await audio.current.start()
      nextStormAt.current = Date.now() + 45000 + Math.random() * 30000
      pushToast('SCAN ENGAGED', 'Score climbs while you listen. Watch for glitch storms.', 'info')
    } else {
      audio.current?.stop()
      pushToast('SCAN OFFLINE', `Session best ${bestScore.toLocaleString()} pts — beat it next time`, 'info')
    }
    setIsListening((current) => !current)
  }, [isListening, mode, isMuted, pushToast, bestScore])

  const toggleMuted = useCallback(() => {
    setIsMuted((current) => {
      audio.current?.setMuted(!current)
      return !current
    })
  }, [])

  const changeMode = useCallback((nextMode: SoundMode) => {
    setMode(nextMode)
    audio.current?.setMode(nextMode)
  }, [])

  const burst = useCallback(() => {
    if (!listeningRef.current) return
    setCounters.current.bursts += 1
    evaluateMissions()
    audio.current?.playBurst()
    ;[0, 180, 360, 540, 720].forEach((delay) => window.setTimeout(() => void probe(inStormRef.current), delay))
  }, [probe, evaluateMissions])

  const stats = useMemo(() => {
    const successful = events.filter((event) => event.success)
    const average = successful.length
      ? Math.round(successful.reduce((sum, event) => sum + event.latency, 0) / successful.length)
      : 0
    const failures = events.length - successful.length
    return {
      average,
      reliability: events.length ? Math.round((successful.length / events.length) * 100) : 100,
      failures,
    }
  }, [events])

  const xpToNext = xpFor(level)
  const levelTitle = TITLES[Math.min(level - 1, TITLES.length - 1)]
  const multiplier = 1 + Math.min(2, combo * 0.05)

  return {
    isListening,
    isMuted,
    mode,
    events,
    stats,
    toasts,
    missions,
    score,
    bestScore,
    combo,
    bestCombo,
    level,
    levelTitle,
    xp,
    xpToNext,
    multiplier,
    discovered,
    inStorm,
    profile,
    totalSignals,
    toggleListening,
    toggleMuted,
    changeMode,
    burst,
    dismissToast: (id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)),
  }
}