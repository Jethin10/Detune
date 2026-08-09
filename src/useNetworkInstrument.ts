import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NetworkAudioEngine } from './audioEngine'

export type ProbeEvent = {
  id: number
  host: string
  latency: number
  success: boolean
  timestamp: Date
  color: string
}

const TARGETS = [
  { host: 'Cloudflare', url: 'https://www.cloudflare.com/favicon.ico', color: '#b7ff5a' },
  { host: 'Google', url: 'https://www.google.com/favicon.ico', color: '#70dfff' },
  { host: 'GitHub', url: 'https://github.com/favicon.ico', color: '#bf8cff' },
  { host: 'Wikipedia', url: 'https://www.wikipedia.org/static/favicon/wikipedia.ico', color: '#ffb86b' },
  { host: 'Quad9', url: 'https://www.quad9.net/favicon.ico', color: '#ff719a' },
]

const timeout = (ms: number, controller: AbortController) =>
  window.setTimeout(() => controller.abort(), ms)

export function useNetworkInstrument() {
  const [isListening, setIsListening] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [events, setEvents] = useState<ProbeEvent[]>([])
  const audio = useRef<NetworkAudioEngine | null>(null)
  const sequence = useRef(0)

  const probe = useCallback(async () => {
    const targetIndex = sequence.current % TARGETS.length
    const target = TARGETS[targetIndex]
    sequence.current += 1
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
      id: Date.now() + targetIndex,
      host: target.host,
      latency,
      success,
      timestamp: new Date(),
      color: target.color,
    }
    const intensity = Math.min(1, Math.max(0.15, latency / 600))
    audio.current?.play({ latency, success, intensity }, targetIndex)
    setEvents((current) => [event, ...current].slice(0, 24))
  }, [])

  useEffect(() => {
    if (!isListening) return
    void probe()
    const interval = window.setInterval(() => void probe(), 1250)
    return () => window.clearInterval(interval)
  }, [isListening, probe])

  const toggleListening = useCallback(async () => {
    if (!isListening) {
      audio.current ??= new NetworkAudioEngine()
      await audio.current.start()
    }
    setIsListening((current) => !current)
  }, [isListening])

  const toggleMuted = useCallback(() => {
    setIsMuted((current) => {
      audio.current?.setMuted(!current)
      return !current
    })
  }, [])

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

  return { isListening, isMuted, events, stats, toggleListening, toggleMuted }
}
