export type NetworkSignal = {
  latency: number
  success: boolean
  intensity: number
}

export type SoundMode = 'drift' | 'pulse' | 'surge'

const SCALES: Record<SoundMode, number[]> = {
  drift: [220, 261.63, 293.66, 329.63, 392, 440, 523.25],
  pulse: [220, 246.94, 293.66, 329.63, 392, 440, 493.88],
  surge: [220, 261.63, 311.13, 349.23, 415.3, 466.16, 523.25],
}

const BPM: Record<SoundMode, number> = { drift: 78, pulse: 112, surge: 138 }

const BASS_ROOTS = [110, 87.31, 98, 130.81]

const PAD_CHORDS = [
  [110, 164.81, 261.63],
  [87.31, 130.81, 207.65],
  [98, 146.83, 220],
  [110, 164.81, 246.94],
]

type DrumPattern = { kick: number[]; snare: number[]; hat: number[]; openHat: number[] }

const PATTERNS: Record<SoundMode, DrumPattern> = {
  drift: { kick: [], snare: [], hat: [2, 6, 10, 14], openHat: [] },
  pulse: { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], openHat: [14] },
  surge: { kick: [0, 3, 6, 8, 11, 14], snare: [5, 13], hat: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15], openHat: [15] },
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

  play(signal: NetworkSignal, voice: number) {
    if (!this.context || !this.master || this.muted) return
    const now = this.context.currentTime
    const scale = SCALES[this.mode]
    this.eventCount += 1

    if (signal.success) {
      const note = scale[(voice + Math.floor(this.eventCount / 7)) % scale.length]
      const pitchFactor = Math.max(0.75, Math.min(1.45, 1.28 - signal.latency / 450))
      this.pluck(now, note * pitchFactor, Math.min(0.5, 0.24 + signal.intensity * 0.3))
      if (this.eventCount % 4 === 0) this.bassPush(now, BASS_ROOTS[this.eventCount % BASS_ROOTS.length])
      if (this.eventCount > 14 && this.eventCount % 7 === 0) this.shimmer(now + 0.1, note * 2)
    } else {
      this.dissonance(now)
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

  private bpm() {
    return BPM[this.mode]
  }

  private scheduleSteps() {
    if (!this.context || !this.running) return
    const stepDur = 60 / this.bpm() / 4
    let guard = 0
    while (this.nextStepTime < this.context.currentTime + 0.28 && guard < 12) {
      this.scheduleStep(this.step % 16, this.nextStepTime, Math.floor(this.step / 16))
      this.nextStepTime += stepDur
      this.step += 1
      guard += 1
    }
  }

  private scheduleStep(step: number, t: number, bar: number) {
    const pattern = PATTERNS[this.mode]
    if (this.mode === 'drift') {
      if (pattern.hat.includes(step)) this.shaker(t, 0.05)
      if (step === 0 && bar % 2 === 0) this.pluck(t, SCALES.drift[(bar * 3 + 2) % SCALES.drift.length], 0.2)
    } else {
      if (pattern.kick.includes(step)) this.kick(t)
      if (pattern.snare.includes(step)) this.snare(t)
      if (pattern.hat.includes(step)) this.hat(t, pattern.openHat.includes(step))
    }
    if (this.mode === 'pulse') {
      if (step === 0 || step === 8) this.bassPush(t, BASS_ROOTS[bar % BASS_ROOTS.length])
      if (step === 0 && bar % 2 === 0) this.pluck(t, SCALES.pulse[(bar * 2 + 1) % SCALES.pulse.length] * 2, 0.18)
    }
    if (this.mode === 'surge') {
      if (step === 0) this.bassPush(t, BASS_ROOTS[bar % BASS_ROOTS.length])
      if (step === 8) this.bassPush(t, BASS_ROOTS[(bar + 2) % BASS_ROOTS.length] * 1.5)
    }
    if (this.mode === 'drift' && bar % 2 === 0 && step === 4) {
      const chord = PAD_CHORDS[(bar / 2) % PAD_CHORDS.length]
      chord.forEach((frequency, index) => this.padTone(t, frequency, 6.5, 0.045, 2 + index * 0.9))
    }
  }

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

  private note(frequency: number, t: number, type: OscillatorType, dur: number, peak: number, detune = 0) {
    if (!this.context || !this.master) return null
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = type
    osc.frequency.value = frequency
    osc.detune.value = detune
    this.env(gain, t, 0.015, peak, dur)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.05)
    return gain
  }

  private tone(frequency: number, t: number, type: OscillatorType, peak: number, dur: number) {
    this.note(frequency, t, type, dur, peak)
  }

  private padTone(frequency: number, t: number, dur: number, peak = 0.06, attack = 1.5) {
    if (!this.context || !this.master) return
    const oscA = this.context.createOscillator()
    const oscB = this.context.createOscillator()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    oscA.type = 'sawtooth'
    oscB.type = 'sawtooth'
    oscA.frequency.value = frequency
    oscB.frequency.value = frequency * 1.005
    oscA.detune.value = -4
    oscB.detune.value = 4
    filter.type = 'lowpass'
    filter.frequency.value = 750
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
    this.note(196, t, 'triangle', 0.12, 0.1)
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

  private dissonance(t: number) {
    if (!this.context || !this.master) return
    const cluster = [146.83, 155.56, 164.81]
    cluster.forEach((frequency) => {
      const car = this.context!.createOscillator()
      const mod = this.context!.createOscillator()
      const modGain = this.context!.createGain()
      const gain = this.context!.createGain()
      car.type = 'sine'
      mod.type = 'sine'
      car.frequency.setValueAtTime(frequency * 1.06, t)
      car.frequency.exponentialRampToValueAtTime(frequency * 0.92, t + 0.35)
      mod.frequency.value = frequency * 2.7
      modGain.gain.setValueAtTime(frequency * 0.9, t)
      modGain.gain.exponentialRampToValueAtTime(frequency * 0.15, t + 0.4)
      this.env(gain, t, 0.004, this.storm ? 0.15 : 0.11, 0.8)
      mod.connect(modGain).connect(car.frequency)
      car.connect(gain).connect(this.master!)
      car.start(t)
      car.stop(t + 0.85)
    })
    this.noiseHit(t, 'highpass', 3800, this.storm ? 0.1 : 0.07, 0.3, 1)
    if (this.storm) this.note(58.27, t, 'sawtooth', 0.5, 0.07)
  }
}