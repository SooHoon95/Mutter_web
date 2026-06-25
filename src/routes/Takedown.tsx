/**
 * src/routes/Takedown.tsx
 *
 * T9 (US-009): 공개·무인증 저작권 신고 채널.
 *
 * 권리주장자(권리자)가 이 페이지를 통해 편지/트랙의 저작권 침해를 신고한다.
 * 신고 폼 → Supabase RPC report_takedown → takedowns 테이블 insert (익명 허용).
 *
 * 폴백: Supabase 연결 없이도 mailto: 링크로 직접 이메일 신고 안내.
 * 라이브 DB 없이도 이 페이지는 항상 공개·접근 가능해야 한다(법적 의무).
 */
import { useState } from 'react';
import { getSupabase } from '@/data/supabase';
import styles from './Takedown.module.css';

/** 신고 폼 필드 */
interface TakedownForm {
  claimant: string;
  contact: string;
  letterUrl: string;   // 대상 편지 URL (선택)
  trackRef: string;    // 대상 트랙 참조 (선택)
  reason: string;
}

const EMPTY_FORM: TakedownForm = {
  claimant: '',
  contact: '',
  letterUrl: '',
  trackRef: '',
  reason: '',
};

/** 연락처 이메일 — 폴백 mailto: 링크에도 사용.
 *  빌드 시 VITE_COPYRIGHT_EMAIL 환경 변수로 주입된다.
 *  미설정 시 mutter.app 도메인으로 폴백한다. */
const CONTACT_EMAIL =
  import.meta.env.VITE_COPYRIGHT_EMAIL || 'copyright@mutter.app';

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

export default function Takedown(): React.ReactElement {
  const [form, setForm] = useState<TakedownForm>(EMPTY_FORM);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg(null);

    // 서버 유효성 검사와 동기화: 신고 사유 최소 20자 (REASON_TOO_SHORT 방지)
    if (form.reason.trim().length < 20) {
      setStatus('error');
      setErrorMsg('신고 사유는 20자 이상 구체적으로 작성해 주세요.');
      return;
    }

    try {
      const sb = getSupabase();

      // letter_id 추출: 편지 URL에서 /l/<token> 형식의 토큰을 파싱한다.
      // RPC는 letter_id(UUID)를 받으므로, URL만 있는 경우 track_ref에 같이 포함한다.
      const { error } = await sb.rpc('report_takedown', {
        p_letter_id: null,          // 운영자가 letter_url로 식별 — 클라이언트는 UUID 불요
        p_track_ref: [form.trackRef, form.letterUrl].filter(Boolean).join(' | ') || null,
        p_claimant: form.claimant,
        p_contact: form.contact,
        p_reason: form.reason,
      });

      if (error) throw error;
      setStatus('success');
      setForm(EMPTY_FORM);
    } catch {
      // Supabase 연결 실패 또는 RPC 오류 — 이메일 안내로 폴백
      setStatus('error');
      setErrorMsg(
        `신고 전송에 실패했습니다. 직접 이메일(${CONTACT_EMAIL})로 신고해 주세요.`,
      );
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>저작권 신고 (Takedown 요청)</h1>

        {/* ── 절차 안내 ─────────────────────────────────────────── */}
        <section className={styles.section} aria-labelledby="procedure-heading">
          <h2 id="procedure-heading" className={styles.sectionTitle}>
            신고 절차
          </h2>
          <ol className={styles.steps}>
            <li>
              <strong>신고 제출</strong> — 아래 양식을 작성하거나 이메일로 신고하세요.
              권리주장자 이름, 연락처, 침해 콘텐츠 정보, 침해 사유를 포함해야 합니다.
            </li>
            <li>
              <strong>접수 확인</strong> — 영업일 기준 2일 이내에 접수 확인 이메일을 발송합니다.
            </li>
            <li>
              <strong>검토 및 조치</strong> — 정당한 신고로 판단되면 해당 편지의 오디오를
              비활성화합니다. 편지 본문은 유지됩니다.
            </li>
            <li>
              <strong>결과 통보</strong> — 처리 결과를 신고 연락처로 안내합니다.
            </li>
          </ol>
          <p className={styles.note}>
            <strong>이메일 직접 신고:</strong>{' '}
            <a className={styles.link} href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            <br />
            이메일 신고 시 아래 양식의 필드와 동일한 정보를 포함해 주세요.
          </p>
        </section>

        {/* ── 신고 폼 ──────────────────────────────────────────── */}
        <section className={styles.section} aria-labelledby="form-heading">
          <h2 id="form-heading" className={styles.sectionTitle}>
            신고 양식
          </h2>

          {status === 'success' ? (
            <div className={styles.success} role="alert">
              <p>
                <strong>신고가 접수되었습니다.</strong>
              </p>
              <p>
                영업일 기준 2일 이내에 <strong>{form.contact || '제출하신 연락처'}</strong>로
                접수 확인 연락을 드리겠습니다.
              </p>
              <button
                type="button"
                className={styles.resetBtn}
                onClick={() => setStatus('idle')}
              >
                새 신고 제출
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="claimant">
                  권리주장자 이름 또는 단체명 <span aria-hidden="true">*</span>
                </label>
                <input
                  id="claimant"
                  name="claimant"
                  type="text"
                  className={styles.input}
                  value={form.claimant}
                  onChange={handleChange}
                  required
                  autoComplete="name"
                  placeholder="홍길동 / (주)음악저작권협회"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="contact">
                  연락처 이메일 <span aria-hidden="true">*</span>
                </label>
                <input
                  id="contact"
                  name="contact"
                  type="email"
                  className={styles.input}
                  value={form.contact}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                  placeholder="claimant@example.com"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="letterUrl">
                  대상 편지 URL (선택)
                </label>
                <input
                  id="letterUrl"
                  name="letterUrl"
                  type="url"
                  className={styles.input}
                  value={form.letterUrl}
                  onChange={handleChange}
                  placeholder="https://letter-app.example.com/l/..."
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="trackRef">
                  침해 트랙 정보 (선택 — SoundCloud URL, 곡명 등)
                </label>
                <input
                  id="trackRef"
                  name="trackRef"
                  type="text"
                  className={styles.input}
                  value={form.trackRef}
                  onChange={handleChange}
                  placeholder="https://soundcloud.com/artist/track 또는 곡명"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="reason">
                  신고 사유 <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  className={styles.textarea}
                  value={form.reason}
                  onChange={handleChange}
                  required
                  minLength={20}
                  rows={5}
                  placeholder="침해 내용을 구체적으로 설명해 주세요. 귀하가 해당 저작물의 권리자임을 확인할 수 있는 정보를 포함하면 처리가 빨라집니다."
                />
                <p className={styles.fieldHint}>
                  최소 20자 이상 구체적으로 작성해 주세요.
                </p>
              </div>

              {status === 'error' && errorMsg && (
                <p className={styles.errorMsg} role="alert">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={status === 'submitting'}
              >
                {status === 'submitting' ? '전송 중…' : '신고 제출'}
              </button>
            </form>
          )}
        </section>

        {/* ── 이용 약관 요약 ────────────────────────────────────── */}
        <section className={styles.section} aria-labelledby="tos-heading">
          <h2 id="tos-heading" className={styles.sectionTitle}>
            이용 약관 요약
          </h2>
          <ul className={styles.tosList}>
            <li>
              이 서비스는 발신자가 SoundCloud의 공식 embed API를 통해 음악을 첨부하는 개인 편지
              서비스입니다. 오디오 파일을 직접 저장·배포하지 않습니다.
            </li>
            <li>
              발신자가 첨부한 SoundCloud 트랙이 저작권을 침해한다고 판단되면, 위 신고 채널을 통해
              알려주시기 바랍니다. 정당한 신고 확인 즉시 해당 편지의 오디오를 비활성화합니다.
            </li>
            <li>
              허위 신고는 민형사상 책임을 질 수 있습니다. 성실하고 정확한 신고를 부탁드립니다.
            </li>
            <li>
              서비스 문의 또는 추가 질문은{' '}
              <a className={styles.link} href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              로 연락주세요.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
