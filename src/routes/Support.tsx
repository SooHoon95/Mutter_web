/**
 * src/routes/Support.tsx
 *
 * 공개·무인증 고객 지원 페이지. App Store 제출 필수(지원 URL — mailto 불가, 웹 페이지 필요).
 * FAQ + 문의 이메일 + 개인정보 처리방침·저작권 신고 채널 링크. 셸/가드 없는 정적 페이지.
 */
import { Link } from 'react-router-dom';
import styles from './Support.module.css';

/** 문의 이메일 — 앱 '문의하기'와 동일 채널. 빌드 시 VITE_SUPPORT_EMAIL로 덮어쓸 수 있다. */
const CONTACT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'dkehskeh@gmail.com';

/** 자주 묻는 질문 — 핵심 사용 흐름 위주. */
const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: '편지는 어떻게 보내나요?',
    a: '로그인 후 편지를 작성하고 테마와 음악을 고른 뒤, ‘보내기’에서 전달 링크를 발급하거나 연결된 사람에게 바로 보낼 수 있어요.',
  },
  {
    q: '받는 사람도 앱을 설치해야 하나요?',
    a: '아니요. 받는 사람은 전달받은 링크만 열면 웹에서 바로 편지를 읽을 수 있어요. 설치가 필요 없습니다.',
  },
  {
    q: '링크에 암호를 걸거나 공개 시각을 정할 수 있나요?',
    a: '네. 링크 발급 시 암호 보호와 예약 공개를 설정할 수 있고, 발급한 링크는 언제든 무효화할 수 있어요.',
  },
  {
    q: '음악은 어디서 오나요?',
    a: '음악은 SoundCloud의 공식 embed를 통해 재생됩니다. 서비스가 오디오 파일을 직접 저장·배포하지 않습니다.',
  },
  {
    q: '계정과 데이터를 삭제하려면?',
    a: '앱의 프로필 화면에서 ‘계정 삭제’를 실행하면 계정과 작성한 편지·연결 정보가 삭제됩니다. 되돌릴 수 없습니다.',
  },
  {
    q: '로그인이 안 돼요.',
    a: '앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요. 계속 문제가 있으면 아래 이메일로 기기·앱 버전과 함께 문의해 주세요.',
  },
];

export default function Support(): React.ReactElement {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>고객 지원</h1>
        <p className={styles.intro}>
          뮤터를 이용해 주셔서 감사합니다. 자주 묻는 질문을 먼저 확인하시고, 해결되지 않으면 언제든
          이메일로 문의해 주세요.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>문의하기</h2>
          <p className={styles.paragraph}>
            아래 이메일로 문의해 주시면 최대한 빠르게 답변드리겠습니다. 원활한 안내를 위해 앱 버전과
            기기 정보를 함께 남겨주세요.
            <br />
            <a className={styles.link} href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('[Mutter] 문의사항')}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>자주 묻는 질문</h2>
          <dl className={styles.faq}>
            {FAQ.map(({ q, a }) => (
              <div className={styles.faqItem} key={q}>
                <dt className={styles.faqQ}>{q}</dt>
                <dd className={styles.faqA}>{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>정책 및 신고</h2>
          <ul className={styles.linkList}>
            <li>
              <Link className={styles.link} to="/legal/privacy">개인정보 처리방침</Link>
            </li>
            <li>
              <Link className={styles.link} to="/legal/takedown">저작권 신고(Takedown)</Link>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
