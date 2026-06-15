import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="page">
      <h1>찾을 수 없어요</h1>
      <Link to="/">처음으로</Link>
    </main>
  );
}
