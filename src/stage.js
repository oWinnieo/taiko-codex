const colors = { center: '#ff835d', rim: '#67dce0', roll: '#dcfc63', balloon: '#c7a5f4' }
const labels = { perfect: '精准', good: '命中', miss: '漏击', double: '双击', roll: '连打', pop: '气球破裂' }
const preview = ['center', 'rim', 'center', 'center', 'rim', 'roll', 'center']

function circle(context, x, y, radius, fill, stroke, lineWidth = 1) {
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  if (fill) {
    context.fillStyle = fill
    context.fill()
  }
  if (stroke) {
    context.strokeStyle = stroke
    context.lineWidth = lineWidth
    context.stroke()
  }
}

function findFrom(items, time, field = 'time') {
  let start = 0
  let end = items.length
  while (start < end) {
    const middle = (start + end) >>> 1
    if (items[middle][field] < time) start = middle + 1
    else end = middle
  }
  return start
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.input = null
    new ResizeObserver(() => {
      this.resize()
      this.paint()
    }).observe(canvas)
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const ratio = Math.min(devicePixelRatio || 1, 2.5)
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio))
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio))
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.width = this.canvas.width / ratio
    this.height = this.canvas.height / ratio
  }

  setPreview() {
    this.frame = null
    this.paint()
  }

  draw(engine, chart, time, judgeTime, countdown) {
    this.frame = { engine, chart, time, judgeTime, countdown }
    this.paint()
  }

  tap(type) {
    this.input = { type, at: performance.now() }
  }

  paint() {
    if (!this.width) return
    const ctx = this.ctx
    const { width, height } = this
    const y = Math.round(height * 0.53)
    const x = Math.min(111, Math.max(53, width * 0.13))
    const compact = width < 530
    const radius = compact ? 12 : 17
    const laneHeight = compact ? 50 : 63
    const frame = this.frame
    const flash = this.input && Math.max(0, 1 - (performance.now() - this.input.at) / 170)

    ctx.fillStyle = '#121712'
    ctx.fillRect(0, 0, width, height)
    for (let left = 0; left < width; left += 25) {
      for (let top = 13; top < height; top += 23) {
        ctx.fillStyle = '#2d3629'
        ctx.fillRect(left + 11, top, 1, 1)
      }
    }
    const boosted = frame?.chart.boosts.some(segment => frame.time >= segment.start && frame.time < segment.end)
    ctx.fillStyle = boosted ? '#303822' : '#1b241a'
    ctx.fillRect(0, y - laneHeight / 2, width, laneHeight)
    ctx.fillStyle = boosted ? '#4a5632' : '#303e2e'
    ctx.fillRect(0, y - laneHeight / 2, width, 1)
    ctx.fillRect(0, y + laneHeight / 2, width, 1)
    ctx.strokeStyle = '#394736'
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(x, y + 0.5)
    ctx.lineTo(width, y + 0.5)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#667b4d'
    ctx.fillRect(x - 0.5, y - laneHeight / 2 - 9, 1, laneHeight + 18)

    if (frame) {
      const speed = Math.max(110, (width - x) / 1.86)
      const min = frame.time - 0.57
      const max = frame.time + (width - x + 45) / (speed * 0.58)
      const place = (time, scroll) => x + (time - frame.time) * speed * Math.max(0.58, Math.min(4, scroll))
      ctx.save()
      ctx.beginPath()
      ctx.rect(x - 30, 0, width, height)
      ctx.clip()
      for (let index = findFrom(frame.chart.bars, min); index < frame.chart.bars.length; index++) {
        const bar = frame.chart.bars[index]
        if (bar.time > max) break
        const markerX = place(bar.time, bar.scroll)
        ctx.fillStyle = '#43513a'
        ctx.fillRect(markerX, y - laneHeight / 2 + 5, 1, laneHeight - 10)
      }

      for (let index = findFrom(frame.engine.spans, min, 'end'); index < frame.engine.spans.length; index++) {
        const span = frame.engine.spans[index]
        if (span.time > max) break
        const marker = frame.engine.markers.get(span.id)
        if (span.target && marker?.count >= span.target) continue
        const left = Math.max(x, place(span.time, span.scroll))
        const right = place(span.end, span.scroll)
        if (right >= x - 1 && left <= width + 40) {
          const count = span.target ? span.target - (marker?.count ?? 0) : ''
          this.note(left, y, span.type, radius, span.large, right, count)
        }
      }
      for (let index = findFrom(frame.engine.hits, min); index < frame.engine.hits.length; index++) {
        const note = frame.engine.hits[index]
        if (note.time > max) break
        if (!frame.engine.markers.has(note.id)) {
          const noteX = place(note.time, note.scroll)
          if (noteX >= x - 43 && noteX <= width + 43) this.note(noteX, y, note.type, radius, note.large)
        }
      }
      ctx.restore()
    } else {
      const step = (width - x) / 8.4
      for (let index = 0; index < preview.length; index++) {
        const type = preview[index]
        const noteX = x + step * (1.26 + index)
        this.note(noteX, y, type, compact ? 9 : radius, index === 3, noteX + step * 0.64)
      }
    }

    circle(ctx, x, y, radius + 8, flash ? colors[this.input.type] + '60' : '#1e2b16', flash ? colors[this.input.type] : '#a9cc60', 2.5)
    circle(ctx, x, y, radius + 2, flash ? colors[this.input.type] : '#131a11', '#798f54', 1.5)
    circle(ctx, x, y, 3, flash ? '#20271b' : '#a5bb75')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#aabc89'
    ctx.font = '650 11px system-ui, sans-serif'
    ctx.fillText('击打线', x, y + laneHeight / 2 + 22)
    if (frame?.countdown > 0) {
      ctx.fillStyle = '#e4f7a5'
      ctx.font = '850 34px ui-monospace, monospace'
      ctx.fillText(frame.countdown, width / 2, y - laneHeight / 2 - 22)
    } else if (frame?.engine.feedback && frame.judgeTime - frame.engine.feedback.time < 0.44) {
      const { judgment } = frame.engine.feedback
      ctx.fillStyle = judgment === 'miss' ? '#ff9a8c' : '#f0fc8c'
      ctx.font = '800 16px system-ui, sans-serif'
      ctx.fillText(labels[judgment], x, y - laneHeight / 2 - 20)
    }
  }

  note(x, y, type, baseRadius, large, right, count) {
    const ctx = this.ctx
    const radius = large ? baseRadius * 1.27 : baseRadius
    const color = colors[type]
    if (type === 'roll' || type === 'balloon') {
      ctx.fillStyle = color + '40'
      ctx.strokeStyle = color
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.roundRect(x, y - radius * 0.53, Math.max(0, right - x), radius * 1.06, radius * 0.48)
      ctx.fill()
      ctx.stroke()
    }
    circle(ctx, x, y, radius + 2, '#101611', color + '77', 1)
    circle(ctx, x, y, radius, color)
    circle(ctx, x, y, radius - 4, null, '#17221965', 1)
    if (count) {
      ctx.fillStyle = '#251d32'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '850 11px ui-monospace, monospace'
      ctx.fillText(count, x, y + 0.5)
    } else {
      circle(ctx, x, y, large ? 4 : 2.5, '#20251eaa')
    }
  }
}
