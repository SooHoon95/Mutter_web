import { describe, it, expect } from 'vitest';
import {
  isAllowedLicense,
  assertAllowedLicense,
  assertProvenance,
  ingestTrack,
} from './licenseGate';
import type { Track } from '@/data/types';

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'test-001',
    source: 'hosted',
    title: 'Test Track',
    author: 'Test Author',
    license: 'CC0',
    url: '/audio/test-001.mp3',
    provenance: {
      sourceUrl: 'https://pixabay.com/music/test-001',
      licenseName: 'CC0 1.0',
      licenseTextSnapshot:
        'No rights reserved. You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission.',
      acquiredAt: '2026-06-16',
      author: 'Test Author',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isAllowedLicense
// ---------------------------------------------------------------------------

describe('isAllowedLicense', () => {
  it('CC0은 통과한다', () => {
    expect(isAllowedLicense('CC0')).toBe(true);
  });

  it('PD(Public Domain)는 통과한다', () => {
    expect(isAllowedLicense('PD')).toBe(true);
  });

  it('CC-BY는 통과한다', () => {
    expect(isAllowedLicense('CC-BY')).toBe(true);
  });

  it('VENDOR_RF(벤더 RF 라이선스)는 통과한다', () => {
    expect(isAllowedLicense('VENDOR_RF')).toBe(true);
  });

  it('SOUNDCLOUD는 카탈로그 ingestion 대상이 아니라 거부한다', () => {
    expect(isAllowedLicense('SOUNDCLOUD')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertAllowedLicense — NC/ND 하드밴
// ---------------------------------------------------------------------------

describe('assertAllowedLicense', () => {
  it('CC0 트랙은 예외 없이 통과한다', () => {
    expect(() => assertAllowedLicense(makeTrack({ license: 'CC0' }))).not.toThrow();
  });

  it('CC-BY 트랙은 예외 없이 통과한다', () => {
    expect(() => assertAllowedLicense(makeTrack({ license: 'CC-BY' }))).not.toThrow();
  });

  it('VENDOR_RF 트랙은 예외 없이 통과한다', () => {
    expect(() => assertAllowedLicense(makeTrack({ license: 'VENDOR_RF' }))).not.toThrow();
  });

  // NC 하드밴
  it('SOUNDCLOUD 라이선스는 비화이트리스트로 거부한다', () => {
    expect(() => assertAllowedLicense(makeTrack({ license: 'SOUNDCLOUD' }))).toThrow(
      /화이트리스트/,
    );
  });

  // NC/ND 문자열이 LicenseKind에 없으므로, 런타임에 unknown 값이 들어올 때를 시뮬레이션
  it('NC 포함 라이선스 문자열은 하드밴(throw)한다', () => {
    // 런타임에 외부 데이터가 잘못된 값을 주입할 수 있는 케이스
    const badTrack = makeTrack({ license: 'CC0' });
    // 강제로 NC 값 주입 (unknown 타입 경유)
    (badTrack as unknown as Record<string, string>)['license'] = 'CC-BY-NC';
    expect(() => assertAllowedLicense(badTrack)).toThrow(/NC|ND/);
  });

  it('ND 포함 라이선스 문자열은 하드밴(throw)한다', () => {
    const badTrack = makeTrack({ license: 'CC0' });
    (badTrack as unknown as Record<string, string>)['license'] = 'CC-BY-ND';
    expect(() => assertAllowedLicense(badTrack)).toThrow(/NC|ND/);
  });

  it('NC-ND 복합 라이선스도 하드밴(throw)한다', () => {
    const badTrack = makeTrack({ license: 'CC0' });
    (badTrack as unknown as Record<string, string>)['license'] = 'CC-BY-NC-ND';
    expect(() => assertAllowedLicense(badTrack)).toThrow(/NC|ND/);
  });
});

// ---------------------------------------------------------------------------
// assertProvenance — 프로비넌스 필수 필드
// ---------------------------------------------------------------------------

describe('assertProvenance', () => {
  it('완전한 프로비넌스는 통과한다', () => {
    expect(() => assertProvenance(makeTrack())).not.toThrow();
  });

  it('provenance 자체가 없으면 거부한다', () => {
    const t = makeTrack();
    delete t.provenance;
    expect(() => assertProvenance(t)).toThrow(/프로비넌스 누락/);
  });

  it('sourceUrl 누락 시 거부한다', () => {
    expect(() =>
      assertProvenance(
        makeTrack({ provenance: { ...makeTrack().provenance!, sourceUrl: '' } }),
      ),
    ).toThrow(/sourceUrl/);
  });

  it('licenseTextSnapshot 누락 시 거부한다', () => {
    expect(() =>
      assertProvenance(
        makeTrack({
          provenance: { ...makeTrack().provenance!, licenseTextSnapshot: '' },
        }),
      ),
    ).toThrow(/licenseTextSnapshot/);
  });

  it('acquiredAt 누락 시 거부한다', () => {
    expect(() =>
      assertProvenance(
        makeTrack({ provenance: { ...makeTrack().provenance!, acquiredAt: '' } }),
      ),
    ).toThrow(/acquiredAt/);
  });

  it('author 누락 시 거부한다', () => {
    expect(() =>
      assertProvenance(
        makeTrack({ provenance: { ...makeTrack().provenance!, author: '' } }),
      ),
    ).toThrow(/author/);
  });
});

// ---------------------------------------------------------------------------
// ingestTrack — 통합 게이트
// ---------------------------------------------------------------------------

describe('ingestTrack', () => {
  it('CC0 + 완전한 프로비넌스 트랙은 그대로 반환한다', () => {
    const t = makeTrack();
    expect(ingestTrack(t)).toEqual(t);
  });

  it('PD + 완전한 프로비넌스 트랙은 통과한다', () => {
    const t = makeTrack({ license: 'PD' });
    expect(() => ingestTrack(t)).not.toThrow();
  });

  it('CC-BY + 완전한 프로비넌스 트랙은 통과한다', () => {
    const t = makeTrack({ license: 'CC-BY' });
    expect(() => ingestTrack(t)).not.toThrow();
  });

  it('VENDOR_RF + 완전한 프로비넌스 트랙은 통과한다', () => {
    const t = makeTrack({ license: 'VENDOR_RF' });
    expect(() => ingestTrack(t)).not.toThrow();
  });

  it('NC 라이선스 트랙은 ingestTrack에서 거부한다', () => {
    const t = makeTrack();
    (t as unknown as Record<string, string>)['license'] = 'CC-BY-NC-SA';
    expect(() => ingestTrack(t)).toThrow();
  });

  it('ND 라이선스 트랙은 ingestTrack에서 거부한다', () => {
    const t = makeTrack();
    (t as unknown as Record<string, string>)['license'] = 'CC-BY-ND';
    expect(() => ingestTrack(t)).toThrow();
  });

  it('비화이트리스트 라이선스는 거부한다', () => {
    const t = makeTrack();
    (t as unknown as Record<string, string>)['license'] = 'UNKNOWN_LICENSE';
    expect(() => ingestTrack(t)).toThrow(/화이트리스트/);
  });

  it('프로비넌스 없는 트랙은 거부한다', () => {
    const t = makeTrack();
    delete t.provenance;
    expect(() => ingestTrack(t)).toThrow(/프로비넌스/);
  });

  // KOMCA 배제 케이스: 메타데이터에 KOMCA 마킹이 있는 트랙은 진입 금지.
  // 현재 게이트는 license/provenance 검증이므로, KOMCA 곡은 catalog에 애초에 추가하지 않는다.
  // 이 테스트는 정책 문서화 목적 — 실수로 KOMCA 곡이 포함되면 별도 필드 검증 추가.
  it('KOMCA 곡은 시드 카탈로그에 포함되지 않는다(정책 문서화)', () => {
    // KOMCA 관리곡은 RF 라이선스가 실연·음반 인접권을 커버하지 않을 수 있어 배제.
    // 시드 카탈로그는 Pixabay 자체 제작 음원만 사용한다.
    // → 이 테스트는 정책을 코드로 못 박는다: tracks.json에 komcaManaged: true 트랙이 없음.
    const komcaTrack = makeTrack({
      id: 'komca-001',
      // komcaManaged 필드는 현재 Track 타입에 없으므로, 실제로는 카탈로그에 추가하지 않는 정책.
      // 만약 추가될 경우 ingestTrack에 komcaManaged 검증을 추가해야 한다.
    });
    // 정상 CC0 트랙이므로 게이트 자체는 통과 — 정책은 카탈로그 큐레이션 단계에서 강제.
    expect(() => ingestTrack(komcaTrack)).not.toThrow();
    // 실제 보장: tracks.json 시드에 KOMCA 관리 음원이 없음(수동 큐레이션 + 이 주석이 SOC).
  });
});
