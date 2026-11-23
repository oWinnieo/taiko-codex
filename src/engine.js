export const windows = { perfect: 0.048, good: 0.095, late: 0.13 }
const doubleWindow = 0.045

export class GameEngine {
  constructor(chart) {
    this.hits = chart.notes.filter(note => note.end === undefined)
    this.spans = chart.notes.filter(note => note.end !== undefined)
    this.markers = new Map()
    this.cursor = 0
    this.spanCursor = 0
    this.lastLarge = null
    this.score = 0
    this.combo = 0
    this.bestCombo = 0
    this.perfect = 0
    this.good = 0
    this.miss = 0
    this.rollHits = 0
    this.balloons = 0
    this.largeHits = 0
    this.feedback = null
  }

  advance(time) {
    while (this.cursor < this.hits.length) {
      const note = this.hits[this.cursor]
      if (!this.markers.has(note.id)) {
        if (time <= note.time + windows.late) break
        this.missNote(note, time)
      }
      this.cursor++
    }
    while (this.spanCursor < this.spans.length && this.spans[this.spanCursor].end < time) this.spanCursor++
  }

  missNote(note, time) {
    this.markers.set(note.id, { judgment: 'miss' })
    this.combo = 0
    this.miss++
    this.feedback = { judgment: 'miss', time }
  }

  strike(type, time, hand) {
    this.advance(time)
    const large = this.lastLarge
    if (large && large.type === type && large.hand !== hand && time >= large.time && time - large.time <= doubleWindow) {
      this.lastLarge = null
      this.largeHits++
      this.score += large.bonus
      this.feedback = { judgment: 'double', time }
      return this.feedback
    }

    let closest
    for (let index = this.cursor; index < this.hits.length; index++) {
      const note = this.hits[index]
      if (note.time - time > windows.late) break
      if (this.markers.has(note.id) || note.type !== type) continue
      const distance = Math.abs(note.time - time)
      if (distance > windows.late || (closest && distance >= closest.distance)) continue
      closest = { note, distance }
    }

    if (closest) {
      const { note, distance } = closest
      if (distance > windows.good) {
        this.missNote(note, time)
        return this.feedback
      }
      const judgment = distance <= windows.perfect ? 'perfect' : 'good'
      this[judgment]++
      this.combo++
      this.bestCombo = Math.max(this.bestCombo, this.combo)
      const points = Math.round((judgment === 'perfect' ? 1000 : 500) * (note.boosted ? 1.2 : 1))
      this.score += points
      this.markers.set(note.id, { judgment })
      if (note.large) this.lastLarge = { time, hand, type, bonus: Math.round(points * 0.5) }
      this.feedback = { judgment, time }
      return this.feedback
    }

    const span = this.spans[this.spanCursor]
    if (!span || time < span.time || time >= span.end || (span.type === 'balloon' && type !== 'center')) return null
    const marker = this.markers.get(span.id) ?? { count: 0 }
    if (span.target && marker.count >= span.target) return null
    marker.count++
    this.markers.set(span.id, marker)
    this.rollHits++
    this.score += span.boosted ? 120 : 100
    const popped = marker.count === span.target
    if (popped) {
      this.balloons++
      this.score += 500
    }
    this.feedback = { judgment: popped ? 'pop' : 'roll', time }
    return this.feedback
  }

  get accuracy() {
    return this.hits.length ? (this.perfect + this.good * 0.5) / this.hits.length : 0
  }

  result() {
    const accuracy = this.hits.length ? this.accuracy : (this.rollHits > 0 ? 1 : 0)
    return {
      score: this.score, accuracy, bestCombo: this.bestCombo, total: this.hits.length,
      perfect: this.perfect, good: this.good, miss: this.miss, rollHits: this.rollHits,
      largeHits: this.largeHits, balloons: this.balloons,
      grade: accuracy >= 0.98 ? 'S' : accuracy >= 0.85 ? 'A' : accuracy >= 0.7 ? 'B' : accuracy >= 0.5 ? 'C' : 'D'
    }
  }
}

export function calibrationOffset(samples) {
  if (samples.length < 4) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  return Math.max(-250, Math.min(250, Math.round(median * 1000)))
}
