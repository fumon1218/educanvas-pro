/**
 * 여러 노트에 흩어진 할 일·기도 제목을 모아 보고, 모아 보기에서 바로 체크한다.
 *   줄 형식: '☐ 보고서 초안 @김선생 ~11/5'  (☑ = 끝남, @담당, ~기한)
 */
import type { StoredProject } from './projectStore';

export interface CheckItem {
  lessonId: string; lessonName: string; sceneId: string; sceneName: string;
  objId: string; line: number; text: string; done: boolean;
  who?: string; due?: string; dueTime?: number; kind: 'todo' | 'prayer'; savedAt: string;
}

const parseDue = (s: string): number | undefined => {
  const m = s.match(/(\d{1,2})[/.](\d{1,2})/);
  if (!m) return undefined;
  const now = new Date();
  let d = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]), 23, 59);
  if (d.getTime() < now.getTime() - 180 * 864e5) d = new Date(now.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]), 23, 59);
  return d.getTime();
};

/** 노트 하나의 체크 목록 줄들 */
export function checkItemsOf(p: StoredProject, kind?: 'todo' | 'prayer'): CheckItem[] {
  const out: CheckItem[] = [];
  for (const s of p.scenes) {
    if (!s.data || !s.data.includes('"checklist"')) continue;
    let objs: any[] = [];
    try { objs = JSON.parse(s.data).objects || []; } catch { continue; }
    const walk = (list: any[]) => list.forEach(o => {
      if (o?.objects) walk(o.objects);
      if (!o?.checklist || (kind && o.checklist !== kind)) return;
      String(o.text || '').split('\n').forEach((raw: string, line: number) => {
        const body = raw.replace(/^[☐☑]\s*/, '').trim();
        if (!body || !/^[☐☑]/.test(raw)) return;
        const who = body.match(/@(\S+)/)?.[1];
        const dueRaw = body.match(/~\s*(\d{1,2}[/.]\d{1,2})/)?.[1];
        out.push({
          lessonId: p.lessonId!, lessonName: p.name, sceneId: s.id, sceneName: s.name, objId: o.id, line,
          text: body.replace(/@\S+/g, '').replace(/~\s*\d{1,2}[/.]\d{1,2}/g, '').trim() || body,
          done: raw.startsWith('☑'), who, due: dueRaw, dueTime: dueRaw ? parseDue(dueRaw) : undefined, kind: o.checklist, savedAt: p.savedAt,
        });
      });
    });
    walk(objs);
  }
  return out;
}

/** 슬라이드 데이터 안의 체크 목록 한 줄을 바꾼 새 데이터 (못 찾으면 null) */
export function setCheckInData(data: string, objId: string, line: number, checked: boolean): string | null {
  let j: any;
  try { j = JSON.parse(data); } catch { return null; }
  let hit = false;
  const walk = (list: any[]) => list?.forEach(o => {
    if (o?.objects) walk(o.objects);
    if (o?.id !== objId || !o.checklist) return;
    const lines = String(o.text).split('\n');
    if (!lines[line]) return;
    lines[line] = (checked ? '☑' : '☐') + lines[line].replace(/^[☐☑]/, '');
    o.text = lines.join('\n');
    hit = true;
  });
  walk(j.objects || []);
  return hit ? JSON.stringify(j) : null;
}
