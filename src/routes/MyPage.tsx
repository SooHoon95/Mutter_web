// 마이페이지 라우트 컴포넌트.
// 인증 가드는 router.tsx에서 RequireAuth로 처리하므로 여기서는 뷰만 렌더한다.

import { MyPageView } from '../features/profile';

export default function MyPage(): React.ReactElement {
  return <MyPageView />;
}
