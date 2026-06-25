// 닉네임(표시 이름) 설정 페이지 (/set-nickname).
//
// 가입(소셜·이메일) 직후 가장 먼저 만나는 화면. 닉네임이 없는 유저는 메인 진입 전에 여기서
// 표시 이름을 정한다. 셸(헤더) 없는 클린 페이지. "시작하기"를 눌러야만 profiles.nickname에
// 기록되고(= 회원가입 완료 처리) 가입 완료 축하(/welcome)로 진입한다 — 명시적 저장 = DB 기록.
//
// 흐름: (카카오/구글/이메일 가입) → /set-nickname(이 화면) → "시작하기" → /welcome → 메인('/').
// 이 이름이 연결·발송·스레드·받은이에서 상대에게 보이는 이름이다.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useProfile } from '@/features/profile';
import { socialDisplayName } from '@/lib/userName';
import styles from './SetNickname.module.css';

export default function SetNickname(): React.ReactElement | null {
  const { session, loading } = useAuth();
  const { profile, updateNickname, isUpdating } = useProfile();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 입력칸을 추천 이름으로 미리 채운다: 기존 닉네임 > 소셜 실명. 이메일 아이디는 채우지 않는다
  // (dkehskeh 같은 아이디를 이름으로 굳히지 않기 위해). 사용자가 입력을 시작하면 덮지 않는다.
  useEffect(() => {
    if (touched) return;
    const guess = profile?.nickname?.trim() || (session ? socialDisplayName(session.user) : '');
    if (guess) setName(guess);
  }, [profile?.nickname, session, touched]);

  // 비로그인 접근은 로그인으로.
  useEffect(() => {
    if (!loading && !session) navigate('/login', { replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) return null;

  async function save(): Promise<void> {
    const finalName = name.trim();
    if (!finalName) return;
    setError(null);
    // "시작하기"(명시적 저장) 시에만 profiles.nickname에 기록한다(= 회원가입 완료 처리).
    try {
      await updateNickname(finalName);
    } catch {
      setError('이름 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    // 저장 성공 → 가입 완료 축하 화면으로.
    navigate('/welcome', { replace: true });
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>이름을 정해주세요</h1>
        <p className={styles.subtitle}>
          편지·연결에서 상대에게 보일 이름이에요.
          <br />
          나중에 마이페이지에서 바꿀 수 있어요.
        </p>
        <input
          className={styles.input}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setTouched(true);
          }}
          placeholder="표시할 이름"
          aria-label="표시할 이름"
          maxLength={50}
          autoFocus
        />
        {error && <p className={styles.error}>{error}</p>}
        <button
          type="button"
          className={styles.button}
          onClick={() => void save()}
          disabled={!name.trim() || isUpdating}
        >
          {isUpdating ? '저장 중…' : '시작하기'}
        </button>
      </div>
    </main>
  );
}
