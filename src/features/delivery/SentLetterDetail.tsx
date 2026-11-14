// SentLetterDetail — 보낸 편지 상세(0037·0038). 보낸 편지 목록의 펼친 패널에서 LinkManager 위에 놓인다.
//
//   - 열람자: "{닉네임} · {M}월 {D}일에 열어봄"(get_letter_readers). 조회 실패·아무도 안 열었으면 숨김.
//   - 영구 편지로 만들기 · 편지권 1장: 이미 보낸(링크가 있는) 영구가 아닌 편지에, 편지권을 쓸 수 있을 때만. 문구가 편지권 1장을
//     말하므로 확인 단계 없이 바로 진행한다. 잔액이 없으면 앱 안내.
//   - 같은 내용으로 한 통 더 보내기: duplicate-letter로 새 편지를 만들고 기존 발송 흐름(/create/:id)으로.
// 서버 반영 전에는 편지권 조회가 null이라 위 기능이 모두 숨는다(오늘의 화면 그대로).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getLetterReaders, LetterGoneError, NoTicketError, type LetterAccess } from '@/data/access';
import { duplicateLetter, makeLetterPermanent } from '@/data/tickets';
import {
  useEntitlements,
  ENTITLEMENTS_QUERY_KEY,
  LETTER_ACCESS_QUERY_KEY,
} from '@/features/tickets';
import { monthDay } from '@/lib/accessLabel';
import styles from './SentLetterDetail.module.css';

interface SentLetterDetailProps {
  letterId: string;
  /** 이 편지의 접근 상태(목록에서 합친 값). 서버 반영 전이면 undefined. */
  access: LetterAccess | undefined;
  /** 아직 보내지 않은(링크가 없는) 편지면 영구 버튼·편지권 안내를 숨긴다 — 편지권은 보낼 때(발급·발송)만 쓴다. */
  hidePermanent?: boolean;
}

export function SentLetterDetail({
  letterId,
  access,
  hidePermanent = false,
}: SentLetterDetailProps): React.ReactElement | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { entitlements, canUseTicket, showBuyHint } = useEntitlements();

  const { data: readers } = useQuery({
    queryKey: ['letterReaders', letterId],
    queryFn: () => getLetterReaders(letterId).catch(() => []),
    retry: false,
  });

  const [busy, setBusy] = useState<'permanent' | 'duplicate' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noTicket, setNoTicket] = useState(false);

  // 영구로 만들 수 있는 편지 — 무료 기간 안이거나 잠긴 편지(삭제 대상은 되살릴 수 없다).
  const upgradable = !hidePermanent && (access?.state === 'open' || access?.state === 'locked');

  async function handlePermanent(): Promise<void> {
    setBusy('permanent');
    setError(null);
    try {
      await makeLetterPermanent(letterId);
      void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: LETTER_ACCESS_QUERY_KEY });
    } catch (err) {
      if (err instanceof NoTicketError) setNoTicket(true);
      else if (err instanceof LetterGoneError) setError(err.message);
      else setError('편지권을 쓰지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDuplicate(): Promise<void> {
    setBusy('duplicate');
    setError(null);
    try {
      const newId = await duplicateLetter(letterId);
      // 새 편지는 링크가 없다 — 기존 작성·발송 화면에서 링크 발급이나 연결 상대에게 보내기를 이어 간다.
      navigate(`/create/${newId}`);
    } catch {
      setError('편지를 복사하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setBusy(null);
    }
  }

  const hasReaders = !!readers && readers.length > 0;
  // 서버(0038) 반영 전이면 entitlements가 null — 새 기능을 통째로 숨긴다.
  if (!hasReaders && entitlements === null) return null;

  return (
    <div className={styles.container}>
      {hasReaders && (
        <div>
          <p className={styles.sectionLabel}>열어본 사람</p>
          <ul className={styles.readers}>
            {readers.map((r) => (
              <li key={r.userId} className={styles.reader}>
                {r.nickname?.trim() || '이름 없는 사용자'} · {monthDay(r.firstOpenedAt)}에 열어봄
              </li>
            ))}
          </ul>
        </div>
      )}

      {entitlements !== null && (
        <div className={styles.actions}>
          {upgradable && canUseTicket && !noTicket && (
            <button
              type="button"
              className={styles.btn}
              onClick={() => void handlePermanent()}
              disabled={busy !== null}
            >
              {busy === 'permanent' ? '만드는 중…' : '영구 편지로 만들기 · 편지권 1장'}
            </button>
          )}
          <button
            type="button"
            className={styles.btn}
            onClick={() => void handleDuplicate()}
            disabled={busy !== null}
          >
            {busy === 'duplicate' ? '복사하는 중…' : '같은 내용으로 한 통 더 보내기'}
          </button>
        </div>
      )}

      {upgradable && (noTicket || (!canUseTicket && showBuyHint)) && (
        <p className={styles.hint}>
          {noTicket && '편지권이 없어요. '}편지권은 뮤터 앱에서 살 수 있어요
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
