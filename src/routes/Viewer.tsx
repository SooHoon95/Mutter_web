import { useParams } from 'react-router-dom';

export default function Viewer() {
  const { token } = useParams<{ token: string }>();
  // 무설치 수신 웹뷰 + 스크롤 동기 재생은 T8(US-008)에서 구현한다.
  // 이 경로는 인증에 의존하지 않는다(인코그니토 OK).
  return (
    <main className="page">
      <h1>편지</h1>
      <p>수신 웹뷰 (구현 예정: T8) — token: {token}</p>
    </main>
  );
}
