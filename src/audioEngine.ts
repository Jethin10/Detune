export type NetworkSignal = {
  latency: number
  success: boolean
  intensity: number
}

export type SoundMode = 'drift' | 'pulse' | 'surge'

export type HarmonyLabel = 'CONSONANT' | 'TENSED' | 'FRACTURED'
export type RegisterLabel = 'HIGH' | 'MID' | 'LOW'

export type NetworkProfile = {
  tempoBpm: number
  harmony: HarmonyLabel
  register: RegisterLabel
  jitterMs: number
}

export const INITIAL_PROFILE: NetworkProfile = { tempoBpm: 78, harmony: 'CONSONANT', register: 'MID', jitterMs: 0 }

const SCALES: Record<SoundMode, number[]> = {
  drift: [220, 261.63, 293.66, 329.63, 392, 440, 523.25],
  pulse: [220, 246.94, 293.66, 329.63, 392, 440, 493.88],
  surge: [220, 261.63, 311.13, 349.23, 415.3, 466.16, 523.25],
}

const BPM_BASE: Record<SoundMode, number> = { drift: 78, pulse: 112, surge: 138 }

const BASS_ROOTS = [110, 87.31, 98, 130.81]

// Chord sets per harmony state — your reliability picks the tonality.
const CHORDS_CONSONANT = [
  [110, 164.81, 261.63],
  [130.81, 196, 293.66],
  [98, 146.83, 220],
  [130.81, 164.81, 261.63],
]
const CHORDS_TENSED = [
  [110, 130.81, 164.81],
  [92.5, 138.59, 185],
  [103.83, 155.56, 207.65],
  [116.54, 174.61, 233.08],
]
const CHORDS_FRACTURED = [
  [103.83, 116.54, 155.56],
  [92.5, 123.47, 146.83],
  [110, 138.59, 164.81],
  [97.99, 130.81, 155.56],
]

type DrumPattern = { kick: number[]; snare: number[]; hat: number[]; openHat: number[] }

const PATTERNS_FULL: Record<SoundMode, DrumPattern> = {
  drift: { kick: [], snare: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], openHat: [] },
  pulse: { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], openHat: [14] },
  surge: { kick: [0, 3, 6, 8, 11, 14], snare: [5, 13], hat: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15], openHat: [15] },
}

const PATTERNS_STANDARD: Record<SoundMode, DrumPattern> = {
  drift: { kick: [], snare: [], hat: [2, 6, 10, 14], openHat: [] },
  pulse: { kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14], openHat: [] },
  surge: { kick: [0, 3, 6, 8, 11, 14], snare: [5, 13], hat: [0, 2, 4, 6, 8, 10, 12, 14], openHat: [] },
}

const PATTERNS_SPARSE: Record<SoundMode, DrumPattern> = {
  drift: { kick: [], snare: [], hat: [2, 7, 12], openHat: [] },
  pulse: { kick: [0, 8], snare: [12], hat: [2, 6, 10], openHat: [] },
  surge: { kick: [0, 4, 8, 12], snare: [8], hat: [0, 4, 8, 12], openHat: [] },
}

export class NetworkAudioEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private muted = false
  private running = false
  private eventCount = 0
  private mode: SoundMode = 'drift'
  private step = 0
  private nextStepTime = 0
  private schedulerTimer: number | null = null
  private storm = false

  // Smoothed network state — this is what makes the music YOURS.
  private avgLatency = 120
  private jitter = 18
  private reliability = 1

  async start() {
    if (!this.context) this.createGraph()
    await this.context?.resume()
    if (this.running) return
    this.running = true
    this.step = 0
    this.nextStepTime = (this.context?.currentTime ?? 0) + 0.15
    this.schedulerTimer = window.setInterval(() => this.scheduleSteps(), 90)
  }

  stop() {
    this.running = false
    if (this.schedulerTimer !== null) window.clearInterval(this.schedulerTimer)
    this.schedulerTimer = null
  }

  setStorm(storm: boolean) {
    this.storm = storm
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.context.currentTime, 0.04)
    }
  }

  setMode(mode: SoundMode) {
    this.mode = mode
  }

  getProfile(): NetworkProfile {
    return {
      tempoBpm: Math.round(this.tempo()),
      harmony: this.harmonyState(),
      register: this.registerState(),
      jitterMs: Math.round(this.jitter),
    }
  }

  play(signal: NetworkSignal, voice: number) {
    if (!this.context || !this.master || this.muted) return
    const now = this.context.currentTime
    const scale = SCALES[this.mode]
    this.eventCount += 1

    // Fold the measurement into the network-state memory.
    this.avgLatency += (signal.latency - this.avgLatency) * 0.12
    this.jitter += (Math.abs(signal.latency - this.avgLatency) - this.jitter) * 0.08
    this.reliability += ((signal.success ? 1 : 0) - this.reliability) * 0.15

    if (signal.success) {
      const note = scale[(voice + Math.floor(this.eventCount / 7)) % scale.length]
      const pitchFactor = Math.max(0.75, Math.min(1.45, 1.28 - signal.latency / 450))
      const registerFactor = this.registerFactor()
      this.voiceTone(voice, now, note * pitchFactor * registerFactor, Math.min(0.5, 0.24 + signal.intensity * 0.3))
      if (this.eventCount % 4 === 0) this.bassPush(now, BASS_ROOTS[this.eventCount % BASS_ROOTS.length])
      if (this.eventCount > 14 && this.eventCount % 7 === 0) this.shimmer(now + 0.1, note * 2)
    } else {
      this.dissonance(now, voice)
    }
  }

  playDiscovery() {
    const notes = [523.25, 659.25, 783.99]
    notes.forEach((frequency, index) => this.pluck((this.context?.currentTime ?? 0) + index * 0.085, frequency, 0.3))
  }

  playLevelUp() {
    if (!this.context) return
    const now = this.context.currentTime
    const arp = [261.63, 329.63, 392, 523.25, 659.25, 783.99]
    arp.forEach((frequency, index) => this.tone(now + index * 0.06, frequency, 'triangle', 0.16, 0.4))
    ;[392, 523.25, 659.25].forEach((frequency, index) =>
      this.padTone(now + 0.42, frequency, 1.6, 0.07 + (2 - index) * 0.025, 0.001),
    )
    this.noiseBurst(now + 0.42, 1.1, 'lowpass', 900, 0.16)
  }

  playCombo(tier: number) {
    if (!this.context) return
    const now = this.context.currentTime
    const scale = SCALES[this.mode]
    this.tone(now, scale[(tier + 2) % scale.length] * 2, 'triangle', 0.14, 0.22)
    this.tone(now + 0.05, scale[(tier + 4) % scale.length] * 2, 'triangle', 0.14, 0.3)
  }

  playStormStart() {
    if (!this.context) return
    const now = this.context.currentTime
    const saw = this.context.createOscillator()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    saw.type = 'sawtooth'
    saw.frequency.value = 55
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(900, now)
    filter.frequency.exponentialRampToValueAtTime(70, now + 2.2)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.5)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3.4)
    saw.connect(filter).connect(gain).connect(this.master!)
    saw.start(now)
    saw.stop(now + 3.5)
    this.noiseBurst(now, 3, 'lowpass', 300, 0.24)
  }

  playStormEnd() {
    if (!this.context) return
    const now = this.context.currentTime
    ;[261.63, 329.63, 392, 523.25].forEach((frequency, index) =>
      this.padTone(now + 0.05, frequency, 2.8, 0.07 - index * 0.008, index === 3 ? 0.35 : 1.2),
    )
    this.shimmer(now + 0.9, 1046.5)
  }

  playMissionComplete() {
    if (!this.context) return
    const now = this.context.currentTime
    const notes = [392, 523.25, 659.25, 783.99]
    notes.forEach((frequency, index) => this.pluck(now + index * 0.09, frequency, 0.3))
    ;[293.66, 440].forEach((frequency, index) => this.tone(now + 0.4, frequency, 'triangle', 0.13, 0.5 + index * 0.1))
    this.shimmer(now + 0.55, 987.77)
  }

  playBurst() {
    if (!this.context) return
    const now = this.context.currentTime
    const scale = SCALES[this.mode]
    ;[0, 1, 2, 3, 4].forEach((offset) => {
      this.pluck(now + offset * 0.07, scale[Math.min(offset * 2, scale.length - 1)] * 2, 0.28)
    })
  }

  playFumble() {
    if (!this.context || this.muted) return
    const now = this.context.currentTime
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.exponentialRampToValueAtTime(82.5, now + 0.28)
    gain.gain.setValueAtTime(0.14, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
    osc.connect(gain).connect(this.master!)
    osc.start(now)
    osc.stop(now + 0.4)
  }

  // ---- network → music mapping -------------------------------------------

  private tempo() {
    // Your latency is the tempo: fast pings speed the groove up, lag drags it down.
    return BPM_BASE[this.mode] * Math.max(0.75, Math.min(1.3, 1.25 - this.avgLatency / 700))
  }

  private harmonyState(): HarmonyLabel {
    // Your reliability picks the tonality: clean signals stay consonant,
    // dropped packets bend the harmony, heavy loss fractures it.
    if (this.reliability < 0.72) return 'FRACTURED'
    if (this.reliability < 0.9) return 'TENSED'
    return 'CONSONANT'
  }

  private registerFactor() {
    // Your latency picks the register: fast = soar, slow = sink.
    const state = this.registerState()
    return state === 'HIGH' ? 1.5 : state === 'LOW' ? 0.8 : 1
  }

  private registerState(): RegisterLabel {
    if (this.avgLatency < 85) return 'HIGH'
    if (this.avgLatency < 210) return 'MID'
    return 'LOW'
  }

  private pattern() {
    const harmony = this.harmonyState()
    if (harmony === 'FRACTURED') return PATTERNS_SPARSE[this.mode]
    if (harmony === 'TENSED') return PATTERNS_STANDARD[this.mode]
    return PATTERNS_FULL[this.mode]
  }

  private chordSet() {
    const harmony = this.harmonyState()
    if (harmony === 'FRACTURED') return CHORDS_FRACTURED
    if (harmony === 'TENSED') return CHORDS_TENSED
    return CHORDS_CONSONANT
  }

  // ---- scheduler ----------------------------------------------------------

  private scheduleSteps() {
    if (!this.context || !this.running) return
    const stepDur = 60 / this.tempo() / 4
    let guard = 0
    while (this.nextStepTime < this.context.currentTime + 0.28 && guard < 12) {
      this.scheduleStep(this.step % 16, this.nextStepTime, Math.floor(this.step / 16))
      this.nextStepTime += stepDur
      this.step += 1
      guard += 1
    }
  }

  private scheduleStep(step: number, t: number, bar: number) {
    const pattern = this.pattern()
    const register = this.registerFactor()
    if (this.mode === 'drift') {
      if (pattern.hat.includes(step)) this.shaker(t, 0.05)
      if (step === 0 && bar % 2 === 0) this.pluck(t, SCALES.drift[(bar * 3 + 2) % SCALES.drift.length] * register, 0.2)
    } else {
      if (pattern.kick.includes(step)) this.kick(t)
      if (pattern.snare.includes(step)) this.snare(t)
      if (pattern.hat.includes(step)) this.hat(t, pattern.openHat.includes(step))
    }
    if (this.mode === 'pulse') {
      if (step === 0 || step === 8) this.bassPush(t, BASS_ROOTS[bar % BASS_ROOTS.length])
      if (step === 0 && bar % 2 === 0) this.pluck(t, SCALES.pulse[(bar * 2 + 1) % SCALES.pulse.length] * 2 * register, 0.18)
    }
    if (this.mode === 'surge') {
      if (step === 0) this.bassPush(t, BASS_ROOTS[bar % BASS_ROOTS.length])
      if (step === 8) this.bassPush(t, BASS_ROOTS[(bar + 2) % BASS_ROOTS.length] * 1.5)
    }
    if (this.mode === 'drift' && bar % 2 === 0 && step === 4) {
      const chords = this.chordSet()
      const chord = chords[(bar / 2) % chords.length]
      chord.forEach((frequency, index) => this.padTone(t, frequency, 6.5, 0.045, 2 + index * 0.9))
    }
  }

  // ---- graph --------------------------------------------------------------

  private createGraph() {
    this.context = new AudioContext()
    const compressor = this.context.createDynamicsCompressor()
    const shaper = this.context.createWaveShaper()
    const reverb = this.context.createConvolver()
    const reverbGain = this.context.createGain()

    const master = this.context.createGain()
    const delayL = this.context.createDelay(1)
    const delayR = this.context.createDelay(1)
    const delayGainL = this.context.createGain()
    const delayGainR = this.context.createGain()
    const delaySend = this.context.createGain()

    compressor.threshold.value = -14
    compressor.ratio.value = 5
    compressor.attack.value = 0.004
    compressor.release.value = 0.18
    master.gain.value = 0.85
    reverbGain.gain.value = 0.17
    delayL.delayTime.value = 0.27
    delayR.delayTime.value = 0.34
    delayGainL.gain.value = 0.34
    delayGainR.gain.value = 0.34
    delaySend.gain.value = 0.22

    const curve = new Float32Array(1024)
    for (let i = 0; i < 1024; i += 1) {
      const x = (i / 512) - 1
      curve[i] = Math.tanh(2.4 * x) / Math.tanh(2.4)
    }
    shaper.curve = curve
    shaper.oversample = '2x'

    reverb.buffer = this.createImpulse(this.context, 2.4, 2.4)

    master.connect(shaper)
    shaper.connect(compressor)
    compressor.connect(this.context.destination)

    master.connect(reverb)
    reverb.connect(reverbGain)
    reverbGain.connect(compressor)

    master.connect(delaySend)
    delaySend.connect(delayL)
    delaySend.connect(delayR)
    delayL.connect(delayGainL)
    delayGainL.connect(delayR)
    delayR.connect(delayGainR)
    delayGainR.connect(delayL)
    delayGainL.connect(compressor)
    delayGainR.connect(compressor)

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

  private env(gain: GainNode, t: number, attack: number, peak: number, dur: number) {
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  }

  private tone(frequency: number, t: number, type: OscillatorType, peak: number, dur: number) {
    if (!this.context || !this.master) return
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = type
    osc.frequency.value = frequency
    this.env(gain, t, 0.015, peak, dur)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  private padTone(frequency: number, t: number, dur: number, peak = 0.06, attack = 1.5) {
    if (!this.context || !this.master) return
    // Your jitter crams the pad's detune — an unstable connection makes the
    // bed itself warble.
    const spread = Math.min(14, 3 + this.jitter / 4)
    const oscA = this.context.createOscillator()
    const oscB = this.context.createOscillator()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    oscA.type = 'sawtooth'
    oscB.type = 'sawtooth'
    oscA.frequency.value = frequency
    oscB.frequency.value = frequency * 1.005
    oscA.detune.value = -spread
    oscB.detune.value = spread
    filter.type = 'lowpass'
    filter.frequency.value = Math.max(300, 900 - this.jitter * 6)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    oscA.connect(filter)
    oscB.connect(filter)
    filter.connect(gain).connect(this.master)
    oscA.start(t)
    oscB.start(t)
    oscA.stop(t + dur + 0.1)
    oscB.stop(t + dur + 0.1)
  }

  // Per-source voices — you hear WHICH server is answering.
  private voiceTone(voice: number, t: number, frequency: number, peak: number) {
    switch (voice % 5) {
      case 0: // Cloudflare — glass bell
        this.pluck(frequency, t, peak)
        break
      case 1: // Google — marimba
        this.marimba(frequency, t, peak)
        break
      case 2: // GitHub — wooden tick
        this.wood(frequency, t, peak)
        break
      case 3: // Wikipedia — warm chime
        this.chime(frequency, t, peak)
        break
      default: // Quad9 — dark pluck
        this.darkPluck(frequency, t, peak)
    }
  }

  private marimba(frequency: number, t: number, peak: number) {
    if (!this.context || !this.master) return
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency
    this.env(gain, t, 0.004, peak, 0.42)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.5)
  }

  private wood(frequency: number, t: number, peak: number) {
    if (!this.context || !this.master) return
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = 'triangle'
    osc.frequency.value = frequency
    this.env(gain, t, 0.005, peak, 0.3)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.35)
  }

  private chime(frequency: number, t: number, peak: number) {
    if (!this.context || !this.master) return
    const oscA = this.context.createOscillator()
    const oscB = this.context.createOscillator()
    const gain = this.context.createGain()
    oscA.type = 'sine'
    oscB.type = 'sine'
    oscA.frequency.value = frequency
    oscB.frequency.value = frequency * 2.02
    oscB.detune.value = 3
    this.env(gain, t, 0.02, peak, 0.9)
    oscA.connect(gain)
    oscB.connect(gain)
    gain.connect(this.master)
    oscA.start(t)
    oscB.start(t)
    oscA.stop(t + 1)
    oscB.stop(t + 1)
  }

  private darkPluck(frequency: number, t: number, peak: number) {
    if (!this.context || !this.master) return
    const car = this.context.createOscillator()
    const mod = this.context.createOscillator()
    const modGain = this.context.createGain()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    car.type = 'sine'
    mod.type = 'sine'
    car.frequency.value = frequency
    mod.frequency.value = frequency * 2.05
    modGain.gain.setValueAtTime(frequency, t)
    modGain.gain.exponentialRampToValueAtTime(frequency * 0.2, t + 0.3)
    filter.type = 'lowpass'
    filter.frequency.value = 2200
    this.env(gain, t, 0.006, peak, 0.6)
    mod.connect(modGain).connect(car.frequency)
    car.connect(filter).connect(gain).connect(this.master)
    car.start(t)
    car.stop(t + 0.7)
  }

  private pluck(frequency: number, t: number, peak: number) {
    if (!this.context || !this.master) return
    const car = this.context.createOscillator()
    const mod = this.context.createOscillator()
    const modGain = this.context.createGain()
    const gain = this.context.createGain()
    car.type = 'sine'
    mod.type = 'sine'
    car.frequency.value = frequency
    mod.frequency.value = frequency * 3.01
    modGain.gain.setValueAtTime(frequency * 1.4, t)
    modGain.gain.exponentialRampToValueAtTime(frequency * 0.2, t + 0.4)
    this.env(gain, t, 0.006, peak, 0.75)
    mod.connect(modGain).connect(car.frequency)
    car.connect(gain).connect(this.master)
    car.start(t)
    car.stop(t + 0.85)
  }

  private bassPush(frequency: number, t: number) {
    if (!this.context || !this.master) return
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency, t)
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.96, t + 0.18)
    this.env(gain, t, 0.008, 0.22, 0.34)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.4)
  }

  private kick(t: number) {
    if (!this.context || !this.master) return
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, t)
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.12)
    this.env(gain, t, 0.004, 0.72, 0.32)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.38)
  }

  private snare(t: number) {
    if (!this.context || !this.master) return
    this.noiseHit(t, 'bandpass', 1900, 0.16, 0.18, 5)
    this.tone(196, t, 'triangle', 0.1, 0.12)
  }

  private hat(t: number, open: boolean) {
    this.noiseHit(t, 'highpass', 7200, open ? 0.1 : 0.045, open ? 0.26 : 0.09, 1)
  }

  private shaker(t: number, peak: number) {
    this.noiseHit(t, 'highpass', 5200, peak, 0.14, 1)
  }

  private noiseHit(t: number, type: BiquadFilterType, frequency: number, peak: number, dur: number, q: number) {
    if (!this.context || !this.master) return
    const length = Math.floor(this.context.sampleRate * dur)
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    this.env(gain, t, 0.003, peak, dur)
    source.buffer = buffer
    source.connect(filter).connect(gain).connect(this.master)
    source.start(t)
  }

  private noiseBurst(t: number, dur: number, type: BiquadFilterType, frequency: number, peak: number) {
    if (!this.context || !this.master) return
    const length = Math.floor(this.context.sampleRate * dur)
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    filter.type = type
    filter.frequency.value = frequency
    this.env(gain, t, 0.25, peak, dur)
    source.buffer = buffer
    source.connect(filter).connect(gain).connect(this.master)
    source.start(t)
  }

  private shimmer(frequency: number, t: number) {
    if (!this.context || !this.master) return
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency
    this.env(gain, t, 0.15, 0.05, 2.2)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + 2.4)
  }

  // Failure in the failing source's own voice — you hear WHICH server broke.
  private dissonance(t: number, voice: number) {
    if (!this.context || !this.master) return
    const scale = SCALES[this.mode]
    const base = scale[(voice + Math.floor(this.eventCount / 3)) % scale.length]
    const cluster = [base * 1.06, base * 0.94, base * 1.13]
    cluster.forEach((frequency) => {
      const car = this.context!.createOscillator()
      const mod = this.context!.createOscillator()
      const modGain = this.context!.createGain()
      const gain = this.context!.createGain()
      car.type = 'sine'
      mod.type = 'sine'
      car.frequency.setValueAtTime(frequency, t)
      car.frequency.exponentialRampToValueAtTime(frequency * 0.92, t + 0.35)
      mod.frequency.value = frequency * (voice % 5 === 4 ? 2.05 : 2.7)
      modGain.gain.setValueAtTime(frequency * 0.9, t)
      modGain.gain.exponentialRampToValueAtTime(frequency * 0.15, t + 0.4)
      this.env(gain, t, 0.004, this.storm ? 0.15 : 0.11, 0.8)
      mod.connect(modGain).connect(car.frequency)
      car.connect(gain).connect(this.master!)
      car.start(t)
      car.stop(t + 0.85)
    })
    this.noiseHit(t, 'highpass', 3800, this.storm ? 0.1 : 0.07, 0.3, 1)
    if (this.storm) this.tone(58.27, t, 'sawtooth', 0.07, 0.5)
  }
}