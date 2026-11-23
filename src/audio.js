function drumBuffer(context, center) {
  const rate = context.sampleRate
  const buffer = context.createBuffer(1, Math.floor(rate * (center ? 0.21 : 0.095)), rate)
  const wave = buffer.getChannelData(0)
  let seed = 4171
  let phase = 0
  for (let i = 0; i < wave.length; i++) {
    const time = i / rate
    seed = (1664525 * seed + 1013904223) >>> 0
    const noise = seed / 2147483648 - 1
    phase += 2 * Math.PI * (62 + 148 * Math.exp(-time * 36)) / rate
    wave[i] = center
      ? Math.sin(phase) * Math.exp(-time * 24) * 0.78 + noise * Math.exp(-time * 95) * 0.21
      : (Math.sin(time * 2 * Math.PI * 1320) * 0.35 + noise * 0.58) * Math.exp(-time * 58)
  }
  return buffer
}

export class AudioPlayer {
  constructor() {
    this.context = null
    this.source = null
    this.clicks = []
  }

  async enable() {
    if (!this.context) {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext
      if (!AudioContext) throw new Error('此浏览器不支持 Web Audio')
      const context = new AudioContext()
      this.context = context
      this.music = context.createGain()
      this.effects = context.createGain()
      this.music.connect(context.destination)
      this.effects.connect(context.destination)
    }
    await this.context.resume()
  }

  setVolumes(music, effects) {
    this.music.gain.value = music / 100
    this.effects.gain.value = effects / 100
  }

  async decode(input) {
    if (typeof input === 'string' || input instanceof URL) {
      const response = await fetch(input)
      if (!response.ok) throw new Error(`无法加载音频（HTTP ${response.status}）`)
      input = await response.blob()
    }
    try {
      return await this.context.decodeAudioData(await input.arrayBuffer())
    } catch {
      throw new Error('浏览器无法解码此音频，请尝试 MP3 或 WAV')
    }
  }

  async inspect(input) {
    const context = new OfflineAudioContext(1, 1, 44100)
    try {
      return (await context.decodeAudioData(await input.arrayBuffer())).duration
    } catch {
      throw new Error('浏览器无法解码此音频，请尝试 MP3 或 WAV')
    }
  }

  start(buffer, position) {
    this.stop()
    const now = this.context.currentTime + 0.065
    this.anchor = now - position
    if (position >= buffer.duration) return
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.music)
    source.start(now + Math.max(0, -position), Math.max(0, position))
    source.onended = () => {
      source.disconnect()
      if (this.source === source) this.source = null
    }
    this.source = source
  }

  stop() {
    this.source?.stop()
    this.source = null
  }

  outputTime(eventTime = performance.now()) {
    const stamp = this.context.getOutputTimestamp?.()
    if (stamp?.performanceTime > 0 && this.context.state === 'running') {
      return stamp.contextTime + (eventTime - stamp.performanceTime) / 1000
    }
    const latency = (this.context.baseLatency || 0) + (this.context.outputLatency || 0)
    return this.context.currentTime - latency + (eventTime - performance.now()) / 1000
  }

  position(eventTime) {
    return this.outputTime(eventTime) - this.anchor
  }

  hit(type) {
    this.drums ??= { center: drumBuffer(this.context, true), rim: drumBuffer(this.context, false) }
    const source = this.context.createBufferSource()
    source.buffer = this.drums[type]
    source.connect(this.effects)
    source.start()
    source.onended = () => source.disconnect()
  }

  metronome() {
    this.stopMetronome()
    const first = this.context.currentTime + 0.75
    const beats = Array.from({ length: 12 }, (_, index) => first + index * 0.6)
    for (const [index, beat] of beats.entries()) {
      const tone = this.context.createOscillator()
      const envelope = this.context.createGain()
      tone.frequency.value = index < 2 ? 600 : 940
      envelope.gain.setValueAtTime(0.0001, beat)
      envelope.gain.exponentialRampToValueAtTime(0.24, beat + 0.006)
      envelope.gain.exponentialRampToValueAtTime(0.0001, beat + 0.13)
      tone.connect(envelope)
      envelope.connect(this.context.destination)
      tone.start(beat)
      tone.stop(beat + 0.14)
      this.clicks.push(tone)
      tone.onended = () => {
        tone.disconnect()
        envelope.disconnect()
        this.clicks = this.clicks.filter(click => click !== tone)
      }
    }
    return beats
  }

  stopMetronome() {
    for (const tone of this.clicks) tone.stop()
    this.clicks = []
  }
}
