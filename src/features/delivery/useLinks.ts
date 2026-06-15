// useLinks hook — 편지별 전달 링크 목록·발급·revoke 상태 관리.
// links.ts 데이터 레이어를 react 상태로 감싼다.
// T7 (US-007): capability-links 스킬 참조.

import { useState, useCallback, useEffect } from 'react';
import { issueLink, listLinks, revokeLink } from '../../data/links';
import type { IssueLinkInput } from '../../data/links';
import type { DeliveryLink } from '../../data/types';
// re-export for consumers
export type { IssueLinkInput };

export interface UseLinksState {
  links: DeliveryLink[];
  loading: boolean;
  error: string | null;
}

export interface UseLinksActions {
  issue: (input: IssueLinkInput) => Promise<void>;
  revoke: (token: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useLinks(letterId: string): UseLinksState & UseLinksActions {
  const [links, setLinks] = useState<DeliveryLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listLinks(letterId);
      setLinks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '링크 목록 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [letterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const issue = useCallback(
    async (input: IssueLinkInput) => {
      setLoading(true);
      setError(null);
      try {
        const newLink = await issueLink(letterId, input);
        setLinks((prev) => [newLink, ...prev]);
      } catch (err) {
        setError(err instanceof Error ? err.message : '링크 발급 실패');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [letterId],
  );

  const revoke = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      await revokeLink(token);
      // 로컬 상태에서 revoked 표시 (재조회 없이 즉시 반영)
      setLinks((prev) =>
        prev.map((l) =>
          l.token === token ? { ...l, revokedAt: new Date().toISOString() } : l,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'revoke 실패');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { links, loading, error, issue, revoke, reload };
}
