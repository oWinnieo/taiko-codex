"""Render the original demo tracks and charts with the Python standard library."""
from array import array
from math import exp, pi, sin, tanh
from pathlib import Path
from random import Random
import json
import sys
import wave

ROOT = Path(__file__).resolve().parents[1] / 'web' / 'songs'
RATE = 24000
LEAD = 0.25
LITE = [
    '10002000', '10001020', '10002010', '10201020',
    '30002000', '10201000', '10004000', '50008000',
    '10002010', '20102010', '10021020', '10102020',
    '30002010', '10201020', '10004010', '70000080',
]
EXTRA = [
    '10022010', '10201120', '10122020', '11201022',
    '30122010', '11202120', '10204210', '60000080',
    '12121022', '10211220', '10112211', '11212022',
    '30121022', '10211220', '10104022', '70000008',
]
FINISH = ['10201020', '20102010', '30203040', '30000000']
FINISH_EXTRA = ['11210212', '12112122', '31214342', '30000000']
TRACKS = [
    ('paper-lanterns', '纸灯巡游', '暖调合成器与夜市鼓步', '暖调电子', 'warm', 112, [57, 53, 60, 55], [0, 7, 12, 7, 10, 7, 3, 7]),
    ('voltage-crossing', '电流穿行', '切分低音与霓虹节拍', '合成贝斯', 'cool', 144, [52, 55, 48, 50], [0, 12, 7, 10, 7, 15, 12, 7]),
]


def tone_pitch(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def render_mix(bpm, roots, motif, target, cool):
    beat = 60 / bpm
    end = LEAD + 80 * beat + 0.35
    mix = [0.0] * round(end * RATE)
    rng = Random(30 + bpm)

    def add(start, duration, voice):
        begin = round(start * RATE)
        end = min(len(mix), begin + round(duration * RATE))
        for position in range(begin, end):
            time = (position - begin) / RATE
            mix[position] += voice(time)

    for measure in range(20):
        root = roots[measure % 4]
        start = LEAD + measure * 4 * beat
        closing = measure == 19
        for step in range(1 if closing else 8):
            at = start + step * beat / 2
            if step in (0, 4) or (cool and step == 7):
                add(at, 0.24, lambda t: 0.43 * sin(2 * pi * (54 * t + 2.2 * (1 - exp(-38 * t)))) * exp(-t * 20))
            if step in (2, 6):
                add(at, 0.16, lambda t: (rng.uniform(-1, 1) * 0.22 + 0.11 * sin(2 * pi * 173 * t)) * exp(-t * 28))
            if step or not closing:
                add(at, 0.065, lambda t: rng.uniform(-1, 1) * 0.105 * exp(-t * 75))
            if step % 2 == 0 or cool:
                hz = tone_pitch(root - 12 + (7 if step == 6 else 0))
                add(at, beat * 0.64, lambda t: (sin(2 * pi * hz * t) + 0.24 * sin(2 * pi * 2 * hz * t))
                    * 0.16 * exp(-t * 11) * min(t * 230, 1))
            if measure > 0 and (step % 2 == 0 or (measure >= 8 and not closing)):
                hz = tone_pitch(root + 12 + motif[step])
                add(at, beat * (0.7 if cool else 1.15), lambda t: (sin(2 * pi * hz * t)
                    + (0.31 if cool else 0.45) * sin(2 * pi * (2.0 if cool else 2.01) * hz * t))
                    * 0.105 * exp(-t * (12 if cool else 8)) * min(t * 280, 1))
        for offset in (0, 3 if cool else 4, 7):
            hz = tone_pitch(root + offset)
            add(start, 3.7 * beat, lambda t: (sin(2 * pi * hz * t) + 0.12 * sin(2 * pi * 2 * hz * t))
                * 0.052 * min(t * 9, 1) * max(0, 1 - t / (3.7 * beat)))

    with wave.open(str(target), 'wb') as audio:
        audio.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        samples = array('h', (round(tanh(value * 1.25) * 30400) for value in mix))
        if sys.byteorder != 'little':
            samples.byteswap()
        audio.writeframes(samples.tobytes())
    return round(end)


def generate():
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for track_id, title, subtitle, tag, theme, bpm, roots, motif in TRACKS:
        cool = theme == 'cool'
        chart = [
            f'TITLE:{title}', f'SUBTITLE:--{subtitle}', f'BPM:{bpm}',
            f'WAVE:{track_id}.wav', f'OFFSET:-{LEAD}', ''
        ]
        for index, (course, pattern, finish) in enumerate([('Easy', LITE, FINISH), ('Hard', EXTRA, FINISH_EXTRA)]):
            chart += [f'COURSE:{course}', f'LEVEL:{(3 if cool else 2) + index * 3}', f'BALLOON:{5 + index * 3}', '#START']
            if cool:
                pattern = pattern[4:8] + pattern[:4] + pattern[8:]
            chart += [f'{measure},' for measure in pattern]
            chart += ['#GOGOSTART', '#SCROLL 1.1', *(f'{measure},' for measure in finish), '#GOGOEND', '#END', '']
        (ROOT / f'{track_id}.tja').write_text('\n'.join(chart), encoding='utf-8')
        duration = render_mix(bpm, roots, motif, ROOT / f'{track_id}.wav', cool)
        manifest.append(dict(id=track_id, chart=f'{track_id}.tja', author='taiko-codex', theme=theme, tag=tag, duration=duration))
    (ROOT / 'index.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    generate()
