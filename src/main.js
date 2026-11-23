import { AudioPlayer } from './audio.js'
import { calibrationOffset, GameEngine } from './engine.js'
import { builtinSongs, deleteSong, importSongs, savedSongs } from './library.js'
import { Stage } from './stage.js'

const get = id => document.getElementById(id)
const audio = new AudioPlayer()
const stage = new Stage(get('lane'))
const pads = [...document.querySelectorAll('[data-hit]')]
const keys = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 }
const settings = { music: 72, effects: 68, delay: 0 }
const songList = get('song-list')
const startButton = get('start')
const notice = get('notice')
const settingsDialog = get('settings')
const pauseDialog = get('pause-dialog')
const resultDialog = get('results')
const importDialog = get('import-dialog')
let songs = []
let selection = null
let mode = 'ready'
let locked = true
let round = null
let frame
let cachedAudio
let calibration

function text(id, value) {
  const node = get(id)
  const display = String(value)
  if (node.textContent !== display) node.textContent = display
}

function element(tag, name, value) {
  const node = document.createElement(tag)
  if (name) node.className = name
  if (value !== undefined) node.textContent = value
  return node
}

function setNotice(value) {
  notice.textContent = value
  notice.hidden = !value
}

function showStageStatus(value) {
  const node = get('stage-message')
  node.textContent = value
  node.hidden = !value
  node.setAttribute('aria-hidden', value ? 'false' : 'true')
  if (value) node.setAttribute('role', 'status')
}

function setMode(next) {
  mode = next
  document.body.dataset.mode = next
  get('ready-info').hidden = next !== 'ready'
  get('play-info').hidden = next === 'ready'
}

function songLength(seconds) {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function syncSelection() {
  const song = selection?.song
  const chart = selection?.chart
  startButton.disabled = !song || locked
  text('now-title', song?.title ?? '没有可用曲目')
  text('now-bpm', song ? `${song.bpm} BPM` : '— BPM')
  text('now-chart', chart ? `${chart.label} · ${chart.level}` : '—')
  for (const card of songList.children) {
    card.classList.toggle('selected', card.dataset.song === song?.id)
    const pick = card.querySelector('.song-pick')
    pick.setAttribute('aria-pressed', String(card.dataset.song === song?.id))
    for (const button of card.querySelectorAll('[data-chart]')) {
      button.setAttribute('aria-pressed', String(card.dataset.song === song?.id && button.dataset.chart === chart?.id))
    }
  }
}

function select(song, chart = song?.charts[0]) {
  selection = song ? { song, chart } : null
  syncSelection()
}

function renderSongs() {
  songList.replaceChildren()
  text('song-count', `${songs.length} 首`)
  for (const song of songs) {
    const card = element('article', 'song-card')
    card.dataset.song = song.id
    const art = element('div', `song-art ${song.theme}`)
    art.setAttribute('aria-hidden', 'true')
    const pick = element('button', 'song-pick')
    pick.type = 'button'
    pick.append(element('span', 'song-title', song.title), element('span', 'song-meta', `${song.tag} · ${song.bpm} BPM · ${songLength(song.duration)}`))
    if (song.subtitle) pick.title = song.subtitle
    pick.addEventListener('click', () => {
      if (!locked && selection?.song.id !== song.id) select(song)
    })
    const end = element('div', 'song-card-end')
    const options = element('div', 'chart-select')
    options.setAttribute('role', 'group')
    options.setAttribute('aria-label', `${song.title}的难度`)
    for (const chart of song.charts) {
      const button = element('button', '', `${chart.label} ${chart.level}`)
      button.type = 'button'
      button.dataset.chart = chart.id
      button.addEventListener('click', () => { if (!locked) select(song, chart) })
      options.append(button)
    }
    end.append(options)
    if (song.local) {
      const remove = element('button', 'remove-song', '×')
      remove.type = 'button'
      remove.setAttribute('aria-label', `移除${song.title}`)
      remove.addEventListener('click', async () => {
        if (locked || remove.disabled) return
        remove.disabled = true
        try {
          await deleteSong(song.id)
          songs = songs.filter(item => item.id !== song.id)
          if (cachedAudio?.id === song.id) cachedAudio = null
          if (selection?.song.id === song.id) select(songs[0])
          renderSongs()
          setNotice(`已从此浏览器移除「${song.title}」。`)
          get('import-open').focus()
        } catch {
          remove.disabled = false
          setNotice('无法移除此曲目，请重试。')
        }
      })
      end.append(remove)
    }
    card.append(art, pick, end)
    songList.append(card)
  }
  syncSelection()
}

async function loadSongs() {
  const [builtins, local] = await Promise.allSettled([builtinSongs(), savedSongs()])
  songs = [ ...(builtins.value ?? []), ...(local.value ?? []) ]
  locked = false
  get('import-open').disabled = false
  select(songs[0])
  renderSongs()
  const issues = []
  if (builtins.status === 'rejected') issues.push(builtins.reason.message)
  if (local.status === 'rejected') issues.push('浏览器本地曲库暂不可用')
  setNotice(issues.join('。'))
}

async function receiveFiles(files) {
  if (locked || mode !== 'ready' || !files.length) return
  locked = true
  syncSelection()
  get('import-open').disabled = true
  setNotice('正在检查谱面和音频…')
  try {
    const imported = await importSongs(files, input => audio.inspect(input))
    for (const song of imported.songs) {
      const index = songs.findIndex(item => item.id === song.id)
      if (index < 0) songs.push(song)
      else songs[index] = song
    }
    if (imported.songs.length) select(imported.songs[0])
    renderSongs()
    const summary = imported.songs.length ? `已导入 ${new Set(imported.songs.map(song => song.id)).size} 首曲目。` : ''
    setNotice([summary, ...imported.notices].filter(Boolean).join(' '))
  } catch (error) {
    setNotice(error.message)
  } finally {
    locked = false
    get('import-open').disabled = false
    syncSelection()
  }
}

function updateHud(position) {
  const { engine, end } = round
  text('score', engine.score.toLocaleString('zh-CN'))
  text('combo', engine.combo)
  get('progress').style.transform = `scaleX(${Math.max(0, Math.min(1, position / end))})`
}

function runFrame() {
  if (mode !== 'playing') return
  const position = audio.position()
  const { engine, chart, startAt, end } = round
  const remaining = startAt - position
  // Use the input calibration for expiry as well as strikes so late hardware inputs retain their window.
  const judgeTime = position - settings.delay / 1000
  engine.advance(judgeTime - 0.035)
  stage.draw(engine, chart, position, judgeTime, remaining > 0.18 ? Math.min(3, Math.ceil(remaining)) : 0)
  updateHud(position)
  if (position >= end) finishRound()
  else frame = requestAnimationFrame(runFrame)
}

async function startRound() {
  if (!selection || locked || mode === 'playing') return
  locked = true
  const { song, chart } = selection
  pauseDialog.close()
  resultDialog.close()
  setMode('ready')
  syncSelection()
  startButton.lastElementChild.textContent = '正在载入…'
  showStageStatus('')
  try {
    await audio.enable()
    audio.setVolumes(settings.music, settings.effects)
    if (cachedAudio?.id !== song.id || cachedAudio.input !== song.audio) {
      cachedAudio = { id: song.id, input: song.audio, buffer: await audio.decode(song.audio) }
    }
    const buffer = cachedAudio.buffer
    const startAt = Math.min(0, chart.notes[0].time)
    const end = Math.max(buffer.duration, chart.end, chart.notes.at(-1).end ?? chart.notes.at(-1).time) + 0.7
    round = { song, chart, buffer, engine: new GameEngine(chart), startAt, end, position: startAt - 2.7 }
    playFromPosition()
  } catch (error) {
    goHome(false)
    showStageStatus(error.message)
  } finally {
    locked = false
    syncSelection()
    startButton.lastElementChild.textContent = '开始演奏'
  }
}

function playFromPosition() {
  setMode('playing')
  get('pause').focus({ preventScroll: true })
  window.scrollTo(0, 0)
  audio.start(round.buffer, round.position)
  if (document.hidden) {
    pauseRound()
    return
  }
  frame = requestAnimationFrame(runFrame)
}

function pauseRound() {
  if (mode !== 'playing') return
  cancelAnimationFrame(frame)
  round.position = Math.max(round.position, audio.position())
  audio.stop()
  setMode('paused')
  pauseDialog.showModal()
}

async function resumeRound() {
  if (mode !== 'paused' || locked) return
  locked = true
  try {
    await audio.enable()
    if (mode !== 'paused') return
    pauseDialog.close()
    playFromPosition()
  } catch (error) {
    goHome(false)
    showStageStatus(error.message)
  } finally {
    locked = false
    syncSelection()
  }
}

function goHome(focus = true) {
  cancelAnimationFrame(frame)
  audio.stop()
  pauseDialog.close()
  resultDialog.close()
  round = null
  setMode('ready')
  get('progress').style.transform = 'scaleX(0)'
  stage.setPreview()
  if (focus) startButton.focus({ preventScroll: true })
}

function finishRound() {
  audio.stop()
  round.engine.advance(round.end + 0.2)
  updateHud(round.end)
  const stats = round.engine.result()
  const { song, chart } = round
  const metrics = [
    ['分数', stats.score.toLocaleString('zh-CN')], ['准确率', `${(stats.accuracy * 100).toFixed(1)}%`], ['最高连击', stats.bestCombo],
    ['精准', stats.perfect], ['命中', stats.good], ['漏击', stats.miss],
    ['连打次数', stats.rollHits], ['大音符双击', stats.largeHits], ['气球破裂', stats.balloons]
  ]
  text('grade', stats.grade)
  text('result-song', `${song.title} · ${chart.label} ${chart.level}`)
  get('summary').replaceChildren(...metrics.map(([label, value]) => {
    const node = element('div', 'stat')
    node.append(element('span', '', label), element('strong', '', value))
    return node
  }))
  setMode('results')
  resultDialog.showModal()
}

function strike(pad, event) {
  if (!['ready', 'playing'].includes(mode)) return
  const { hit, hand } = pad.dataset
  stage.tap(hit)
  pad.classList.add('active')
  clearTimeout(pad.flash)
  pad.flash = setTimeout(() => pad.classList.remove('active'), 110)
  if (mode === 'ready') {
    stage.paint()
    setTimeout(() => stage.paint(), 175)
    if (!locked) audio.enable().then(() => {
      audio.setVolumes(settings.music, settings.effects)
      if (mode === 'ready') audio.hit(hit)
    }).catch(() => {})
    return
  }
  const stamp = event.timeStamp > 0 && Math.abs(performance.now() - event.timeStamp) < 1000
    ? event.timeStamp : performance.now()
  const position = audio.position(stamp) - settings.delay / 1000
  if (position < round.startAt - 0.16) return
  audio.hit(hit)
  round.engine.strike(hit, position, hand)
}

function updateSettings() {
  get('music-volume').value = settings.music
  get('effects-volume').value = settings.effects
  get('delay').value = settings.delay
  text('music-value', `${settings.music}%`)
  text('effects-value', `${settings.effects}%`)
  text('delay-value', `${settings.delay > 0 ? '+' : ''}${settings.delay} ms`)
  if (audio.context) audio.setVolumes(settings.music, settings.effects)
  try {
    localStorage.setItem('taiko-codex-settings', JSON.stringify(settings))
  } catch {
    // Settings remain active for the current page when browser storage is restricted.
  }
}

function stopCalibration(reset = false) {
  if (calibration) clearTimeout(calibration.timer)
  calibration = null
  audio.stopMetronome()
  get('calibration-tap').hidden = true
  get('calibrate').disabled = false
  if (reset) {
    get('calibration-apply').hidden = true
    text('calibration-status', '听过两声低音后，随高音拍点按 F 或点「跟拍」。')
  }
}

async function beginCalibration() {
  stopCalibration(true)
  const active = { samples: new Map() }
  calibration = active
  get('calibrate').disabled = true
  try {
    await audio.enable()
    if (!settingsDialog.open || calibration !== active) return
    updateSettings()
    active.beats = audio.metronome().slice(2)
    active.timer = setTimeout(() => {
      const offset = calibrationOffset([...active.samples.values()])
      stopCalibration()
      if (offset == null) {
        text('calibration-status', '有效击打少于四次，请再试一次。')
        return
      }
      get('calibration-apply').dataset.offset = offset
      get('calibration-apply').hidden = false
      text('calibration-status', `建议偏移 ${offset > 0 ? '+' : ''}${offset} ms，采集到 ${active.samples.size} 次击打。`)
    }, 8000)
    get('calibration-tap').hidden = false
    text('calibration-status', '听到高音拍点时跟拍。已记录 0 次。')
  } catch (error) {
    if (calibration !== active) return
    stopCalibration()
    text('calibration-status', error.message)
  }
}

function tapCalibration(event) {
  if (!calibration?.beats) return
  const position = audio.outputTime(event.timeStamp)
  const index = calibration.beats.findIndex(beat => Math.abs(position - beat) <= 0.25)
  if (index < 0) return
  const error = position - calibration.beats[index]
  const previous = calibration.samples.get(index)
  if (previous === undefined || Math.abs(error) < Math.abs(previous)) calibration.samples.set(index, error)
  text('calibration-status', `已记录 ${calibration.samples.size} / 10 次击打。`)
}

try {
  const data = JSON.parse(localStorage.getItem('taiko-codex-settings'))
  for (const [field, min, max] of [['music', 0, 100], ['effects', 0, 100], ['delay', -250, 250]]) {
    if (Number.isFinite(data?.[field])) settings[field] = Math.round(Math.max(min, Math.min(max, data[field])))
  }
} catch {
  // Use defaults when browser storage is unavailable or contains invalid data.
}
updateSettings()
for (const [id, key] of [['music-volume', 'music'], ['effects-volume', 'effects'], ['delay', 'delay']]) {
  get(id).addEventListener('input', event => {
    settings[key] = Number(event.target.value)
    updateSettings()
  })
}

for (const pad of pads) {
  pad.addEventListener('pointerdown', event => {
    if (event.button === 0) strike(pad, event)
  })
  pad.addEventListener('click', event => { if (event.detail === 0) strike(pad, event) })
}

startButton.addEventListener('click', startRound)
get('pause').addEventListener('click', pauseRound)
get('resume').addEventListener('click', resumeRound)
get('quit').addEventListener('click', () => goHome())
get('retry').addEventListener('click', startRound)
get('retry-pause').addEventListener('click', startRound)
get('back').addEventListener('click', () => goHome())
pauseDialog.addEventListener('cancel', event => { event.preventDefault(); resumeRound() })
resultDialog.addEventListener('cancel', event => { event.preventDefault(); goHome() })
get('help-open').addEventListener('click', () => get('help').showModal())
get('settings-open').addEventListener('click', () => settingsDialog.showModal())
settingsDialog.addEventListener('close', () => stopCalibration(true))
get('calibrate').addEventListener('click', beginCalibration)
get('calibration-tap').addEventListener('pointerdown', tapCalibration)
get('calibration-tap').addEventListener('click', event => { if (event.detail === 0) tapCalibration(event) })
get('calibration-apply').addEventListener('click', event => {
  settings.delay = Number(event.currentTarget.dataset.offset)
  updateSettings()
  event.currentTarget.hidden = true
  text('calibration-status', '已应用演奏延迟。')
})

get('import-open').addEventListener('click', () => importDialog.showModal())
get('choose-files').addEventListener('click', () => get('file-picker').click())
get('choose-folder').addEventListener('click', () => get('folder-picker').click())
for (const id of ['file-picker', 'folder-picker']) {
  get(id).addEventListener('change', event => {
    const files = [...event.target.files]
    event.target.value = ''
    importDialog.close()
    receiveFiles(files)
  })
}

window.addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('Files')) return
  event.preventDefault()
  event.dataTransfer.dropEffect = mode === 'ready' ? 'copy' : 'none'
  document.body.classList.toggle('dragging', mode === 'ready')
})
window.addEventListener('dragleave', event => {
  if (!event.relatedTarget) document.body.classList.remove('dragging')
})
window.addEventListener('drop', event => {
  if (!event.dataTransfer.types.includes('Files')) return
  event.preventDefault()
  document.body.classList.remove('dragging')
  importDialog.close()
  receiveFiles([...event.dataTransfer.files])
})

document.addEventListener('keydown', event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
  if (settingsDialog.open && calibration && event.code === 'KeyF') {
    event.preventDefault()
    tapCalibration(event)
    return
  }
  if (document.querySelector('dialog[open]')) return
  if (event.code === 'Escape' && mode === 'playing') {
    event.preventDefault()
    pauseRound()
    return
  }
  if (mode === 'ready' && event.code === 'Enter' && !event.target.closest?.('button, input')) {
    event.preventDefault()
    startRound()
    return
  }
  const pad = pads[keys[event.code]]
  if (pad) {
    event.preventDefault()
    strike(pad, event)
  }
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseRound()
    if (calibration) stopCalibration(true)
  }
})

loadSongs()
