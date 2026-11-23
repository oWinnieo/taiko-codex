const courseNames = ['入门', '普通', '进阶', '高手', '额外', '塔', '段位']
const courses = ['easy', 'normal', 'hard', 'oni', 'edit', 'tower', 'dan']
const ignoredCommands = new Set(['LYRIC', 'SECTION', 'SENOTECHANGE', 'LEVELHOLD', 'DIRECTION', 'SUDDEN', 'JPOSSCROLL'])
const advancedCommands = new Set(['BRANCHSTART', 'BRANCHEND', 'N', 'E', 'M', 'HBSCROLL', 'BMSCROLL', 'STOPSCROLL'])
const courseFields = new Set(['COURSE', 'LEVEL', 'BALLOON', 'STYLE', 'SCOREMODE', 'SCOREINIT', 'SCOREDIFF'])
const noteTypes = { 1: 'center', 2: 'rim', 3: 'center', 4: 'rim', 5: 'roll', 6: 'roll', 7: 'balloon', 9: 'balloon' }

export function decodeTja(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('shift_jis', { fatal: true }).decode(buffer)
  }
}

function checkedNumber(value, min, max, label) {
  const result = Number(value)
  if (value == null || String(value).trim() === '' || !Number.isFinite(result) || result < min || result > max) {
    throw new Error(`${label} 应在 ${min} 到 ${max} 之间`)
  }
  return result
}

function compileChart(section, defaults) {
  const { headers, body, player } = section
  if (player || /^(double|couple|2)$/i.test(headers.STYLE ?? '')) throw new Error('双人谱暂不支持')
  const course = headers.COURSE?.toLowerCase() ?? 'oni'
  const courseIndex = /^\d$/.test(course) ? Number(course) : courses.indexOf(course)
  if (courseIndex >= 5) throw new Error('塔与段位谱暂不支持')
  const level = checkedNumber(headers.LEVEL ?? 0, 0, 99, 'LEVEL')
  const balloons = (headers.BALLOON || '').split(',').filter(Boolean)
  const notes = []
  const bars = []
  const boosts = []
  const warnings = new Set()
  let bpm = checkedNumber(defaults.BPM, 1, 2000, 'BPM')
  let time = -checkedNumber(defaults.OFFSET ?? 0, -60, 60, 'OFFSET')
  let beats = 4
  let scroll = 1
  let showBars = true
  let boost = null
  let roll = null
  let balloonIndex = 0
  let measure = []

  function command(name, value, slot) {
    if (advancedCommands.has(name)) throw new Error(`暂不支持 #${name} 谱面`)
    switch (name) {
      case 'BPMCHANGE':
        bpm = checkedNumber(value, 1, 2000, name)
        break
      case 'MEASURE': {
        if (slot) throw new Error('#MEASURE 必须出现在小节起点')
        const parts = value.split('/')
        if (parts.length !== 2) throw new Error('#MEASURE 需要分子和分母')
        beats = 4 * checkedNumber(parts[0], 0.01, 64, name) / checkedNumber(parts[1], 0.01, 64, name)
        if (beats > 64) throw new Error('#MEASURE 拍数过大')
        break
      }
      case 'DELAY':
        time += checkedNumber(value, 0, 60, name)
        break
      case 'SCROLL':
        scroll = checkedNumber(value, 0.05, 16, name)
        break
      case 'GOGOSTART':
        if (boost == null) boost = time
        break
      case 'GOGOEND':
        if (boost != null) boosts.push({ start: boost, end: time })
        boost = null
        break
      case 'BARLINEON':
        showBars = true
        break
      case 'BARLINEOFF':
        showBars = false
        break
      default:
        if (!ignoredCommands.has(name)) warnings.add(`已忽略 #${name}`)
    }
  }

  function addNote(code) {
    if (code === '0') return
    if (code === '8') {
      if (!roll) throw new Error('连打结束符缺少起点')
      roll.end = time
      roll = null
      return
    }
    if (!noteTypes[code]) throw new Error(`暂不支持音符 ${code}`)
    if (roll) throw new Error('连打段内存在其他音符')
    const type = noteTypes[code]
    const note = { id: notes.length, time, type, large: '346'.includes(code), scroll: scroll * bpm / 120, boosted: boost != null }
    if (type === 'roll' || type === 'balloon') {
      roll = note
      if (type === 'balloon') note.target = checkedNumber(balloons[balloonIndex++] ?? 5, 1, 999, 'BALLOON')
    }
    notes.push(note)
  }

  function finishMeasure() {
    const slots = measure.filter(item => typeof item === 'string').length
    let slot = 0
    for (const item of measure) {
      if (typeof item !== 'string') {
        command(item.name, item.value, slot)
        continue
      }
      if (slot === 0 && showBars) bars.push({ time, scroll: scroll * bpm / 120 })
      addNote(item)
      time += (60 / bpm) * (beats / slots)
      slot++
    }
    if (!slots) {
      if (showBars) bars.push({ time, scroll: scroll * bpm / 120 })
      time += 60 / bpm * beats
    }
    if (time > 1800 || notes.length > 50000 || bars.length > 20000) throw new Error('谱面超过 30 分钟或包含过多音符')
    measure = []
  }

  for (const line of body) {
    const control = line.match(/^#([A-Z0-9_]+)\s*(.*)$/i)
    if (control) {
      measure.push({ name: control[1].toUpperCase(), value: control[2].trim() })
      continue
    }
    if (!/^[0-9A-Z,\s]+$/i.test(line)) throw new Error('谱面包含无法识别的数据')
    for (const token of line.replace(/\s/g, '')) {
      if (token === ',') finishMeasure()
      else measure.push(token)
    }
  }
  for (const item of measure) {
    if (typeof item === 'string') throw new Error('最后一个小节缺少逗号')
    command(item.name, item.value, 0)
  }
  if (roll) throw new Error('连打或气球缺少结束符 8')
  if (!notes.length) throw new Error('难度没有可玩的音符')
  if (boost != null) boosts.push({ start: boost, end: time })

  return { label: courseNames[courseIndex] ?? headers.COURSE ?? '自定义', level, notes, bars, boosts, end: time, warnings: [...warnings] }
}

export function parseTja(text) {
  const defaults = {}
  const sections = []
  let headers = {}
  let section = null
  for (const source of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const line = source.replace(/(^|\s|,)\/\/.*$/, '$1').trim()
    if (!line) continue
    const start = line.match(/^#START(?:\s+(.*))?$/i)
    if (start) {
      if (section) throw new Error('谱面在 #END 前重复开始')
      section = { headers, body: [], player: start[1] }
      continue
    }
    if (/^#END$/i.test(line)) {
      if (!section) throw new Error('#END 缺少 #START')
      sections.push(section)
      section = null
      headers = { COURSE: headers.COURSE, STYLE: headers.STYLE }
      continue
    }
    if (section) {
      section.body.push(line)
      continue
    }
    const field = line.match(/^([A-Z][A-Z0-9_-]*)\s*:\s*(.*)$/i)
    if (!field) {
      const command = line.match(/^#([A-Z0-9_]+)/i)?.[1]?.toUpperCase()
      if (advancedCommands.has(command)) defaults.ADVANCED = command
      continue
    }
    const key = field[1].toUpperCase()
    if (courseFields.has(key)) headers[key] = field[2].trim()
    else defaults[key] = field[2].trim()
  }
  if (section) throw new Error('谱面缺少 #END')
  if (!sections.length) throw new Error('找不到可读取的 #START 谱面')
  if (defaults.ADVANCED) throw new Error(`暂不支持 #${defaults.ADVANCED} 模式`)
  const charts = []
  const warnings = []
  for (const candidate of sections) {
    try {
      const chart = compileChart(candidate, defaults)
      chart.id = `chart-${charts.length + 1}`
      charts.push(chart)
      warnings.push(...chart.warnings)
    } catch (error) {
      warnings.push(`${candidate.headers.COURSE ?? '谱面'}：${error.message}`)
    }
  }
  if (!charts.length) throw new Error(warnings.join('；'))
  return {
    title: defaults.TITLE || '未命名曲目',
    subtitle: (defaults.SUBTITLE || '').replace(/^(--|\+\+)/, ''),
    wave: (defaults.WAVE || '').replace(/^"(.*)"$/, '$1'),
    bpm: Number(defaults.BPM),
    charts,
    warnings: [...new Set(warnings)]
  }
}
