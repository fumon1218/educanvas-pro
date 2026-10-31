/**
 * 판(에디션)
 *  - 전체판 (기본): 제작자가 쓰는 모든 기능
 *  - 출시판 (VITE_EDITION=lite, 주소 /educanvas-pro/lite/):
 *    저작권·상표 걱정이 있는 기능을 뺀다 — 설교 공간(성경 본문·기도 제목),
 *    Explain Everything 파일 불러오기, 노트워디(.nwc) 악보 불러오기.
 *    저장소도 전체판과 따로 쓴다.
 */
export const LITE = import.meta.env.VITE_EDITION === 'lite';
