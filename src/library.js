import { decodeTja, parseTja } from './tja.js'

const songBase = new URL('../songs/', import.meta.url)
const audioFile = /\.(ogg|oga|mp3|wav|m4a|aac|flac|opus)$/i
const limit = 80 * 1024 * 1024
let database

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('taiko-codex', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('songs', { keyPath: 'id' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }).catch(error => {
      database = null
      throw error
    })
  }
  return database
}

async function transaction(mode, run) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('songs', mode)
    const request = run(tx.objectStore('songs'))
    tx.oncomplete = () => resolve(request.result)
    tx.onabort = () => reject(tx.error)
  })
}

function normalizePath(value) {
  return value.normalize('NFC').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
}

export function matchAudio(chartFile, wave, files) {
  if (!wave) throw new Error('谱面缺少 WAVE 文件名')
  const name = normalizePath(wave)
  const leaf = name.split('/').at(-1)
  const directory = normalizePath(chartFile.webkitRelativePath || chartFile.name).split('/').slice(0, -1).join('/')
  const candidates = files.filter(file => audioFile.test(file.name))
  const exact = candidates.filter(file => normalizePath(file.webkitRelativePath || file.name) === [directory, name].filter(Boolean).join('/'))
  const matches = exact.length ? exact : candidates.filter(file => normalizePath(file.name) === leaf)
  if (!matches.length) throw new Error(`未找到音频「${wave}」`)
  if (matches.length > 1) throw new Error(`存在多个同名音频「${wave}」，请使用文件夹导入或单独导入这首曲目`)
  if (matches[0].size > limit) throw new Error('音频文件超过 80 MB')
  return matches[0]
}

async function checkedFetch(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`曲库资源加载失败（HTTP ${response.status}）`)
  return response
}

export async function builtinSongs() {
  const manifest = await (await checkedFetch(new URL('index.json', songBase))).json()
  const songs = await Promise.all(manifest.map(async entry => {
    const chartUrl = new URL(entry.chart, songBase)
    const chart = parseTja(await (await checkedFetch(chartUrl)).text())
    return { ...chart, ...entry, audio: new URL(chart.wave, chartUrl), local: false }
  }))
  return songs
}

function localSong(entry) {
  return { ...parseTja(entry.text), id: entry.id, audio: entry.audio, duration: entry.duration, author: '本地曲包', local: true, theme: 'local', tag: '本地导入' }
}

export async function savedSongs() {
  const saved = await transaction('readonly', store => store.getAll())
  return saved.flatMap(entry => {
    try {
      return [localSong(entry)]
    } catch {
      return []
    }
  })
}

export async function importSongs(files, inspect) {
  const charts = files.filter(file => /\.tja$/i.test(file.name))
  if (!charts.length) throw new Error('请选择 .tja 谱面和对应的音频文件')
  const songs = []
  const notices = []
  const durations = new Map()
  for (const file of charts) {
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('谱面超过 2 MB')
      const text = decodeTja(await file.arrayBuffer())
      const chart = parseTja(text)
      const audio = matchAudio(file, chart.wave, files)
      if (!durations.has(audio)) durations.set(audio, await inspect(audio))
      const duration = durations.get(audio)
      if (duration > 1800) throw new Error('音频超过 30 分钟')
      const fingerprint = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${text}\u0000${audio.name}\u0000${audio.size}\u0000${audio.lastModified}`))
      const id = 'local-' + Array.from(new Uint8Array(fingerprint), byte => byte.toString(16).padStart(2, '0')).join('')
      const entry = { id, text, audio, duration }
      await transaction('readwrite', store => store.put(entry))
      songs.push(localSong(entry))
      notices.push(...chart.warnings.map(warning => `${chart.title} · ${warning}`))
    } catch (error) {
      notices.push(`${file.name} · ${error.message || '导入失败'}`)
    }
  }
  return { songs, notices }
}

export function deleteSong(id) {
  return transaction('readwrite', store => store.delete(id))
}
