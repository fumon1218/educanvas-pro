/**
 * 시험 모드 (주소 끝에 ?test=1)
 *
 * 앱을 시험할 때 선생님의 실제 수업을 절대 건드리지 않게 한다.
 * - 이 브라우저 저장소를 실제 수업과 다른 칸(educanvas-test 등)에 쓴다.
 * - 구글 드라이브 동기화는 켜지지 않는다.
 * - 화면 위에 '시험 모드' 띠를 보여 준다.
 * 한 번 들어오면 그 탭을 닫을 때까지 유지된다(새로 고침해도 시험 모드).
 */
const detect = () => {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('test')) { sessionStorage.setItem('okssam_test_mode', '1'); return true; }
    return sessionStorage.getItem('okssam_test_mode') === '1';
  } catch { return false; }
};

export const TEST_MODE = typeof window !== 'undefined' && detect();

/** 저장소 이름: 출시판·시험 모드면 따로 */
const LITE = import.meta.env.VITE_EDITION === 'lite';
export const storeName = (name: string) => `${name}${LITE ? '-lite' : ''}${TEST_MODE ? '-test' : ''}`;
