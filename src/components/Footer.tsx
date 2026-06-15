/**
 * src/components/Footer.tsx
 *
 * 공통 푸터 — 저작권 신고 링크 + 간단 이용 약관 문구.
 * 제작 셸(AppShell)과 수신 뷰(LetterView) 양쪽에 노출된다.
 *
 * T9 (US-009): 법적 안전장치 — 권리주장자가 신고 경로를 쉽게 찾을 수 있어야 한다.
 */
import styles from './Footer.module.css';

export function Footer(): React.ReactElement {
  return (
    <footer className={styles.footer}>
      <p className={styles.tos}>
        이 서비스를 이용함으로써{' '}
        <a className={styles.link} href="/legal/takedown">
          이용 약관 및 저작권 정책
        </a>
        에 동의합니다.
      </p>
      <p className={styles.copy}>
        저작권 침해가 우려되는 경우{' '}
        <a className={styles.link} href="/legal/takedown">
          저작권 신고
        </a>
        를 통해 알려주세요.
      </p>
    </footer>
  );
}
