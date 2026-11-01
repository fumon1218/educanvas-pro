/**
 * 교양 카드 학습 — 학습 자료 불러오기 · 외운 항목 기록
 *  학습 자료 파일: public/culture/study-data.json (Edu-Scheduler Premium '교양'에서 옮겨 옴)
 *  외운 항목은 이 브라우저(localStorage)에만 저장한다.
 */
import { useCallback, useEffect, useState } from 'react';

export interface Saja { id: string; no: number; h: string; r: string; st: number; hun: string[]; g: string[]; m: string; n: string }
export interface Cheonja { id: string; h: string; r: string; m: string }
export interface Hanja { id: string; c: string; hun: string; e: string; jp: string }
export interface EnWord { id: string; w: string; d: string; k: string }
export interface EsSentence { id: string; t: string; p: string; k: string; n: string }
export interface EsWord { id: string; w: string; k: string; c: string }
export interface JaSentence { id: string; t: string; kana: string; p: string; k: string; n: string }
export interface LawArticle { id: string; no: string; t: string; ch: string; x: string }
export interface StudyData { saja: Saja[]; cheonja: Cheonja[]; hanja: Hanja[]; en: EnWord[]; es: EsSentence[]; esw: EsWord[]; ja: JaSentence[]; law: LawArticle[] }

let cache: StudyData | null = null;
let pending: Promise<StudyData> | null = null;
export function loadStudyData(): Promise<StudyData> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}culture/study-data.json`)
      .then(r => { if (!r.ok) throw new Error('학습 자료 파일을 찾을 수 없습니다.'); return r.json(); })
      .then((d: StudyData) => { cache = d; return d; })
      .catch(e => { pending = null; throw e; });
  }
  return pending;
}

export function useStudyData() {
  const [data, setData] = useState<StudyData | null>(cache);
  const [error, setError] = useState('');
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    setError('');
    loadStudyData().then(d => { if (alive) setData(d); }).catch(e => { if (alive) setError(String(e?.message || e)); });
    return () => { alive = false; };
  }, [tries]);
  return { data, error, retry: () => setTries(t => t + 1) };
}

// ---------------------------------------------------------------------
// 외운 항목 (덱마다 id 목록)
// ---------------------------------------------------------------------
const KNOWN_KEY = 'okssam_culture_known';
type KnownMap = Record<string, string[]>;
const readKnown = (): KnownMap => { try { return JSON.parse(localStorage.getItem(KNOWN_KEY) || '{}') || {}; } catch { return {}; } };

export function useKnown() {
  const [map, setMap] = useState<KnownMap>(readKnown);
  const setKnown = useCallback((deck: string, id: string, v: boolean) => {
    setMap(prev => {
      const cur = new Set(prev[deck] || []);
      if (v) cur.add(id); else cur.delete(id);
      const next = { ...prev, [deck]: Array.from(cur) };
      try { localStorage.setItem(KNOWN_KEY, JSON.stringify(next)); } catch { /* 저장 공간이 없으면 이번 화면에서만 */ }
      return next;
    });
  }, []);
  const knownSet = (deck: string) => new Set(map[deck] || []);
  return { knownSet, setKnown, count: (deck: string) => (map[deck] || []).length };
}

// ---------------------------------------------------------------------
// 소리 내어 읽기 (브라우저 음성 합성)
// ---------------------------------------------------------------------
export type Voice = 'en-US' | 'ja-JP' | 'es-ES';
export function speak(text: string, lang: Voice): boolean {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return false;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = lang === 'en-US' ? 0.9 : 0.85;
    const v = synth.getVoices().find(x => x.lang.replace('_', '-').startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    synth.speak(u);
    return true;
  } catch { return false; }
}
