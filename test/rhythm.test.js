import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'
import { calibrationOffset, GameEngine } from '../src/engine.js'
import { matchAudio } from '../src/library.js'
import { decodeTja, parseTja } from '../src/tja.js'

function chart(body, extra = '') {
  return parseTja(`TITLE:测试曲\nBPM:120\nWAVE:beat.wav\n${extra}\n#START\n${body}\n#END`).charts[0]
}

test('both shipped songs have two playable charts and their matching audio', async () => {
  const directory = new URL('../web/songs/', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('index.json', directory)))
  assert.equal(manifest.length, 2)
  for (const song of manifest) {
    const parsed = parseTja(await readFile(new URL(song.chart, directory), 'utf8'))
    assert.equal(parsed.charts.length, 2)
    assert.deepEqual(parsed.warnings, [])
    const audio = await readFile(new URL(parsed.wave, directory))
    assert.equal(audio.toString('ascii', 0, 4), 'RIFF')
    assert.equal(audio.toString('ascii', 8, 12), 'WAVE')
    assert.ok(Math.abs((audio.length - 44) / 48000 - song.duration) < 1)
    assert.ok(parsed.charts.every(course => course.notes.length >= 50))
  }
})

test('offset, measure, mid-measure tempo, delay and boost extend a monotonic chart', () => {
  const compiled = chart([
    '#MEASURE 3/4', '10', '#BPMCHANGE 60', '20, // inline comment', '#DELAY 0.5',
    '#GOGOSTART', '#SCROLL 1.5', '3000,', '#GOGOEND', '#BARLINEOFF', ','
  ].join('\n'), 'OFFSET:-0.25')
  assert.deepEqual(compiled.notes.map(note => note.time), [0.25, 1, 3])
  assert.deepEqual(compiled.bars.map(bar => bar.time), [0.25, 3])
  assert.equal(compiled.notes[2].scroll, 0.75)
  assert.equal(compiled.notes[2].boosted, true)
  assert.deepEqual(compiled.boosts, [{ start: 3, end: 6 }])
  assert.equal(compiled.end, 9)
})

test('a positive offset puts early notes before the audio; missing end markers fail with context', () => {
  assert.equal(chart('1000,', 'OFFSET:0.5').notes[0].time, -0.5)
  assert.throws(() => chart('5000,'), /缺少结束符/)
  assert.throws(() => chart('1000'), /缺少逗号/)
})

test('a supported difficulty survives a branch chart and legacy text can decode', () => {
  const parsed = parseTja('TITLE:Demo\nBPM:120\nCOURSE:Oni\n#START\n#BRANCHSTART p,50,80\n1000,\n#END\nCOURSE:Easy\n#START\n2000,\n#END')
  assert.equal(parsed.charts[0].label, '入门')
  assert.match(parsed.warnings[0], /BRANCHSTART/)
  const bytes = new Uint8Array([0x82, 0xa0, 0x82, 0xa2])
  assert.equal(decodeTja(bytes), 'あい')
  assert.equal(decodeTja(new TextEncoder().encode('鼓')), '鼓')
})

test('ambiguous files are rejected and relative matches take precedence', () => {
  const first = { name: 'Beat.ogg', webkitRelativePath: 'folder/Beat.ogg', size: 14 }
  const second = { name: 'beat.ogg', webkitRelativePath: 'else/beat.ogg', size: 16 }
  assert.equal(matchAudio({ name: 'a.tja', webkitRelativePath: 'folder/a.tja' }, 'beat.OGG', [second, first]), first)
  assert.throws(() => matchAudio({ name: 'a.tja' }, 'BEAT.ogg', [first, second]), /多个同名/)
  assert.throws(() => matchAudio({ name: 'a.tja' }, 'other.ogg', [first]), /未找到/)
})

test('hits distinguish type, timing and overdue notes with no double counting', () => {
  const engine = new GameEngine(chart('1200,3000,1000,'))
  assert.equal(engine.strike('rim', 0, 'left'), null)
  assert.equal(engine.strike('center', 0.013, 'left').judgment, 'perfect')
  assert.equal(engine.strike('rim', 0.57, 'left').judgment, 'good')
  assert.equal(engine.strike('center', 2.01, 'left').judgment, 'perfect')
  assert.equal(engine.strike('center', 2.02, 'left'), null)
  assert.equal(engine.strike('center', 2.032, 'right').judgment, 'double')
  engine.advance(4.5)
  engine.advance(9)
  const result = engine.result()
  assert.equal(result.score, 3000)
  assert.equal(result.miss, 1)
  assert.equal(result.bestCombo, 3)
  assert.equal(result.accuracy, 0.625)
})

test('roll hits take either input but a balloon only takes center hits until popped', () => {
  const engine = new GameEngine(chart('5800,\n7080,', 'BALLOON:2'))
  assert.equal(engine.strike('rim', 0.4, 'right').judgment, 'roll')
  assert.equal(engine.strike('rim', 0.5, 'right'), null)
  assert.equal(engine.strike('rim', 2.1, 'right'), null)
  assert.equal(engine.strike('center', 2.2, 'left').judgment, 'roll')
  assert.equal(engine.strike('center', 2.3, 'right').judgment, 'pop')
  assert.equal(engine.strike('center', 2.4, 'left'), null)
  assert.equal(engine.result().rollHits, 3)
  assert.equal(engine.result().balloons, 1)
})

test('calibration uses the median and requires four samples', () => {
  assert.equal(calibrationOffset([0.055, 0.06, 0.062, 0.065, 0.2]), 62)
  assert.equal(calibrationOffset([-0.05, -0.02, 0, 0.015]), -10)
  assert.equal(calibrationOffset([0.05, 0.07]), null)
})
