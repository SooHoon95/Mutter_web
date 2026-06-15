/**
 * useLetterViewer 상태 전이 테스트.
 *
 * openByToken·getDeviceId를 모킹해 라이브 Supabase 없이 검증한다.
 * 전이: loading → ready / needPassword / error(정규화 메시지).
 *
 * 실제 SC iframe/오디오 재생은 jsdom 불가 → 여기서는 상태 머신만 검증한다(수동 디바이스 검증 별도).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { LetterPayload } from '@/data/links';

// openByToken·getDeviceId 모킹
vi.mock('@/data/links', () => ({
  openByToken: vi.fn(),
}));
vi.mock('@/lib/deviceId', () => ({
  getDeviceId: vi.fn(() => 'device-test-001'),
}));

import { openByToken } from '@/data/links';
import { getDeviceId } from '@/lib/deviceId';
import { useLetterViewer } from './useLetterViewer';

const mockOpenByToken = vi.mocked(openByToken);
const mockGetDeviceId = vi.mocked(getDeviceId);

const samplePayload: LetterPayload = {
  id: 'letter-abc',
  title: '테스트 편지',
  paragraphs: [
    { id: 'p1', order: 0, text: '첫 단락', cue: { sourceType: 'hosted', ref: 'pixabay-calm-001', startMs: 0 } },
    { id: 'p2', order: 1, text: '둘째 단락' },
  ],
  templateId: 'classic-serif',
  cues: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useLetterViewer', () => {
  it('성공 시 ready로 전이하고 편지를 정규화한다', async () => {
    mockOpenByToken.mockResolvedValue(samplePayload);

    const { result } = renderHook(() => useLetterViewer('tok'));

    // 초기 loading
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.letter).not.toBeNull();
    expect(result.current.letter?.id).toBe('letter-abc');
    expect(result.current.letter?.templateId).toBe('classic-serif');
    expect(result.current.letter?.paragraphs).toHaveLength(2);
    // 단락별 cue가 cues 배열로 인덱스 정렬된다.
    expect(result.current.letter?.cues[0]).toEqual({
      sourceType: 'hosted',
      ref: 'pixabay-calm-001',
      startMs: 0,
    });
    expect(result.current.letter?.cues[1]).toBeUndefined();
  });

  it('첫 시도가 암호 오류면 needPassword로 전이한다', async () => {
    // 암호 없이 시도 → WRONG_PASSWORD 정규화 메시지
    mockOpenByToken.mockRejectedValueOnce(new Error('암호가 올바르지 않습니다.'));

    const { result } = renderHook(() => useLetterViewer('tok'));

    await waitFor(() => expect(result.current.status).toBe('needPassword'));
    expect(result.current.errorMessage).toBeNull();
  });

  it('needPassword에서 올바른 암호 제출 시 ready로 전이한다', async () => {
    mockOpenByToken
      .mockRejectedValueOnce(new Error('암호가 올바르지 않습니다.')) // 첫 시도(암호 없이)
      .mockResolvedValueOnce(samplePayload); // 암호 재시도 성공

    const { result } = renderHook(() => useLetterViewer('tok'));
    await waitFor(() => expect(result.current.status).toBe('needPassword'));

    act(() => {
      result.current.submitPassword('correct-pw');
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    // 재시도는 평문 암호 + deviceId를 RPC 경로로 넘긴다.
    expect(mockOpenByToken).toHaveBeenLastCalledWith('tok', 'correct-pw', 'device-test-001');
  });

  it('needPassword에서 틀린 암호 제출 시 error로 전이한다(정규화 메시지 노출)', async () => {
    mockOpenByToken
      .mockRejectedValueOnce(new Error('암호가 올바르지 않습니다.')) // 첫 시도
      .mockRejectedValueOnce(new Error('암호가 올바르지 않습니다.')); // 암호 재시도도 실패

    const { result } = renderHook(() => useLetterViewer('tok'));
    await waitFor(() => expect(result.current.status).toBe('needPassword'));

    act(() => {
      result.current.submitPassword('wrong-pw');
    });

    // 암호를 넣고도 틀리면 더 이상 needPassword가 아니라 error로 노출한다.
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('암호가 올바르지 않습니다.');
  });

  it('revoke 등 비암호 오류는 error로 전이하고 정규화 메시지를 노출한다', async () => {
    mockOpenByToken.mockRejectedValue(new Error('이 링크는 발신자에 의해 무효화되었습니다.'));

    const { result } = renderHook(() => useLetterViewer('tok'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('이 링크는 발신자에 의해 무효화되었습니다.');
  });

  it('token이 없으면 error로 전이한다', async () => {
    const { result } = renderHook(() => useLetterViewer(undefined));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('링크를 찾을 수 없습니다.');
    expect(mockOpenByToken).not.toHaveBeenCalled();
  });

  it('openByToken에 token·deviceId를 전달한다(claim-and-bind 경로)', async () => {
    mockOpenByToken.mockResolvedValue(samplePayload);

    renderHook(() => useLetterViewer('my-token'));

    await waitFor(() =>
      expect(mockOpenByToken).toHaveBeenCalledWith('my-token', undefined, 'device-test-001'),
    );
    expect(mockGetDeviceId).toHaveBeenCalled();
  });

  it('payload에 cues 배열이 제공되면 단락별 cue 필드보다 우선 사용한다', async () => {
    const payloadWithCues: LetterPayload = {
      ...samplePayload,
      cues: [
        undefined,
        { sourceType: 'soundcloud', ref: 'https://soundcloud.com/x/y', startMs: 1000 },
      ],
    };
    mockOpenByToken.mockResolvedValue(payloadWithCues);

    const { result } = renderHook(() => useLetterViewer('tok'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // cues 배열 우선: index0 undefined, index1 SC cue
    expect(result.current.letter?.cues[0]).toBeUndefined();
    expect(result.current.letter?.cues[1]).toEqual({
      sourceType: 'soundcloud',
      ref: 'https://soundcloud.com/x/y',
      startMs: 1000,
    });
  });
});
