/**
 * 학생 학습 도구
 *  - 오답 노트: 잘라 낸 문제를 '오답 노트' 수업에 슬라이드로 모은다
 *  - 공부 기록: 수업을 실제로 보고 쓴 시간(1분 단위)과 집중 타이머 횟수
 *  - 학생 모드
 * 모두 이 기기 안에만 저장한다.
 */
import * as fabric from 'fabric';
import { serializeCanvas } from './canvasData';
import { loadLesson, saveProject, type StoredProject } from './projectStore';
import { storeName } from './testMode';

// ---------------------------------------------------------------------------
// 오답 노트
// ---------------------------------------------------------------------------

export const WRONG_NOTE_ID = 'okssam-wrong-notes';
export const WRONG_NOTE_NAME = '오답 노트';
const KFONT = "'Pretendard', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const newId = () => Math.random().toString(36).slice(2, 11);

/** 오답 한 장: 위에 꼬리표(과목·단원·출처·날짜), 가운데 문제 그림, 아래 메모 */
export async function createClipScene(dataUrl: string, info: { tag: string; memo: string; source: string }, width = 1280, height = 760): Promise<string> {
  const el = document.createElement('canvas');
  const sc = new fabric.StaticCanvas(el, { width, height, enableRetinaScaling: false });
  const head = new fabric.FabricText(`${info.tag ? `#${info.tag}  ·  ` : ''}${info.source}  ·  ${new Date().toLocaleDateString('ko-KR')}`, {
    left: 190, top: 40, originX: 'left', originY: 'top', fontSize: 22, fill: '#b91c1c', fontWeight: 'bold', fontFamily: KFONT,
  });
  (head as any).id = newId();
  sc.add(head);
  const img = await fabric.FabricImage.fromURL(dataUrl);
  // 왼쪽 도구 막대·아래 슬라이드 막대에 가리지 않게 여백을 둔다
  const maxW = width - 260, maxH = height - (info.memo ? 300 : 240);
  img.scale(Math.min(maxW / img.width, maxH / img.height, 1.5));
  img.set({
    left: 190, top: 90, originX: 'left', originY: 'top',
    stroke: '#ef4444', strokeWidth: 3, strokeUniform: true,
    shadow: new fabric.Shadow({ color: 'rgba(15,23,42,0.2)', blur: 18, offsetX: 0, offsetY: 5 }),
    selectable: false, evented: false, lockMovementX: true, lockMovementY: true,
  });
  (img as any).id = newId();
  (img as any).locked = true;
  (img as any).isBackground = true;
  sc.add(img);
  if (info.memo) {
    const memo = new fabric.Textbox(`메모: ${info.memo}`, { left: 190, top: 90 + img.getScaledHeight() + 20, width: maxW, originX: 'left', originY: 'top', fontSize: 22, fill: '#334155', fontFamily: KFONT });
    (memo as any).id = newId();
    sc.add(memo);
  }
  const out = serializeCanvas(sc);
  sc.dispose();
  return out;
}

/** 오답 노트 수업에 한 장 더한다 (지금 여는 수업이 아니어도). 몇 번째인지 돌려준다 */
export async function addToWrongNote(sceneData: string, title: string): Promise<number> {
  const now = new Date().toISOString();
  const existing = await loadLesson(WRONG_NOTE_ID);
  const scene = { id: newId(), name: title.slice(0, 100) || '오답', data: sceneData };
  const p: StoredProject = existing
    ? { ...existing, scenes: [...existing.scenes, scene], savedAt: now }
    : { format: 'educanvas-project', version: 1, name: WRONG_NOTE_NAME, savedAt: now, activeSceneId: scene.id, canvasBackground: 'blank', scenes: [scene], lessonId: WRONG_NOTE_ID, category: WRONG_NOTE_NAME, space: 'student' };
  await saveProject(p, { touchLast: false });
  return p.scenes.length;
}

// ---------------------------------------------------------------------------
// 공부 기록
// ---------------------------------------------------------------------------

export interface DayLog { minutes: number; focus: number; lessons: Record<string, { name: string; minutes: number }> }
const LOG_KEY = storeName('okssam_study_log');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const readLog = (): Record<string, DayLog> => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}'); } catch { return {}; } };
const writeLog = (l: Record<string, DayLog>) => {
  // 180일만 남긴다
  const keys = Object.keys(l).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 180))) delete l[k];
  try { localStorage.setItem(LOG_KEY, JSON.stringify(l)); } catch { /* 무시 */ }
};

/** 1분 공부 (수업이 보이고, 2분 안에 무언가를 했을 때 App이 부른다) */
export function addStudyMinute(lessonId: string, name: string) {
  const l = readLog();
  const k = dayKey();
  const d = l[k] || (l[k] = { minutes: 0, focus: 0, lessons: {} });
  d.minutes += 1;
  const e = d.lessons[lessonId] || (d.lessons[lessonId] = { name, minutes: 0 });
  e.name = name; e.minutes += 1;
  writeLog(l);
}

export function addFocusSession() {
  const l = readLog();
  const k = dayKey();
  (l[k] || (l[k] = { minutes: 0, focus: 0, lessons: {} })).focus += 1;
  writeLog(l);
}

export function lastDays(n: number): { key: string; label: string; log: DayLog }[] {
  const l = readLog();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    out.push({ key: k, label: i === 0 ? '오늘' : `${d.getMonth() + 1}/${d.getDate()}`, log: l[k] || { minutes: 0, focus: 0, lessons: {} } });
  }
  return out;
}

export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);

// ---------------------------------------------------------------------------
// 플래시카드(가림 카드) 복습: 상자 단계별 다음 복습일
// ---------------------------------------------------------------------------

/** 1단계: 오늘 다시, 2: 1일, 3: 3일, 4: 7일, 5: 16일 뒤 */
export const BOX_DAYS = [0, 0, 1, 3, 7, 16];
export const nextDue = (box: number) => Date.now() + BOX_DAYS[Math.min(5, Math.max(1, box))] * 864e5;

// ---------------------------------------------------------------------------
// 학생 모드
// ---------------------------------------------------------------------------

const MODE_KEY = 'okssam_student_mode';
export const initialStudentMode = () => {
  try {
    const q = new URLSearchParams(window.location.search).get('mode');
    if (q === 'student') { localStorage.setItem(MODE_KEY, '1'); return true; }
    if (q === 'teacher') { localStorage.removeItem(MODE_KEY); return false; }
    return localStorage.getItem(MODE_KEY) === '1';
  } catch { return false; }
};
export const saveStudentMode = (on: boolean) => { try { if (on) localStorage.setItem(MODE_KEY, '1'); else localStorage.removeItem(MODE_KEY); } catch { /* 무시 */ } };
