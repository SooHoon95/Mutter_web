#!/usr/bin/env python3
"""연출되는 편지 — CC0 폴백 앰비언트 패드 생성기.
ffmpeg/lame 부재 환경에서 순수 표준 라이브러리로 부드러운 패드 WAV를 만든다.
저작권: 합성음(저작물 차용 없음) → CC0. afconvert로 .m4a 변환은 호출측에서 수행.
"""
import math
import struct
import wave
import os

SR = 22050          # 모바일 폴백용 — 가볍게
DUR = 18.0          # 초
MASTER = 0.24       # 잔잔하게 (친밀한 순간을 압도하지 않도록)
OUT = "/tmp/audio_wav"
os.makedirs(OUT, exist_ok=True)

# id -> 루트 주파수(Hz). 무드별 음높이로 분위기 차이.
TRACKS = {
    "pixabay-calm-001": 220.00,       # A3  잔잔
    "pixabay-warm-002": 196.00,       # G3  따뜻
    "pixabay-nostalgia-003": 174.61,  # F3  그리움
    "pixabay-excitement-004": 261.63, # C4  설렘
    "pixabay-longing-005": 164.81,    # E3  그리움(낮게)
    "pixabay-peaceful-006": 146.83,   # D3  평온
}

def render(root: float) -> bytes:
    n = int(SR * DUR)
    frames = bytearray()
    # 3배음(루트/5도/옥타브) + 미세 디튠으로 따뜻한 패드.
    partials = [(1.00, 0.50), (1.5, 0.30), (2.0, 0.20)]
    detune = 1.003
    for i in range(n):
        t = i / SR
        # 느린 트레몰로(0.12Hz)로 숨쉬는 듯한 움직임.
        lfo = 0.82 + 0.18 * math.sin(2 * math.pi * 0.12 * t)
        s = 0.0
        for mult, amp in partials:
            f = root * mult
            s += amp * math.sin(2 * math.pi * f * t)
            s += amp * 0.5 * math.sin(2 * math.pi * f * detune * t)
        s *= lfo
        # 페이드 인/아웃(각 2.5초) — 루프/탭 시 클릭 방지.
        fade = 2.5
        env = 1.0
        if t < fade:
            env = t / fade
        elif t > DUR - fade:
            env = max(0.0, (DUR - t) / fade)
        v = s * MASTER * env / 1.3  # partial 합 정규화
        v = max(-1.0, min(1.0, v))
        frames += struct.pack("<h", int(v * 32767))
    return bytes(frames)

for tid, root in TRACKS.items():
    path = os.path.join(OUT, tid + ".wav")
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(render(root))
    print("wrote", path)
print("done")
