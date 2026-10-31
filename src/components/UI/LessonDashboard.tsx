import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, Plus, Star, Folder, FolderPlus, Trash2, Clock, LayoutGrid, Cloud, CloudOff, HardDrive, MoreHorizontal,
  Copy, Pencil, History, RotateCcw, FileUp, Check, Loader2, Tag, ArrowDownAZ, CalendarClock,
} from 'lucide-react';
import {
  listLibrary, updateLesson, deleteLessonForever, duplicateLesson, renameCategory, setCategories, type LibraryEntry,
} from '@/src/lib/projectStore';
import type { DriveLesson } from '@/src/lib/driveSync';
import { TEST_MODE } from '@/src/lib/testMode';
import { cn } from '@/src/lib/utils';

type View = { kind: 'all' } | { kind: 'fav' } | { kind: 'recent' } | { kind: 'cat'; name: string } | { kind: 'none' } | { kind: 'trash' } | { kind: 'drive' };

const when = (iso: string) => {
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
};

const newLessonId = () => (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');

export interface LessonDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  currentLessonId: string;
  /** 지금 여는 수업 이름이 바뀌면 화면 제목도 바꾼다 */
  onCurrentRenamed: (name: string) => void;
  onCurrentCategory: (category: string | undefined) => void;
  /** 지금 수업을 먼저 저장 (목록을 열 때 최신으로) */
  saveCurrent: () => Promise<void>;
  onOpen: (id: string) => void;
  onNew: (category?: string) => void;
  onImportFile: () => void;
  onShowHistory: (lessonId: string) => void;
  /** 지금 여는 수업을 휴지통에 넣었을 때 (새 수업으로 바꿈) */
  onCurrentTrashed: () => void;
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
  const [view, setView] = useState<View>({ kind: 'all' });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [catMenuFor, setCatMenuFor] = useState<string | null>(null);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [editCat, setEditCat] = useState<string | null>(null);
  const [driveList, setDriveList] = useState<DriveLesson[] | null>(null);
  const [driveErr, setDriveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const lib = await listLibrary();
    setLessons(lib.lessons);
    setCats(lib.categories.sort((a, b) => a.localeCompare(b, 'ko')));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setLessons(null); setMenuFor(null); setRenaming(null); setCatMenuFor(null);
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

  // 바깥을 누르면 카드 메뉴 닫기
  useEffect(() => {
    if (!menuFor && !catMenuFor) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('[data-card-menu]')) { setMenuFor(null); setCatMenuFor(null); } };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuFor, catMenuFor]);

  const live = (lessons || []).filter(l => !l.trashedAt);
  const trash = (lessons || []).filter(l => l.trashedAt);
  const count = (f: (l: LibraryEntry) => boolean) => live.filter(f).length;

  const shown = useMemo(() => {
    let list = view.kind === 'trash' ? trash : live;
    if (view.kind === 'fav') list = list.filter(l => l.favorite);
    if (view.kind === 'cat') list = list.filter(l => l.category === view.name);
    if (view.kind === 'none') list = list.filter(l => !l.category);
    if (view.kind === 'recent') list = list.filter(l => Date.now() - Date.parse(l.savedAt) < 7 * 864e5);
    const k = q.trim().toLowerCase();
    if (k) list = list.filter(l => l.name.toLowerCase().includes(k) || (l.category || '').toLowerCase().includes(k));
    return [...list].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : Date.parse(b.savedAt) - Date.parse(a.savedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, view, q, sort]);

  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); await refresh(); } finally { setBusy(false); } };

  const rename = (l: LibraryEntry, name: string) => act(async () => {
    const n = name.trim().slice(0, 100);
    setRenaming(null);
    if (!n || n === l.name) return;
    await updateLesson(l.id, { name: n });
    if (l.id === currentLessonId) props.onCurrentRenamed(n);
  });
  const moveTo = (l: LibraryEntry, category: string) => act(async () => {
    setCatMenuFor(null); setMenuFor(null);
    await updateLesson(l.id, { category });
    if (l.id === currentLessonId) props.onCurrentCategory(category || undefined);
  });
  const toTrash = (l: LibraryEntry) => act(async () => {
    setMenuFor(null);
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

  const title =
    view.kind === 'all' ? '전체 수업' : view.kind === 'fav' ? '즐겨찾기' : view.kind === 'recent' ? '최근 7일' :
    view.kind === 'cat' ? view.name : view.kind === 'none' ? '분류 없음' : view.kind === 'trash' ? '휴지통' : '구글 드라이브';

  const NavBtn: React.FC<{ v: View; icon: React.ElementType; label: string; n?: number }> = ({ v, icon: Icon, label, n }) => {
    const on = view.kind === v.kind && (v.kind !== 'cat' || (view.kind === 'cat' && view.name === (v as any).name));
    return (
      <button onClick={() => setView(v)} className={cn('w-full h-9 px-3 rounded-xl flex items-center gap-2.5 text-[13.5px] text-left shrink-0', on ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-100')}>
        <Icon size={16} className="shrink-0" /><span className="flex-1 truncate">{label}</span>{n !== undefined && <span className="text-[12px] text-slate-400">{n}</span>}
      </button>
    );
  };

  const localIds = new Set((lessons || []).map(l => l.id));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-2 sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div
            role="dialog" aria-modal="true" aria-label="내 수업"
            initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }}
            className="relative w-full max-w-6xl h-[min(92vh,820px)] flex flex-col md:flex-row bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 overflow-hidden"
          >
            {/* 왼쪽: 분류 */}
            <aside className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/60 flex md:flex-col">
              <div className="hidden md:flex items-center gap-2 px-5 pt-5 pb-3">
                <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600"><LayoutGrid size={18} /></div>
                <h2 className="text-lg font-bold text-slate-900">내 수업</h2>
              </div>
              <nav className="flex md:flex-col gap-1 px-2 md:px-3 py-2 md:py-0 overflow-x-auto md:overflow-y-auto md:flex-1">
                <NavBtn v={{ kind: 'all' }} icon={LayoutGrid} label="전체 수업" n={live.length} />
                <NavBtn v={{ kind: 'fav' }} icon={Star} label="즐겨찾기" n={count(l => !!l.favorite)} />
                <NavBtn v={{ kind: 'recent' }} icon={Clock} label="최근 7일" />
                <div className="hidden md:flex items-center justify-between mt-4 mb-1 px-3 text-[11.5px] font-semibold text-slate-400">
                  <span>분류</span>
                  <button onClick={() => setNewCat('')} className="p-1 rounded-md hover:bg-slate-200 text-slate-500" aria-label="새 분류" title="새 분류"><FolderPlus size={14} /></button>
                </div>
                {cats.map(c => editCat === c ? (
                  <input key={c} autoFocus defaultValue={c} aria-label="분류 이름"
                    onBlur={e => changeCategory(c, e.currentTarget.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditCat(null); }}
                    className="h-9 mx-0 px-3 rounded-xl ring-2 ring-indigo-300 text-[13.5px] outline-none shrink-0" />
                ) : (
                  <div key={c} className="group relative shrink-0">
                    <NavBtn v={{ kind: 'cat', name: c }} icon={Folder} label={c} n={count(l => l.category === c)} />
                    <button onClick={() => setEditCat(c)} className="hidden md:group-hover:flex absolute right-8 top-1.5 p-1 rounded-md text-slate-400 hover:bg-slate-200" aria-label={`${c} 이름 바꾸기`} title="분류 이름 바꾸기 (비우면 분류 지우기)"><Pencil size={12} /></button>
                  </div>
                ))}
                {newCat !== null ? (
                  <input autoFocus placeholder="예: 3학년 과학" aria-label="새 분류 이름"
                    onBlur={e => addCategory(e.currentTarget.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setNewCat(null); }}
                    className="h-9 px-3 rounded-xl ring-2 ring-indigo-300 text-[13.5px] outline-none shrink-0" />
                ) : (
                  <button onClick={() => setNewCat('')} className="md:hidden h-9 px-3 rounded-xl text-[13px] text-slate-500 flex items-center gap-1.5 shrink-0"><FolderPlus size={15} />새 분류</button>
                )}
                {live.some(l => !l.category) && cats.length > 0 && <NavBtn v={{ kind: 'none' }} icon={Tag} label="분류 없음" n={count(l => !l.category)} />}
                <div className="hidden md:block h-px bg-slate-200 my-3 mx-3" />
                <NavBtn v={{ kind: 'drive' }} icon={Cloud} label="구글 드라이브" />
                <NavBtn v={{ kind: 'trash' }} icon={Trash2} label="휴지통" n={trash.length || undefined} />
              </nav>
              {/* 어디에 저장되는지 */}
              <div className="hidden md:block m-3 p-3 rounded-2xl bg-white ring-1 ring-slate-200 text-[12px] leading-relaxed text-slate-600">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800"><HardDrive size={14} />저장 위치</div>
                <p className="mt-1">이 컴퓨터의 이 브라우저 안 (자동 저장){TEST_MODE && <b className="text-red-600"> · 시험 모드 저장소</b>}</p>
                <p className="mt-1 flex items-center gap-1">
                  {drive.on ? <><Cloud size={13} className="text-sky-600" />구글 드라이브 '옥쌤보드' 폴더에도 저장</> : <><CloudOff size={13} />구글 드라이브: 꺼짐</>}
                </p>
                {!drive.on && <button onClick={() => setView({ kind: 'drive' })} className="mt-1.5 text-sky-700 font-semibold">다른 기기와 함께 쓰기 →</button>}
              </div>
            </aside>

            {/* 오른쪽: 목록 */}
            <section className="flex-1 min-w-0 flex flex-col">
              <header className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-slate-100">
                <h3 className="text-[17px] font-bold text-slate-900 mr-auto truncate">{title}</h3>
                {view.kind !== 'drive' && (
                  <>
                    <label className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={q} onChange={e => setQ(e.target.value)} placeholder="수업 이름·분류 찾기" aria-label="수업 찾기" className="h-9 w-44 sm:w-56 pl-8 pr-3 rounded-xl bg-slate-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" />
                    </label>
                    <button onClick={() => setSort(s => (s === 'recent' ? 'name' : 'recent'))} className="h-9 px-3 rounded-xl bg-slate-100 text-slate-600 text-[13px] flex items-center gap-1.5" title="정렬 바꾸기">
                      {sort === 'recent' ? <><CalendarClock size={15} />최근 순</> : <><ArrowDownAZ size={15} />이름 순</>}
                    </button>
                  </>
                )}
                <button onClick={props.onImportFile} className="h-9 px-3 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold flex items-center gap-1.5" title="내보낸 수업 파일(.json) 열기"><FileUp size={15} />파일 열기</button>
                <button onClick={() => props.onNew(view.kind === 'cat' ? view.name : undefined)} className="h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold flex items-center gap-1.5"><Plus size={16} />새 수업</button>
                <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
              </header>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                {view.kind === 'drive' ? (
                  <DrivePane drive={drive} list={driveList} err={driveErr} reload={loadDrive} localIds={localIds} onClose={onClose} />
                ) : lessons === null ? (
                  <div className="py-24 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
                ) : shown.length === 0 ? (
                  <div className="py-20 text-center text-slate-500 text-sm">
                    {view.kind === 'trash' ? '휴지통이 비어 있습니다. 지운 수업은 30일 동안 여기 남습니다.'
                      : q ? '찾는 수업이 없습니다.'
                      : view.kind === 'cat' ? <>이 분류에 수업이 없습니다.<br /><button onClick={() => props.onNew(view.name)} className="mt-3 text-indigo-600 font-semibold">+ 이 분류에 새 수업 만들기</button></>
                      : <>아직 저장된 수업이 없습니다.<br />판서를 시작하면 자동으로 여기에 저장됩니다.</>}
                  </div>
                ) : (
                  <ul className="grid gap-3 sm:gap-4 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
                    {shown.map(l => {
                      const current = l.id === currentLessonId;
                      return (
                        <li key={l.id} className={cn('group relative rounded-2xl bg-white ring-1 transition-shadow', current ? 'ring-2 ring-indigo-500' : 'ring-slate-200 hover:shadow-lg')}>
                          <button
                            onClick={() => (view.kind === 'trash' ? undefined : current ? onClose() : props.onOpen(l.id))}
                            className="block w-full text-left"
                            aria-label={`${l.name} 열기`}
                            disabled={view.kind === 'trash'}
                          >
                            <div className="aspect-[16/10] rounded-t-2xl bg-slate-100 overflow-hidden flex items-center justify-center">
                              {l.thumb ? <img src={l.thumb} alt="" className="w-full h-full object-contain bg-white" draggable={false} /> : <LayoutGrid className="text-slate-300" size={28} />}
                            </div>
                            <div className="px-3 pt-2.5 pb-3">
                              {renaming === l.id ? (
                                <input autoFocus defaultValue={l.name} aria-label="수업 이름" onClick={e => e.stopPropagation()}
                                  onBlur={e => rename(l, e.currentTarget.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }}
                                  className="w-full h-7 px-2 -mx-1 rounded-lg ring-2 ring-indigo-300 text-[14px] font-semibold outline-none" />
                              ) : (
                                <span className="block text-[14px] font-semibold text-slate-800 truncate">{l.name}</span>
                              )}
                              <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-500">
                                {when(l.savedAt)} · {l.slides}장
                                {l.driveFileId && <Cloud size={12} className="text-sky-500" aria-label="드라이브에도 저장됨" />}
                              </span>
                              <span className="mt-1.5 flex flex-wrap gap-1">
                                {current && <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[11px] font-semibold">지금 여는 중</span>}
                                {l.category && <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] flex items-center gap-1"><Folder size={11} />{l.category}</span>}
                              </span>
                            </div>
                          </button>
                          {view.kind !== 'trash' && (
                            <button onClick={() => act(() => updateLesson(l.id, { favorite: !l.favorite }))}
                              className={cn('absolute top-2 left-2 p-1.5 rounded-full bg-white/90 shadow-sm', l.favorite ? 'text-amber-500' : 'text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100')}
                              aria-label={l.favorite ? '즐겨찾기 빼기' : '즐겨찾기'} aria-pressed={!!l.favorite}>
                              <Star size={15} fill={l.favorite ? 'currentColor' : 'none'} />
                            </button>
                          )}
                          <div className="absolute top-2 right-2" data-card-menu>
                            {view.kind === 'trash' ? (
                              <div className="flex gap-1">
                                <button onClick={() => act(() => updateLesson(l.id, { trashedAt: undefined }))} className="h-8 px-2.5 rounded-lg bg-white shadow-sm text-[12px] font-semibold text-slate-700 flex items-center gap-1"><RotateCcw size={13} />되살리기</button>
                                <button onClick={() => { if (confirm(`'${l.name}'을(를) 완전히 지울까요? 되돌릴 수 없습니다.`)) act(() => deleteLessonForever(l.id)); }} className="h-8 px-2.5 rounded-lg bg-white shadow-sm text-[12px] font-semibold text-red-600">완전히 지우기</button>
                              </div>
                            ) : (
                              <>
                                <button onClick={() => { setMenuFor(m => (m === l.id ? null : l.id)); setCatMenuFor(null); }} className="p-1.5 rounded-full bg-white/90 shadow-sm text-slate-500 opacity-0 group-hover:opacity-100 focus:opacity-100 aria-expanded:opacity-100" aria-label={`${l.name} 메뉴`} aria-expanded={menuFor === l.id}>
                                  <MoreHorizontal size={16} />
                                </button>
                                {menuFor === l.id && (
                                  <div className="absolute right-0 top-9 z-10 w-48 bg-white rounded-xl shadow-xl ring-1 ring-slate-900/10 py-1 text-[13px]">
                                    <MI icon={Pencil} label="이름 바꾸기" onClick={() => { setMenuFor(null); setRenaming(l.id); }} />
                                    <MI icon={Folder} label="분류 옮기기" onClick={() => setCatMenuFor(l.id)} />
                                    {catMenuFor === l.id && (
                                      <div className="mx-2 my-1 p-1 rounded-lg bg-slate-50 max-h-48 overflow-y-auto">
                                        {cats.map(c => <MI key={c} icon={l.category === c ? Check : Folder} label={c} onClick={() => moveTo(l, c)} />)}
                                        <MI icon={Tag} label="분류 없음" onClick={() => moveTo(l, '')} />
                                        <input placeholder="새 분류 이름 + Enter" aria-label="새 분류로 옮기기"
                                          onKeyDown={e => { if (e.key === 'Enter' && e.currentTarget.value.trim()) moveTo(l, e.currentTarget.value.trim().slice(0, 40)); }}
                                          className="mt-1 w-full h-8 px-2 rounded-md ring-1 ring-slate-200 text-[12.5px] outline-none focus:ring-indigo-300" />
                                      </div>
                                    )}
                                    <MI icon={Copy} label="복제" onClick={() => { setMenuFor(null); act(async () => { await duplicateLesson(l.id, newLessonId()); }); }} />
                                    <MI icon={History} label="수업 기록 (되돌리기)" onClick={() => { setMenuFor(null); props.onShowHistory(l.id); }} />
                                    <div className="h-px bg-slate-100 my-1" />
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
