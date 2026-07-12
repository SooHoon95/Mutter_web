/**
 * src/routes/Privacy.tsx
 *
 * 공개·무인증 개인정보 처리방침. App Store 제출 필수(개인정보 처리방침 URL).
 * Takedown과 동일하게 셸/가드 없는 정적 법적 페이지 — 라이브 DB 없이도 항상 접근 가능.
 * 데이터 수집 항목은 실제 구현(Supabase 인증·FCM 푸시·소셜 로그인)에 맞춰 기술한다.
 */
import styles from './Privacy.module.css';

/** 문의 이메일 — 앱 '문의하기'와 동일 채널. 빌드 시 VITE_SUPPORT_EMAIL로 덮어쓸 수 있다. */
const CONTACT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'dkehskeh@gmail.com';

/** 최종 개정일 — 정책 변경 시 갱신한다. */
const EFFECTIVE_DATE = '2026년 7월 12일';

export default function Privacy(): React.ReactElement {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>개인정보 처리방침</h1>
        <p className={styles.meta}>시행일: {EFFECTIVE_DATE}</p>

        <p className={styles.intro}>
          뮤터(Mutter, 이하 “서비스”)는 이용자의 개인정보를 소중히 다루며 「개인정보 보호법」 등 관련
          법령을 준수합니다. 본 방침은 서비스가 어떤 정보를 수집·이용하며 어떻게 보호하는지를
          설명합니다.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. 수집하는 개인정보 항목</h2>
          <ul className={styles.list}>
            <li><strong>계정 정보</strong> — 이메일 주소, 닉네임, 로그인 제공자(Apple·Google·Kakao 또는 이메일)</li>
            <li><strong>인증 식별자</strong> — 소셜 로그인 고유 식별자, 서비스 내 사용자 ID</li>
            <li><strong>이용자 콘텐츠</strong> — 편지 본문·제목·테마 선택·첨부 음악 정보, 연결(친구) 관계</li>
            <li><strong>기기·알림 정보</strong> — 푸시 알림 토큰(FCM)</li>
            <li><strong>이용 기록</strong> — 접속 로그, 오류 로그(자동 생성)</li>
          </ul>
          <p className={styles.note}>
            카메라·마이크·위치·사진·주소록 등 기기 권한은 수집·이용하지 않습니다. Apple 로그인 시
            이메일 가리기를 선택하면 익명 릴레이 이메일이 제공될 수 있습니다.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. 이용 목적</h2>
          <ul className={styles.list}>
            <li>회원 식별 및 로그인, 계정 관리</li>
            <li>편지 작성·전달·열람 등 핵심 기능 제공</li>
            <li>연결 및 편지 발송 알림 제공</li>
            <li>서비스 운영·개선, 오류 대응 및 문의 응대</li>
            <li>부정 이용 방지 및 관련 법령상 의무 이행</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. 보유 및 이용 기간</h2>
          <ul className={styles.list}>
            <li>원칙적으로 <strong>회원 탈퇴 시 지체 없이 파기</strong>합니다.</li>
            <li>
              서비스 내 <strong>계정 삭제</strong> 실행 시 계정 정보와 이용자가 작성한 편지·연결
              정보가 삭제됩니다(상대방이 보관 중인 편지 포함).
            </li>
            <li>관련 법령에서 보관을 요구하는 경우 해당 기간 동안 보관합니다.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. 제3자 제공 및 처리위탁</h2>
          <p className={styles.paragraph}>
            서비스는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만 서비스 운영을
            위해 아래 사업자에 처리를 위탁하며, 관련 데이터는 각 사업자의 정책에 따라 처리됩니다.
          </p>
          <ul className={styles.list}>
            <li><strong>Supabase</strong> — 인증·데이터베이스·서버 인프라</li>
            <li><strong>Google(Firebase Cloud Messaging)</strong> — 푸시 알림 전송</li>
            <li><strong>Apple · Google · Kakao</strong> — 소셜 로그인 인증</li>
            <li>웹 페이지 호스팅 제공자</li>
          </ul>
          <p className={styles.note}>
            일부 수탁자는 해외에 서버를 두고 있어 개인정보가 국외로 이전·처리될 수 있습니다.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. 이용자의 권리</h2>
          <p className={styles.paragraph}>
            이용자는 언제든지 자신의 개인정보 열람·정정·삭제·처리정지를 요청할 수 있습니다. 앱 내{' '}
            <strong>프로필 &gt; 계정 삭제</strong>로 직접 탈퇴 및 데이터 삭제가 가능하며, 아래 연락처를
            통한 요청도 가능합니다.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. 안전성 확보 조치</h2>
          <ul className={styles.list}>
            <li>전송 구간 암호화(HTTPS/TLS) 적용</li>
            <li>접근 권한 통제 및 인증 토큰 보안 저장</li>
            <li>최소 수집 원칙 준수</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. 아동의 개인정보</h2>
          <p className={styles.paragraph}>
            서비스는 만 14세 미만 아동을 주 대상으로 하지 않으며, 아동의 개인정보를 알면서 수집하지
            않습니다.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. 문의처</h2>
          <p className={styles.paragraph}>
            개인정보 관련 문의는 아래 이메일로 연락해 주세요.
            <br />
            <a className={styles.link} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. 방침의 변경</h2>
          <p className={styles.paragraph}>
            본 방침은 법령·서비스 변경에 따라 개정될 수 있으며, 개정 시 서비스 내 공지 또는 본 페이지를
            통해 고지합니다.
          </p>
        </section>
      </div>
    </main>
  );
}
