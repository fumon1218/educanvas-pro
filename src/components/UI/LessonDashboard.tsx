import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, Plus, Star, Folder, FolderPlus, Trash2, Clock, LayoutGrid, Cloud, CloudOff, HardDrive, MoreHorizontal,
  Copy, Pencil, History, RotateCcw, FileUp, Check, Loader2, Tag, ArrowDownAZ, CalendarClock, CalendarDays, ListChecks,
  HeartHandshake, Lock, LockOpen, FileDown, Presentation, GraduationCap, BookOpen, Briefcase, ChevronLeft, ChevronRight, ArrowRightLeft, BookmarkPlus,
} from 'lucide-react';
import {
  listLibrary, updateLesson, deleteLessonForever, duplicateLesson, renameCategory, setCategories, spaceOf, SPACES,
  type LibraryEntry, type Space,
} from '@/src/lib/projectStore';
import { templatesFor, type TemplateDef } from '@/src/lib/templates';
import type { CheckItem } from '@/src/lib/noteOps';
import type { DriveLesson } from '@/src/lib/driveSync';
import { TEST_MODE } from '@/src/lib/testMode';
import { cn } from '@/src/lib/utils';

type View =
  | { kind: 'all' } | { kind: 'fav' } | { kind: 'recent' } | { kind: 'cat'; name: string } | { kind: 'none' }
  | { kind: 'trash' } | { kind: 'drive' } | { kind: 'calendar' } | { kind: 'checks'; check: 'todo' | 'prayer' };

const SPACE_ICON: Record<Space, React.ElementType> = { lesson: Presentation, student: GraduationCap, sermon: BookOpen, work: Briefcase };
const SPACE_TINT: Record<Space, string> = { lesson: 'text-indigo-600', student: 'text-emerald-600', sermon: 'text-amber-600', work: 'text-sky-600' };

const when = (iso: string) => {
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateOf = (l: LibraryEntry) => l.noteDate || ymd(new Date(l.createdAt));

const newLessonId = () => (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
const SPACE_KEY = 'okssam_space';
const loadSpace = (fallback: Space): Space => { try { const v = localStorage.getItem(SPACE_KEY) as Space | null; return v && SPACES.some(s => s.id === v) ? v : fallback; } catch { return fallback; } };

export interface LessonDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  currentLessonId: string;
  /** 학생 모드면 처음에 '학생' 공간 */
  defaultSpace?: Space;
  onCurrentRenamed: (name: string) => void;
  onCurrentCategory: (category: string | undefined) => void;
  onCurrentSpace: (space: Space) => void;
  /** 지금 수업을 먼저 저장 (목록을 열 때 최신으로) */
  saveCurrent: () => Promise<void>;
  onOpen: (id: string) => void;
  onNew: (opts: { category?: string; space: Space; template: TemplateDef }) => void;
  onOpenWrongNote: () => void;
  onImportFile: () => void;
  onShowHistory: (lessonId: string) => void;
  onCurrentTrashed: () => void;
  onExport: (id: string, format: 'hwpx' | 'docx') => void;
  onLock: (id: string) => Promise<void>;
  onUnlock: (id: string) => Promise<void>;
  /** 공간의 할 일·기도 제목 모으기 / 체크 */
  listChecks: (space: Space, kind: 'todo' | 'prayer') => Promise<CheckItem[]>;
  toggleCheck: (item: CheckItem, checked: boolean) => Promise<void>;
  drive: {
    on: boolean;
    state: string;
    enable: () => Promise<boolean>;
    disable: () => void;
    list: () => Promise<DriveLesson[]>;
    open: (l: DriveLesson) => void;
  };
}

export const LessonDashboard: React.FC<LessonDashboardProps> = (props) => {
  const { isOpen, onClose, currentLessonId, drive } = props;
  const [lessons, setLessons] = useState<LibraryEntry[] | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [space, setSpaceState] = useState<Space>(() => loadSpace(props.defaultSpace || 'lesson'));
  const [view, setView] = useState<View>({ kind: 'all' });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [sub, setSub] = useState<'cat' | 'space' | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [editCat, setEditCat] = useState<string | null>(null);
  const [pickTemplate, setPickTemplate] = useState(false);
  const [driveList, setDriveList] = useState<DriveLesson[] | null>(null);
  const [driveErr, setDriveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [checks, setChecks] = useState<CheckItem[] | null>(null);
  const [showDone, setShowDone] = useState(false);

  const setSpace = (s: Space) => { setSpaceState(s); setView({ kind: 'all' }); try { localStorage.setItem(SPACE_KEY, s); } catch { /* 무시 */ } };

  const refresh = useCallback(async () => {
    const lib = await listLibrary();
    setLessons(lib.lessons);
    setCats(lib.categories.sort((a, b) => a.localeCompare(b, 'ko')));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setLessons(null); setMenuFor(null); setRenaming(null); setPickTemplate(false);
    props.saveCurrent().catch(() => {}).finally(() => { refresh().catch(() => setLessons([])); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadDrive = useCallback(async () => {
    if (!drive.on) return;
    setDriveErr(null);
    try { setDriveList(await drive.list()); }
    catch (e: any) { setDriveErr(e?.message || '드라이브 목록을 불러오지 못했습니다.'); }
  }, [drive]);
  useEffect(() => { if (isOpen && view.kind === 'drive') loadDrive(); }, [isOpen, view.kind, loadDrive]);

  const loadChecks = useCallback(async () => {
    if (view.kind !== 'checks') return;
    setChecks(null);
    try { setChecks(await props.listChecks(space, view.check)); } catch { setChecks([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, space]);
  useEffect(() => { if (isOpen) void loadChecks(); }, [isOpen, loadChecks]);

  useEffect(() => {
    if (!menuFor && !pickTemplate) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('[data-card-menu]')) { setMenuFor(null); setSub(null); setPickTemplate(false); } };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuFor, pickTemplate]);

  const all = lessons || [];
  const inSpace = all.filter(l => spaceOf(l) === space);
  const live = inSpace.filter(l => !l.trashedAt);
  const trash = all.filter(l => l.trashedAt);
  const count = (f: (l: LibraryEntry) => boolean) => live.filter(f).length;
  const spaceCats = cats.filter(c => inSpace.some(l => l.category === c) || !all.some(l => l.category === c));
  const k = q.trim().toLowerCase();

  const shown = useMemo(() => {
    // 찾기는 모든 공간에서 (어느 공간의 노트인지 표시)
    let list = k ? all.filter(l => !l.trashedAt) : view.kind === 'trash' ? trash : live;
    if (!k) {
      if (view.kind === 'fav') list = list.filter(l => l.favorite);
      if (view.kind === 'cat') list = list.filter(l => l.category === view.name);
      if (view.kind === 'none') list = list.filter(l => !l.category);
      if (view.kind === 'recent') list = list.filter(l => Date.now() - Date.parse(l.savedAt) < 7 * 864e5);
    } else list = list.filter(l => l.name.toLowerCase().includes(k) || (l.category || '').toLowerCase().includes(k) || (l.text || '').toLowerCase().includes(k));
    return [...list].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : Date.parse(b.savedAt) - Date.parse(a.savedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, view, q, sort, space]);

  const snippet = (l: LibraryEntry) => {
    if (!k || !l.text || l.name.toLowerCase().includes(k)) return null;
    const i = l.text.toLowerCase().indexOf(k);
    if (i < 0) return null;
    return '…' + l.text.slice(Math.max(0, i - 18), i + k.length + 30) + '…';
  };

  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); await refresh(); } finally { setBusy(false); } };
  const closeMenus = () => { setMenuFor(null); setSub(null); };

  const rename = (l: LibraryEntry, name: string) => act(async () => {
    const n = name.trim().slice(0, 100);
    setRenaming(null);
    if (!n || n === l.name) return;
    await updateLesson(l.id, { name: n });
    if (l.id === currentLessonId) props.onCurrentRenamed(n);
  });
  const moveTo = (l: LibraryEntry, category: string) => act(async () => {
    closeMenus();
    await updateLesson(l.id, { category });
    if (l.id === currentLessonId) props.onCurrentCategory(category || undefined);
  });
  const moveSpace = (l: LibraryEntry, s: Space) => act(async () => {
    closeMenus();
    await updateLesson(l.id, { space: s });
    if (l.id === currentLessonId) props.onCurrentSpace(s);
  });
  const toTrash = (l: LibraryEntry) => act(async () => {
    closeMenus();
    await updateLesson(l.id, { trashedAt: new Date().toISOString() });
    if (l.id === currentLessonId) props.onCurrentTrashed();
  });
  const addCategory = (name: string) => act(async () => {
    const n = name.trim().slice(0, 40);
    setNewCat(null);
    if (!n || cats.includes(n)) return;
    await setCategories([...cats, n]);
    setView({ kind: 'cat', name: n });
  });
  const changeCategory = (from: string, to: string) => act(async () => {
    setEditCat(null);
    const n = to.trim().slice(0, 40);
    if (n === from) return;
    await renameCategory(from, n);
    if (view.kind === 'cat' && view.name === from) setView(n ? { kind: 'cat', name: n } : { kind: 'all' });
  });

  const spaceLabel = SPACES.find(s => s.id === space)!.label;
  const title = k ? `'${q.trim()}' 찾기 (모든 공간)` :
    view.kind === 'all' ? `${spaceLabel} · 전체` : view.kind === 'fav' ? '즐겨찾기' : view.kind === 'recent' ? '최근 7일' :
    view.kind === 'cat' ? view.name : view.kind === 'none' ? '분류 없음' : view.kind === 'trash' ? '휴지통' : view.kind === 'calendar' ? '달력' :
    view.kind === 'checks' ? (view.check === 'todo' ? '할 일 모아 보기' : '기도 제목 모아 보기') : '구글 드라이브';

  const NavBtn: React.FC<{ v: View; icon: React.ElementType; label: string; n?: number }> = ({ v, icon: Icon, label, n }) => {
    const on = view.kind === v.kind && (v.kind !== 'cat' || (view.kind === 'cat' && view.name === (v as any).name)) && (v.kind !== 'checks' || (view.kind === 'checks' && view.check === (v as any).check));
    return (
      <button onClick={() => { setView(v); setQ(''); }} className={cn('w-auto md:w-full h-9 px-3 rounded-xl flex items-center gap-2.5 text-[13.5px] text-left shrink-0 whitespace-nowrap', on ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-100')}>
        <Icon size={16} className="shrink-0" /><span className="flex-1 truncate">{label}</span>{n !== undefined && <span className="text-[12px] text-slate-400">{n}</span>}
      </button>
    );
  };

  const localIds = new Set(all.map(l => l.id));
  const gridView = !k ? !['drive', 'calendar', 'checks'].includes(view.kind) : true;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div
            role="dialog" aria-modal="true" aria-label="내 노트"
            initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }}
            className="relative w-full max-w-6xl h-full sm:h-[min(92vh,840px)] flex flex-col md:flex-row bg-white sm:rounded-3xl shadow-2xl ring-1 ring-black/5 overflow-hidden"
          >
            {/* 왼쪽: 공간 · 분류 */}
            <aside className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/60 flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-4 md:px-5 pt-3 md:pt-5 pb-2">
                <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600"><LayoutGrid size={18} /></div>
                <h2 className="text-lg font-bold text-slate-900 flex-1">내 노트</h2>
                <button onClick={onClose} className="md:hidden p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
              </div>
              {/* 공간 */}
              <div className="px-3 pb-2 grid grid-cols-4 gap-1" role="tablist" aria-label="공간">
                {SPACES.map(s => {
                  const Icon = SPACE_ICON[s.id];
                  const n = all.filter(l => !l.trashedAt && spaceOf(l) === s.id).length;
                  return (
                    <button key={s.id} role="tab" aria-selected={space === s.id} onClick={() => { setSpace(s.id); setQ(''); }}
                      className={cn('h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold', space === s.id ? 'bg-white shadow-sm ring-1 ring-slate-200 text-slate-900' : 'text-slate-500 hover:bg-white/70')}>
                      <Icon size={17} className={space === s.id ? SPACE_TINT[s.id] : ''} />{s.label}<span className="text-[10.5px] font-normal text-slate-400 -mt-0.5">{n}</span>
                    </button>
                  );
                })}
              </div>
              <nav className="flex md:flex-col gap-1 px-2 md:px-3 py-1 overflow-x-auto md:overflow-y-auto md:flex-1">
                <NavBtn v={{ kind: 'all' }} icon={LayoutGrid} label="전체" n={live.length} />
                <NavBtn v={{ kind: 'fav' }} icon={Star} label="즐겨찾기" n={count(l => !!l.favorite)} />
                <NavBtn v={{ kind: 'recent' }} icon={Clock} label="최근 7일" />
                <NavBtn v={{ kind: 'calendar' }} icon={CalendarDays} label="달력" />
                {space === 'work' && <NavBtn v={{ kind: 'checks', check: 'todo' }} icon={ListChecks} label="할 일 모아 보기" />}
                {space === 'sermon' && <NavBtn v={{ kind: 'checks', check: 'prayer' }} icon={HeartHandshake} label="기도 제목 모아 보기" />}
                {space === 'student' && <button onClick={props.onOpenWrongNote} className="w-auto md:w-full h-9 px-3 rounded-xl flex items-center gap-2.5 text-[13.5px] text-left shrink-0 whitespace-nowrap text-slate-600 hover:bg-slate-100"><BookmarkPlus size={16} />오답 노트</button>}
                <div className="hidden md:flex items-center justify-between mt-4 mb-1 px-3 text-[11.5px] font-semibold text-slate-400">
                  <span>분류</span>
                  <button onClick={() => setNewCat('')} className="p-1 rounded-md hover:bg-slate-200 text-slate-500" aria-label="새 분류" title="새 분류"><FolderPlus size={14} /></button>
                </div>
                {spaceCats.map(c => editCat === c ? (
                  <input key={c} autoFocus defaultValue={c} aria-label="분류 이름"
                    onBlur={e => changeCategory(c, e.currentTarget.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditCat(null); }}
                    className="h-9 px-3 rounded-xl ring-2 ring-indigo-300 text-[13.5px] outline-none shrink-0" />
                ) : (
                  <div key={c} className="group relative shrink-0 w-auto md:w-full">
                    <NavBtn v={{ kind: 'cat', name: c }} icon={Folder} label={c} n={count(l => l.category === c)} />
                    <button onClick={() => setEditCat(c)} className="hidden md:group-hover:flex absolute right-8 top-1.5 p-1 rounded-md text-slate-400 hover:bg-slate-200" aria-label={`${c} 이름 바꾸기`} title="분류 이름 바꾸기 (비우면 분류 지우기)"><Pencil size={12} /></button>
                  </div>
                ))}
                {newCat !== null ? (
                  <input autoFocus placeholder="예: 로마서 강해" aria-label="새 분류 이름"
                    onBlur={e => addCategory(e.currentTarget.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setNewCat(null); }}
                    className="h-9 px-3 rounded-xl ring-2 ring-indigo-300 text-[13.5px] outline-none shrink-0" />
                ) : (
                  <button onClick={() => setNewCat('')} className="md:hidden h-9 px-3 rounded-xl text-[13px] text-slate-500 flex items-center gap-1.5 shrink-0 whitespace-nowrap"><FolderPlus size={15} />새 분류</button>
                )}
                {live.some(l => !l.category) && spaceCats.length > 0 && <NavBtn v={{ kind: 'none' }} icon={Tag} label="분류 없음" n={count(l => !l.category)} />}
                <div className="hidden md:block h-px bg-slate-200 my-3 mx-3" />
                <NavBtn v={{ kind: 'drive' }} icon={Cloud} label="구글 드라이브" />
                <NavBtn v={{ kind: 'trash' }} icon={Trash2} label="휴지통" n={trash.length || undefined} />
              </nav>
              <div className="hidden md:block m-3 p-3 rounded-2xl bg-white ring-1 ring-slate-200 text-[12px] leading-relaxed text-slate-600">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800"><HardDrive size={14} />저장 위치</div>
                <p className="mt-1">이 컴퓨터의 이 브라우저 안 (자동 저장){TEST_MODE && <b className="text-red-600"> · 시험 모드 저장소</b>}</p>
                <p className="mt-1 flex items-center gap-1">
                  {drive.on ? <><Cloud size={13} className="text-sky-600" />구글 드라이브 '옥쌤보드' 폴더에도 저장</> : <><CloudOff size={13} />구글 드라이브: 꺼짐</>}
                </p>
                {!drive.on && <button onClick={() => setView({ kind: 'drive' })} className="mt-1.5 text-sky-700 font-semibold">다른 기기와 함께 쓰기 →</button>}
              </div>
            </aside>

            {/* 오른쪽 */}
            <section className="flex-1 min-w-0 min-h-0 flex flex-col">
              <header className="flex flex-wrap items-center gap-2 px-3 sm:px-5 py-3 border-b border-slate-100">
                <h3 className="text-[17px] font-bold text-slate-900 mr-auto truncate max-w-full">{title}</h3>
                <label className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름·분류·내용 찾기" aria-label="노트 찾기" className="h-9 w-40 sm:w-56 pl-8 pr-3 rounded-xl bg-slate-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" />
                </label>
                {gridView && (
                  <button onClick={() => setSort(s => (s === 'recent' ? 'name' : 'recent'))} className="h-9 px-3 rounded-xl bg-slate-100 text-slate-600 text-[13px] flex items-center gap-1.5" title="정렬 바꾸기">
                    {sort === 'recent' ? <><CalendarClock size={15} /><span className="hidden sm:inline">최근 순</span></> : <><ArrowDownAZ size={15} /><span className="hidden sm:inline">이름 순</span></>}
                  </button>
                )}
                <button onClick={props.onImportFile} className="h-9 px-3 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold flex items-center gap-1.5" title="내보낸 수업 파일(.json) 열기"><FileUp size={15} /><span className="hidden sm:inline">파일 열기</span></button>
                <div className="relative" data-card-menu>
                  <button onClick={() => setPickTemplate(v => !v)} className="h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold flex items-center gap-1.5" aria-expanded={pickTemplate} aria-haspopup="menu">
                    <Plus size={16} />새 {SPACES.find(s => s.id === space)!.noun}
                  </button>
                  {pickTemplate && (
                    <div role="menu" className="absolute right-0 top-11 z-20 w-72 p-1.5 bg-white rounded-2xl shadow-xl ring-1 ring-slate-900/10">
                      <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-slate-400">{spaceLabel} 양식</div>
                      {templatesFor(space).map(t => (
                        <button key={t.id + t.label} role="menuitem" onClick={() => { setPickTemplate(false); props.onNew({ space, template: t, category: view.kind === 'cat' ? view.name : undefined }); }}
                          className="w-full px-3 py-2.5 rounded-xl text-left hover:bg-slate-100">
                          <span className="block text-[14px] font-semibold text-slate-800">{t.label}</span>
                          <span className="block text-[12px] text-slate-500">{t.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={onClose} className="hidden md:block p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
              </header>

              <div className="flex-1 overflow-y-auto p-3 sm:p-5">
                {!k && view.kind === 'drive' ? (
                  <DrivePane drive={drive} list={driveList} err={driveErr} reload={loadDrive} localIds={localIds} onClose={onClose} />
                ) : !k && view.kind === 'calendar' ? (
                  <CalendarPane month={month} setMonth={setMonth} lessons={live} currentId={currentLessonId} onOpen={id => (id === currentLessonId ? onClose() : props.onOpen(id))} />
                ) : !k && view.kind === 'checks' ? (
                  <ChecksPane items={checks} showDone={showDone} setShowDone={setShowDone} kind={view.check}
                    onToggle={async (it, v) => { setChecks(list => list?.map(x => (x === it ? { ...x, done: v } : x)) || list); await props.toggleCheck(it, v); }}
                    onOpen={id => (id === currentLessonId ? onClose() : props.onOpen(id))} />
                ) : lessons === null ? (
                  <div className="py-24 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
                ) : shown.length === 0 ? (
                  <div className="py-20 text-center text-slate-500 text-sm">
                    {k ? '찾는 노트가 없습니다.' : view.kind === 'trash' ? '휴지통이 비어 있습니다. 지운 노트는 30일 동안 여기 남습니다.'
                      : <>아직 {spaceLabel} 공간에 노트가 없습니다.<br /><button onClick={() => setPickTemplate(true)} className="mt-3 text-indigo-600 font-semibold" data-card-menu>+ 양식 골라 새로 만들기</button></>}
                  </div>
                ) : (
                  <ul className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
                    {shown.map(l => {
                      const current = l.id === currentLessonId;
                      const snip = snippet(l);
                      const SIcon = SPACE_ICON[spaceOf(l)];
                      return (
                        <li key={l.id} className={cn('group relative rounded-2xl bg-white ring-1 transition-shadow', current ? 'ring-2 ring-indigo-500' : 'ring-slate-200 hover:shadow-lg')}>
                          <button onClick={() => (view.kind === 'trash' && !k ? undefined : current ? onClose() : props.onOpen(l.id))} className="block w-full text-left" aria-label={`${l.name} 열기`} disabled={view.kind === 'trash' && !k}>
                            <div className="aspect-[16/10] rounded-t-2xl bg-slate-100 overflow-hidden flex items-center justify-center">
                              {l.locked ? <Lock className="text-slate-400" size={28} /> : l.thumb ? <img src={l.thumb} alt="" className="w-full h-full object-contain bg-white" draggable={false} /> : <SIcon className="text-slate-300" size={28} />}
                            </div>
                            <div className="px-3 pt-2.5 pb-3">
                              {renaming === l.id ? (
                                <input autoFocus defaultValue={l.name} aria-label="노트 이름" onClick={e => e.stopPropagation()}
                                  onBlur={e => rename(l, e.currentTarget.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }}
                                  className="w-full h-7 px-2 -mx-1 rounded-lg ring-2 ring-indigo-300 text-[14px] font-semibold outline-none" />
                              ) : (
                                <span className="block text-[14px] font-semibold text-slate-800 truncate">{l.name}</span>
                              )}
                              <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-500">
                                {when(l.savedAt)} · {l.slides}장
                                {l.locked && <Lock size={12} aria-label="잠긴 노트" />}
                                {l.driveFileId && !l.locked && <Cloud size={12} className="text-sky-500" aria-label="드라이브에도 저장됨" />}
                              </span>
                              {snip && <span className="mt-1 block text-[11.5px] text-slate-500 line-clamp-2 bg-yellow-50 rounded px-1">{snip}</span>}
                              <span className="mt-1.5 flex flex-wrap gap-1">
                                {current && <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[11px] font-semibold">지금 여는 중</span>}
                                {k && <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] flex items-center gap-1"><SIcon size={11} />{SPACES.find(s => s.id === spaceOf(l))!.label}</span>}
                                {l.category && <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] flex items-center gap-1"><Folder size={11} />{l.category}</span>}
                              </span>
                            </div>
                          </button>
                          {!(view.kind === 'trash' && !k) && (
                            <button onClick={() => act(() => updateLesson(l.id, { favorite: !l.favorite }))}
                              className={cn('absolute top-2 left-2 p-1.5 rounded-full bg-white/90 shadow-sm', l.favorite ? 'text-amber-500' : 'text-slate-300 sm:opacity-0 group-hover:opacity-100 focus:opacity-100')}
                              aria-label={l.favorite ? '즐겨찾기 빼기' : '즐겨찾기'} aria-pressed={!!l.favorite}>
                              <Star size={15} fill={l.favorite ? 'currentColor' : 'none'} />
                            </button>
                          )}
                          <div className="absolute top-2 right-2" data-card-menu>
                            {view.kind === 'trash' && !k ? (
                              <div className="flex flex-col sm:flex-row gap-1">
                                <button onClick={() => act(() => updateLesson(l.id, { trashedAt: undefined }))} className="h-8 px-2.5 rounded-lg bg-white shadow-sm text-[12px] font-semibold text-slate-700 flex items-center gap-1"><RotateCcw size={13} />되살리기</button>
                                <button onClick={() => { if (confirm(`'${l.name}'을(를) 완전히 지울까요? 되돌릴 수 없습니다.`)) act(() => deleteLessonForever(l.id)); }} className="h-8 px-2.5 rounded-lg bg-white shadow-sm text-[12px] font-semibold text-red-600">완전히 지우기</button>
                              </div>
                            ) : (
                              <>
                                <button onClick={() => { setMenuFor(m => (m === l.id ? null : l.id)); setSub(null); }} className="p-1.5 rounded-full bg-white/90 shadow-sm text-slate-500 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 aria-expanded:opacity-100" aria-label={`${l.name} 메뉴`} aria-expanded={menuFor === l.id}>
                                  <MoreHorizontal size={16} />
                                </button>
                                {menuFor === l.id && (
                                  <div className="absolute right-0 top-9 z-10 w-52 bg-white rounded-xl shadow-xl ring-1 ring-slate-900/10 py-1 text-[13px] max-h-[60vh] overflow-y-auto">
                                    <MI icon={Pencil} label="이름 바꾸기" onClick={() => { closeMenus(); setRenaming(l.id); }} />
                                    <MI icon={Folder} label="분류 옮기기" onClick={() => setSub(s => (s === 'cat' ? null : 'cat'))} />
                                    {sub === 'cat' && (
                                      <div className="mx-2 my-1 p-1 rounded-lg bg-slate-50 max-h-48 overflow-y-auto">
                                        {spaceCats.map(c => <MI key={c} icon={l.category === c ? Check : Folder} label={c} onClick={() => moveTo(l, c)} />)}
                                        <MI icon={Tag} label="분류 없음" onClick={() => moveTo(l, '')} />
                                        <input placeholder="새 분류 이름 + Enter" aria-label="새 분류로 옮기기"
                                          onKeyDown={e => { if (e.key === 'Enter' && e.currentTarget.value.trim()) moveTo(l, e.currentTarget.value.trim().slice(0, 40)); }}
                                          className="mt-1 w-full h-8 px-2 rounded-md ring-1 ring-slate-200 text-[12.5px] outline-none focus:ring-indigo-300" />
                                      </div>
                                    )}
                                    <MI icon={ArrowRightLeft} label="공간 옮기기" onClick={() => setSub(s => (s === 'space' ? null : 'space'))} />
                                    {sub === 'space' && (
                                      <div className="mx-2 my-1 p-1 rounded-lg bg-slate-50">
                                        {SPACES.map(s => <MI key={s.id} icon={spaceOf(l) === s.id ? Check : SPACE_ICON[s.id]} label={s.label} onClick={() => moveSpace(l, s.id)} />)}
                                      </div>
                                    )}
                                    <MI icon={Copy} label="복제" onClick={() => { closeMenus(); act(async () => { await duplicateLesson(l.id, newLessonId()); }); }} />
                                    {!l.locked && <MI icon={History} label="수업 기록 (되돌리기)" onClick={() => { closeMenus(); props.onShowHistory(l.id); }} />}
                                    <div className="h-px bg-slate-100 my-1" />
                                    <MI icon={FileDown} label="한글(hwpx)로 내보내기" onClick={() => { closeMenus(); props.onExport(l.id, 'hwpx'); }} />
                                    <MI icon={FileDown} label="워드(docx)로 내보내기" onClick={() => { closeMenus(); props.onExport(l.id, 'docx'); }} />
                                    <div className="h-px bg-slate-100 my-1" />
                                    {l.locked
                                      ? <MI icon={LockOpen} label="잠금 풀기" onClick={() => { closeMenus(); act(() => props.onUnlock(l.id)); }} />
                                      : <MI icon={Lock} label="암호로 잠그기" onClick={() => { closeMenus(); act(() => props.onLock(l.id)); }} />}
                                    <MI icon={Trash2} label="휴지통으로" danger onClick={() => toTrash(l)} />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {busy && <div className="absolute bottom-4 right-4 p-2 rounded-full bg-white shadow"><Loader2 size={16} className="animate-spin text-slate-400" /></div>}
            </section>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/** 달력: 노트 날짜(없으면 만든 날)로 */
const CalendarPane: React.FC<{ month: Date; setMonth: (d: Date) => void; lessons: LibraryEntry[]; currentId: string; onOpen: (id: string) => void }> = ({ month, setMonth, lessons, currentId, onOpen }) => {
  const y = month.getFullYear(), m = month.getMonth();
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const byDay = new Map<string, LibraryEntry[]>();
  lessons.forEach(l => { const k = dateOf(l); byDay.set(k, [...(byDay.get(k) || []), l]); });
  const today = ymd(new Date());
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setMonth(new Date(y, m - 1, 1))} className="p-2 rounded-lg hover:bg-slate-100" aria-label="이전 달"><ChevronLeft size={18} /></button>
        <span className="text-[16px] font-bold text-slate-800 tabular-nums">{y}년 {m + 1}월</span>
        <button onClick={() => setMonth(new Date(y, m + 1, 1))} className="p-2 rounded-lg hover:bg-slate-100" aria-label="다음 달"><ChevronRight size={18} /></button>
        <button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="ml-1 h-8 px-3 rounded-lg bg-slate-100 text-[12.5px]">오늘</button>
      </div>
      <div className="grid grid-cols-7 text-center text-[12px] text-slate-400 mb-1">{'일월화수목금토'.split('').map((d, i) => <div key={d} className={i === 0 ? 'text-rose-400' : ''}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => {
          const key = ymd(d), list = byDay.get(key) || [];
          return (
            <div key={key} className={cn('min-h-[76px] sm:min-h-[96px] p-1 rounded-lg ring-1 ring-slate-100 text-left', d.getMonth() !== m && 'opacity-40', key === today && 'ring-2 ring-indigo-300')}>
              <div className={cn('text-[11.5px] tabular-nums', d.getDay() === 0 ? 'text-rose-500' : 'text-slate-500')}>{d.getDate()}</div>
              {list.slice(0, 3).map(l => (
                <button key={l.id} onClick={() => onOpen(l.id)} className={cn('mt-0.5 w-full truncate text-left text-[11px] px-1 py-0.5 rounded', l.id === currentId ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100')}>{l.name}</button>
              ))}
              {list.length > 3 && <div className="text-[10.5px] text-slate-400 px-1">+{list.length - 3}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** 할 일·기도 제목 모아 보기 */
const ChecksPane: React.FC<{ items: CheckItem[] | null; kind: 'todo' | 'prayer'; showDone: boolean; setShowDone: (v: boolean) => void; onToggle: (it: CheckItem, v: boolean) => void; onOpen: (id: string) => void }> = ({ items, kind, showDone, setShowDone, onToggle, onOpen }) => {
  if (items === null) return <div className="py-24 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
  const open = items.filter(i => !i.done), done = items.filter(i => i.done);
  const sorted = [...open].sort((a, b) => (a.dueTime ?? Infinity) - (b.dueTime ?? Infinity) || Date.parse(b.savedAt) - Date.parse(a.savedAt));
  const Row: React.FC<{ it: CheckItem }> = ({ it }) => {
    const late = !it.done && it.dueTime && it.dueTime < Date.now();
    return (
      <li className="flex items-start gap-3 py-2.5">
        <button onClick={() => onToggle(it, !it.done)} className={cn('mt-0.5 w-6 h-6 rounded-md ring-2 flex items-center justify-center shrink-0', it.done ? 'bg-emerald-500 ring-emerald-500 text-white' : 'ring-slate-300 hover:ring-indigo-400')} aria-label={it.done ? '체크 해제' : '체크'} aria-pressed={it.done}>
          {it.done && <Check size={15} />}
        </button>
        <span className="flex-1 min-w-0">
          <span className={cn('block text-[14px]', it.done ? 'line-through text-slate-400' : 'text-slate-800')}>{it.text}</span>
          <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11.5px]">
            {it.who && <span className="px-1.5 rounded bg-sky-50 text-sky-700">@{it.who}</span>}
            {it.due && <span className={cn('px-1.5 rounded', late ? 'bg-rose-50 text-rose-600 font-semibold' : 'bg-slate-100 text-slate-600')}>~{it.due}{late ? ' 지남' : ''}</span>}
            <button onClick={() => onOpen(it.lessonId)} className="text-slate-400 hover:text-indigo-600 truncate max-w-[60%]">{it.lessonName}</button>
          </span>
        </span>
      </li>
    );
  };
  return (
    <div className="max-w-2xl">
      <p className="text-[12.5px] text-slate-500 mb-2">
        {kind === 'todo' ? '모든 업무 노트의 할 일입니다. 기한이 가까운 것부터. 줄에 @이름 ~11/5 를 적으면 담당·기한이 됩니다.' : '모든 설교 노트의 기도 제목입니다. 응답받은 것은 체크하세요.'}
      </p>
      {open.length === 0 && <p className="py-10 text-center text-sm text-slate-400">{kind === 'todo' ? '남은 할 일이 없습니다.' : '기도 제목이 없습니다.'} 노트 → [{kind === 'todo' ? '할 일 목록' : '기도 제목'}]으로 넣을 수 있습니다.</p>}
      <ul className="divide-y divide-slate-100">{sorted.map(it => <Row key={`${it.lessonId}|${it.objId}|${it.line}`} it={it} />)}</ul>
      {done.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowDone(!showDone)} className="text-[13px] font-semibold text-slate-500">{showDone ? '▾' : '▸'} {kind === 'todo' ? '끝낸 일' : '응답받은 기도'} {done.length}</button>
          {showDone && <ul className="divide-y divide-slate-100">{done.map(it => <Row key={`${it.lessonId}|${it.objId}|${it.line}`} it={it} />)}</ul>}
        </div>
      )}
    </div>
  );
};

const MI: React.FC<{ icon: React.ElementType; label: string; onClick: () => void; danger?: boolean }> = ({ icon: Icon, label, onClick, danger }) => (
  <button onClick={onClick} className={cn('w-full h-8 px-3 flex items-center gap-2 text-left rounded-md', danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100')}>
    <Icon size={14} className="shrink-0" /><span className="truncate">{label}</span>
  </button>
);

/** 구글 드라이브: 켜고 끄기, 드라이브에 있는 수업 */
const DrivePane: React.FC<{ drive: LessonDashboardProps['drive']; list: DriveLesson[] | null; err: string | null; reload: () => void; localIds: Set<string>; onClose: () => void }> = ({ drive, list, err, reload, localIds }) => {
  const [busy, setBusy] = useState(false);
  if (!drive.on) {
    return (
      <div className="max-w-lg mx-auto py-10 text-center">
        <Cloud size={36} className="mx-auto text-sky-500" />
        <h4 className="mt-3 text-lg font-bold text-slate-900">구글 드라이브에도 저장하기</h4>
        <ul className="mt-3 text-[13px] text-slate-600 space-y-1.5 text-left list-disc pl-5">
          <li>수업이 내 구글 드라이브 <b>'옥쌤보드'</b> 폴더에도 30초마다 저장됩니다.</li>
          <li>맥북·교실 컴퓨터·아이패드에서 같은 계정으로 들어가면 같은 수업을 엽니다.</li>
          <li>무료이며, 옥쌤보드가 만든 파일만 다룹니다.</li>
        </ul>
        <button disabled={busy || TEST_MODE} onClick={async () => { setBusy(true); const ok = await drive.enable(); setBusy(false); if (ok) reload(); }}
          className="mt-5 h-11 px-6 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-semibold inline-flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Cloud size={17} />}구글 드라이브에 저장 켜기
        </button>
        {TEST_MODE && <p className="mt-2 text-[12px] text-red-600">시험 모드에서는 드라이브를 쓰지 않습니다.</p>}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-[13px] text-slate-600">
        <Cloud size={15} className="text-sky-600" />'옥쌤보드' 폴더 · 다른 기기에서 저장한 수업도 여기서 엽니다.
        <button onClick={reload} className="ml-auto h-8 px-3 rounded-lg bg-slate-100 text-[12.5px]">새로 고침</button>
        <button onClick={drive.disable} className="h-8 px-3 rounded-lg text-[12.5px] text-slate-400 hover:text-red-600">이 기기에서 끄기</button>
      </div>
      {err ? <p className="py-10 text-center text-sm text-red-500">{err}</p>
        : list === null ? <div className="py-16 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
        : list.length === 0 ? <p className="py-16 text-center text-sm text-slate-500">아직 드라이브에 저장한 수업이 없습니다.</p>
        : (
          <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
            {list.map(d => (
              <li key={d.id}>
                <button onClick={() => drive.open(d)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <Cloud size={16} className="text-sky-500 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold text-slate-800 truncate">{d.name}</span>
                    <span className="block text-[12px] text-slate-500">{when(d.modifiedTime)}{d.slides ? ` · ${d.slides}장` : ''}{d.lessonId && localIds.has(d.lessonId) ? ' · 이 컴퓨터에도 있음' : ' · 다른 기기에서 저장'}</span>
                  </span>
                  <span className="text-[12.5px] font-semibold text-sky-700">열기</span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
};
