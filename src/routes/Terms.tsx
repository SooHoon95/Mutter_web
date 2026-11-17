/**
 * src/routes/Terms.tsx
 *
 * 공개·무인증 이용약관. 개인정보 처리방침(Privacy.tsx)과 같은 정적 법적 페이지이고 같은 스타일을 쓴다.
 * iOS·Android 앱의 「이용약관」도 이 페이지를 연다 — 앱에 따로 사본을 두지 않는다.
 * 기간·편지권 규칙은 서버 계약(Mutter/docs/specs/permanent-letter-contract.md)과 같아야 한다.
 * 일수(7일·30일)는 지금 서버 설정값(free_days·grace_days)이다 — 서버 설정을 바꾸면 여기도 고치고 시행일을 갱신한다.
 */
import { Link } from 'react-router-dom';
import styles from './Privacy.module.css';

/** 문의 이메일 — 앱 '문의하기'와 동일 채널. 빌드 시 VITE_SUPPORT_EMAIL로 덮어쓸 수 있다. */
const CONTACT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'musicletter2026@gmail.com';

/** 시행일 — 약관 변경 시 갱신한다. */
const EFFECTIVE_DATE = '2026년 11월 17일';

export default function Terms(): React.ReactElement {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>이용약관</h1>
        <p className={styles.meta}>시행일: {EFFECTIVE_DATE}</p>

        <p className={styles.intro}>
          이 약관은 뮤터(Mutter, 이하 “서비스”)가 제공하는 음악 편지 서비스를 이용하는 조건과 절차,
          이용자와 서비스의 권리·의무를 정합니다.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제1조 (정의)</h2>
          <ul className={styles.list}>
            <li><strong>이용자</strong> — 이 약관에 따라 서비스를 이용하는 사람. 계정을 만든 이용자를 “회원”이라 합니다.</li>
            <li><strong>편지</strong> — 회원이 작성한 제목·본문·사진·테마와 함께 고른 음악 정보.</li>
            <li><strong>링크</strong> — 편지를 열 수 있도록 서비스가 발급하는 주소.</li>
            <li><strong>편지권</strong> — 편지 한 통을 영구 편지로 만드는 데 쓰는 디지털 이용권.</li>
            <li><strong>영구 편지</strong> — 열람 기간 제한 없이 열 수 있는 편지.</li>
            <li><strong>7일 편지</strong> — 편지권 없이 무료로 보낸 편지로, 받는 분이 처음 연 날부터 7일 동안 열리는 편지.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제2조 (약관의 게시와 개정)</h2>
          <ul className={styles.list}>
            <li>서비스는 이 약관을 앱과 웹에서 언제든 볼 수 있게 게시합니다.</li>
            <li>
              약관을 바꿀 때는 시행일 7일 전부터, 이용자에게 불리한 변경은 30일 전부터 바뀌는 내용과 시행일을
              서비스 안에서 알립니다.
            </li>
            <li>바뀐 약관에 동의하지 않으면 계정을 삭제할 수 있습니다. 시행일 이후에도 계속 이용하면 동의한 것으로 봅니다.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제3조 (계정)</h2>
          <ul className={styles.list}>
            <li>회원 가입은 이메일 또는 Apple·Google·Kakao 계정으로 합니다.</li>
            <li>회원은 자신의 계정과 비밀번호를 스스로 관리하며, 다른 사람이 쓰게 해서는 안 됩니다.</li>
            <li>서비스는 만 14세 미만 아동을 대상으로 하지 않습니다.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제4조 (서비스의 내용)</h2>
          <ul className={styles.list}>
            <li>편지 작성(테마·음악 정보·사진 첨부), 링크 발급, 연결된 회원에게 보내기</li>
            <li>받은 편지함·삭제함, 받는 분이 편지를 열었을 때의 알림</li>
            <li>편지권 구매와 사용(앱에서만)</li>
          </ul>
          <p className={styles.paragraph}>
            편지 작성·보내기·읽기는 무료입니다. 편지를 기간 제한 없이 간직하려면 편지권이 필요합니다.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제5조 (편지의 열람 기간과 삭제)</h2>
          <ul className={styles.list}>
            <li>
              <strong>7일 편지</strong>는 받는 분이 처음 연 날부터 7일 동안 열리고 그 뒤에는 닫힙니다. 닫힌 뒤
              30일 동안은 보낸 사람이나 받은 사람이 편지권으로 다시 열 수 있고, 30일이 지나면 편지와 사진이
              삭제되어 되살릴 수 없습니다.
            </li>
            <li>서비스는 닫히기 전·닫힐 때·삭제되기 전에 알림을 보낼 수 있습니다. 알림을 받지 못했어도 기간은 같게 적용됩니다.</li>
            <li><strong>영구 편지</strong>는 열람 기간 제한이 없습니다.</li>
            <li>편지권 제도가 시작되기 전에 보낸 편지는 기간 제한 없이 열립니다.</li>
            <li>
              보낸 사람이 편지를 지우면 보낸 사람의 목록에서 빠지고 아직 받지 않은 사람의 링크는 닫힙니다. 이미 받은
              분의 받은 편지함에 담긴 편지는 그 분이 지울 때까지 남습니다.
            </li>
            <li>보낸 사람이 링크를 무효화하면 받은 사람도 그 링크로는 편지를 열 수 없습니다.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제6조 (편지권)</h2>
          <ul className={styles.list}>
            <li>편지권은 iOS·Android 앱에서 App Store 또는 Google Play의 인앱 결제로 구매합니다. 웹에서는 구매할 수 없습니다.</li>
            <li>가격은 구매 화면에 표시되며, 결제가 끝나면 바로 회원 계정에 지급됩니다.</li>
            <li>
              편지권은 영구 편지로 링크를 만들거나 보낼 때, 이미 보낸 편지를 영구 편지로 만들 때, 받은 편지를
              간직할 때 1장씩 쓰입니다. 편지 한 통에는 한 번만 쓰이고, 쓰면 그 편지는 보낸 사람과 받은 사람
              모두에게 영구 편지가 됩니다.
            </li>
            <li>편지권에는 유효기간이 없습니다. 다른 계정으로 넘기거나 현금으로 바꿀 수 없습니다.</li>
            <li>계정을 삭제하면 남은 편지권은 사라지며 되살릴 수 없습니다.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제7조 (환불)</h2>
          <ul className={styles.list}>
            <li>
              편지권은 결제가 끝나는 즉시 계정에 지급되어 바로 쓸 수 있는 디지털 콘텐츠입니다. 「전자상거래 등에서의
              소비자보호에 관한 법률」 제17조 제2항 제5호에 따라 구매한 편지권은 사용 여부와 관계없이
              청약철회(환불)가 되지 않으며, 서비스는 구매 화면에 이를 미리 알립니다.
            </li>
            <li>
              미성년자가 법정대리인의 동의 없이 결제한 경우에는 관계 법령에 따라 결제를 취소할 수 있습니다. 이때는
              해당 스토어 또는 아래 문의 이메일로 요청해 주세요.
            </li>
            <li>
              App Store 또는 Google Play가 자체 정책에 따라 결제를 환불한 경우, 환불된 장수만큼 편지권이 회수됩니다.
              이미 사용한 편지권이 환불되면 보유 편지권이 0장보다 적어질 수 있고, 그동안은 편지권을 쓸 수 없습니다.
              이미 영구 편지가 된 편지는 되돌리지 않습니다.
            </li>
            <li>서비스의 오류로 편지권이 지급되지 않았거나 잘못 사용된 경우 문의해 주시면 확인한 뒤 지급하거나 되돌립니다.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제8조 (이용자의 의무)</h2>
          <p className={styles.paragraph}>이용자는 다음 행위를 해서는 안 됩니다.</p>
          <ul className={styles.list}>
            <li>다른 사람의 정보나 계정을 도용하는 행위</li>
            <li>불법이거나 음란·폭력·혐오·괴롭힘에 해당하는 내용을 보내는 행위</li>
            <li>다른 사람의 저작권·초상권·개인정보 등 권리를 침해하는 행위</li>
            <li>자동화된 방법으로 접근하거나 서비스의 정상적인 운영을 방해하는 행위</li>
            <li>결제를 우회하거나 부정한 환불을 반복하는 등 부정한 방법으로 편지권을 얻는 행위</li>
          </ul>
          <p className={styles.paragraph}>
            이를 어기면 서비스는 해당 편지의 열람을 제한하거나 이용을 정지하거나 계정을 삭제할 수 있습니다.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제9조 (콘텐츠의 권리)</h2>
          <ul className={styles.list}>
            <li>편지에 대한 권리는 작성한 이용자에게 있습니다. 서비스는 편지를 저장·전달·표시하는 데 필요한 범위에서만 이용합니다.</li>
            <li>
              음악은 SoundCloud 등 외부 서비스의 공식 재생 기능으로 재생되며, 서비스는 음원을 저장하거나 배포하지
              않습니다. 음악에 대한 권리는 각 권리자에게 있습니다.
            </li>
            <li>
              권리 침해가 우려되면 <Link className={styles.link} to="/legal/takedown">저작권 신고</Link>로 알려
              주세요.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제10조 (서비스의 변경과 중단)</h2>
          <ul className={styles.list}>
            <li>서비스는 운영이나 기술상 필요에 따라 기능을 바꿀 수 있으며, 중요한 변경은 미리 알립니다.</li>
            <li>점검·장애·천재지변 등으로 서비스가 일시적으로 중단될 수 있습니다.</li>
            <li>서비스를 종료할 때는 30일 전에 알리고, 남은 편지권의 처리 방법을 관계 법령에 따라 안내합니다.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제11조 (계정 삭제)</h2>
          <p className={styles.paragraph}>
            회원은 앱의 <strong>프로필 &gt; 계정 삭제</strong> 또는 웹의 마이페이지에서 언제든 계정을 삭제할 수
            있습니다. 삭제하면 계정 정보와 작성한 편지·연결 정보, 남은 편지권이 삭제됩니다. 이미 받은 분의 받은
            편지함에 담긴 편지는 남으며, 보낸 사람은 「탈퇴한 사용자」로 표시됩니다. 자세한 내용은{' '}
            <Link className={styles.link} to="/legal/privacy">개인정보 처리방침</Link>을 따릅니다.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제12조 (책임의 제한)</h2>
          <ul className={styles.list}>
            <li>편지의 내용에 대한 책임은 작성한 이용자에게 있습니다.</li>
            <li>이용자가 링크나 암호를 다른 사람에게 알려 생긴 결과에 대해서는 서비스의 고의 또는 중대한 과실이 없는 한 책임지지 않습니다.</li>
            <li>서비스는 고의 또는 중대한 과실이 없는 한 천재지변 등 불가항력으로 생긴 손해에 대해 책임지지 않습니다.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제13조 (문의와 분쟁 해결)</h2>
          <p className={styles.paragraph}>
            서비스 이용에 관한 문의는 아래 이메일로 연락해 주세요.
            <br />
            <a className={styles.link} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
          <p className={styles.paragraph}>
            이 약관은 대한민국 법률을 따르며, 서비스 이용과 관련한 분쟁은 「민사소송법」에 따른 관할 법원에서
            해결합니다.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>부칙</h2>
          <p className={styles.paragraph}>이 약관은 {EFFECTIVE_DATE}부터 시행합니다.</p>
        </section>
      </div>
    </main>
  );
}
