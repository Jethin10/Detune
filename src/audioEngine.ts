export type NetworkSignal = {
  latency: number
  success: boolean
  intensity: number
}

const NOTES = [110, 130.81, 146.83, 164.81, 196, 220, 261.63]

export class NetworkAudioEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private muted = false

  async start() {
    if (!this.context) this.createGraph()
    await this.context?.resume()
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.context.currentTime, 0.04)
    }
  }

  play(signal: NetworkSignal, voice: number) {
    if (!this.context || !this.master || this.muted) return
    const now = this.context.currentTime
    this.playPercussion(now, signal.intensity)

    if (signal.success) {
      const note = NOTES[voice % NOTES.length]
      const latencyPitch = Math.max(0.58, Math.min(1.7, 95 / Math.max(signal.latency, 20)))
      this.playTone(now + 0.025, note * latencyPitch, signal.intensity)
    } else {
      this.playFailure(now + 0.025)
    }
  }

  private createGraph() {
    this.context = new AudioContext()
    const master = this.context.createGain()
    const compressor = this.context.createDynamicsCompressor()
    const reverb = this.context.createConvolver()
    const wet = this.context.createGain()

    compressor.threshold.value = -16
    compressor.ratio.value = 4
    master.gain.value = 0.55
    wet.gain.value = 0.18
    reverb.buffer = this.createImpulse(this.context, 1.8, 2.8)

    master.connect(compressor)
    master.connect(reverb)
    reverb.connect(wet)
    wet.connect(compressor)
    compressor.connect(this.context.destination)

    this.master = master
  }

  private createImpulse(context: AudioContext, duration: number, decay: number) {
    const length = context.sampleRate * duration
    const impulse = context.createBuffer(2, length, context.sampleRate)
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel)
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
      }
    }
    return impulse
  }

  private playPercussion(now: number, intensity: number) {
    if (!this.context || !this.master) return
    const length = Math.floor(this.context.sampleRate * 0.055)
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length)

    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    filter.type = 'bandpass'
    filter.frequency.value = 1800 + intensity * 2600
    filter.Q.value = 5
    gain.gain.setValueAtTime(0.12 + intensity * 0.1, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065)
    source.buffer = buffer
    source.connect(filter).connect(gain).connect(this.master)
    source.start(now)
  }

  private playTone(now: number, frequency: number, intensity: number) {
    if (!this.context || !this.master) return
    const oscillator = this.context.createOscillator()
    const overtone = this.context.createOscillator()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()

    oscillator.type = 'sine'
    overtone.type = 'triangle'
    oscillator.frequency.setValueAtTime(frequency, now)
    overtone.frequency.setValueAtTime(frequency * 2.01, now)
    filter.type = 'lowpass'
    filter.frequency.value = 1400 + intensity * 1800
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.17, now + 0.018)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7)

    oscillator.connect(filter)
    overtone.connect(filter)
    filter.connect(gain).connect(this.master)
    oscillator.start(now)
    overtone.start(now)
    oscillator.stop(now + 0.75)
    overtone.stop(now + 0.75)
  }

  private playFailure(now: number) {
    if (!this.context || !this.master) return
    ;[116.5, 123.5, 174.7].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator()
      const gain = this.context!.createGain()
      oscillator.type = index === 2 ? 'sawtooth' : 'triangle'
      oscillator.frequency.value = frequency
      oscillator.detune.value = index * 11
      gain.gain.setValueAtTime(0.001, now)
      gain.gain.exponentialRampToValueAtTime(0.065, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.62)
      oscillator.connect(gain).connect(this.master!)
      oscillator.start(now)
      oscillator.stop(now + 0.65)
    })
  }
}
