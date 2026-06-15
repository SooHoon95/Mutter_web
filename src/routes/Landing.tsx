import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <main className="page">
      <h1>연출되는 편지</h1>
      <p>읽는 순간을 연출하는 편지. 설치 없이 링크 하나로 전합니다.</p>
      <Link className="cta" to="/create">
        편지 쓰기
      </Link>
    </main>
  );
}
