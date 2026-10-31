import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown, Users, Share, Save, FolderOpen, FileText, Trash2, LayoutTemplate, Settings, Sparkles, ArrowRight,
  Download, Upload, File as FileIcon, Presentation, PanelBottomClose, Flashlight, Timer, Play, Cloud, CloudOff, Eraser, Paintbrush, MonitorSmartphone,
  History,
} from 'lucide-react';
import { glass } from './BottomNavBar';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { BackgroundPicker, type BackgroundScope } from './BackgroundPicker';
import { isInstalled, promptInstall } from '@/src/lib/install';
import { toast } from 'sonner';
import type { CanvasBackground } from '@/src/lib/backgrounds';

interface TopNavBarProps {
  projectName: string;
  onRenameProject: (name: string) => void;
  onSave: () => void;
  onLoad: () => void;
  onOpenHistory?: () => void;
  onExportFile: () => void;
  onImportFile: () => void;
  onExportPDF: () => void;
  onExportCurrentPDF: () => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onToggleLayout: () => void;
  onGenerate: (query: string) => void;
  onShare: () => void;
  onOpenMultiplayer: () => void;
  isGenerating?: boolean;
  aiEnabled?: boolean;
  isSharing?: boolean;
  peerStatus?: 'disconnected' | 'connecting' | 'connected' | 'error';
  peerCount?: number;
  onPresent: () => void;
  onToggleShade: () => void;
  onToggleSpotlight: () => void;
  onToggleTimer: () => void;
  shadeOn?: boolean;
  spotlightOn?: boolean;
  timerOn?: boolean;
  saveState?: 'saved' | 'dirty' | 'error';
  background: CanvasBackground;
  onBackgroundChange: (bg: CanvasBackground, scope: BackgroundScope) => void;
  onOpenStudentCast: () => void;
  castCount?: number;
  castOn?: boolean;
  driveState?: 'off' | 'synced' | 'saving' | 'pending' | 'need-auth' | 'error' | 'conflict';
  onOpenLessons: () => void;
}

const DRIVE_TITLES: Record<string, string> = {
  synced: '구글 드라이브에 저장됨 · 눌러서 내 수업 목록',
  saving: '구글 드라이브에 저장하는 중…',
  pending: '바뀐 내용을 곧 드라이브에 저장합니다',
  'need-auth': '드라이브 연결이 끝났습니다 · 눌러서 다시 연결',
  error: '드라이브에 저장하지 못했습니다 · 눌러서 확인',
  conflict: '다른 기기에서 더 최근에 고친 수업입니다',
};
const DRIVE_LABELS: Record<string, string> = { synced: '드라이브', saving: '저장 중', pending: '저장 대기', 'need-auth': '다시 연결', error: '저장 오류', conflict: '확인 필요' };

const MenuItem: React.FC<{ icon: React.ElementType; label: string; hint?: string; onClick: () => void }> = ({ icon: Icon, label, hint, onClick }) => (
  <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
    <Icon size={16} className="text-gray-500 shrink-0" />
    <span className="flex-1">{label}</span>
    {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
  </button>
);

export const TopNavBar: React.FC<TopNavBarProps> = ({
  projectName, onRenameProject, onSave, onLoad, onOpenHistory, onExportFile, onImportFile, onExportPDF, onExportCurrentPDF,
  onClearAll, onOpenSettings, onToggleLayout, onGenerate, onShare, onOpenMultiplayer,
  isGenerating = false, aiEnabled = false, isSharing = false, peerStatus = 'disconnected', peerCount = 0,
  onPresent, onToggleShade, onToggleSpotlight, onToggleTimer, shadeOn = false, spotlightOn = false, timerOn = false, saveState = 'saved',
  background, onBackgroundChange, onOpenStudentCast, castCount = 0, castOn = false, driveState = 'off', onOpenLessons,
}) => {
  const [bgOpen, setBgOpen] = useState(false);
  const bgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bgOpen) return;
    const onDown = (e: MouseEvent) => { if (bgRef.current && !bgRef.current.contains(e.target as Node)) setBgOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [bgOpen]);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(projectName);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setNameDraft(projectName), [projectName]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsFileMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Ctrl+S 저장
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSave(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave]);

  const run = (fn: () => void) => () => { fn(); setIsFileMenuOpen(false); };
  const submit = () => {
    if (!query.trim() || isGenerating) return;
    onGenerate(query);
    setQuery('');
  };
  const commitName = () => {
    const v = nameDraft.trim();
    if (v && v !== projectName) onRenameProject(v.slice(0, 60));
    else setNameDraft(projectName);
    setEditingName(false);
  };

  const pill = 'bg-white/90 backdrop-blur-md border border-gray-200 rounded-full shadow-sm hover:shadow-md transition-all';

  const CardBtn: React.FC<{ icon: React.ElementType; label: string; active?: boolean; danger?: boolean; onClick: () => void; title?: string }> = ({ icon: Icon, label, active, danger, onClick, title }) => (
    <button
      onClick={onClick}
      title={title || label}
      aria-label={title || label}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-center justify-center gap-1 min-w-[44px] lg:min-w-[64px] px-2 h-[44px] lg:h-[56px] rounded-xl transition-colors',
        active ? 'bg-indigo-50 text-indigo-700' : danger ? 'text-slate-600 hover:bg-red-50 hover:text-red-600' : 'text-slate-600 hover:bg-slate-900/[0.05]',
      )}
    >
      <Icon size={19} strokeWidth={1.8} />
      <span className="hidden lg:block text-[11px] font-medium leading-none whitespace-nowrap">{label}</span>
    </button>
  );

  return (
    <>
      {/* 상단 막대 */}
      <div className={cn('absolute top-3 left-4 right-4 z-50 h-14 flex items-center gap-2 sm:gap-3 px-3 rounded-2xl', glass)}>
        <div className="flex items-center gap-2 pr-2 select-none shrink-0" title="옥쌤보드">
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="w-8 h-8 rounded-[10px] shadow-sm" />
          <span className="hidden md:inline text-[17px] font-extrabold text-slate-900 tracking-tight">옥쌤보드</span>
        </div>
        <div className="w-px h-6 bg-slate-200" />
        <div className="relative" ref={menuRef}>
          <button onClick={() => setIsFileMenuOpen(o => !o)} className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-[14px] font-medium text-slate-700 hover:bg-slate-900/[0.05]" aria-haspopup="menu" aria-expanded={isFileMenuOpen}>
            <FileIcon size={16} className="text-slate-500" />
            <span className="whitespace-nowrap">파일</span>
            <ChevronDown size={15} className="text-slate-400" />
          </button>
          <AnimatePresence>
            {isFileMenuOpen && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute z-50 top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-[0_18px_40px_-12px_rgba(15,23,42,0.3)] ring-1 ring-slate-900/[0.07] overflow-hidden py-1.5"
              >
                <MenuItem icon={Save} label="저장" hint="Ctrl+S" onClick={run(onSave)} />
                <MenuItem icon={Cloud} label="내 수업 (구글 드라이브)" hint="모든 기기" onClick={run(onOpenLessons)} />
                <MenuItem icon={FolderOpen} label="이 브라우저에 저장한 수업" onClick={run(onLoad)} />
                {onOpenHistory && <MenuItem icon={History} label="수업 기록 (자동 보관)" hint="되살리기" onClick={run(onOpenHistory)} />}
                <div className="h-px bg-slate-100 my-1" />
                <MenuItem icon={Download} label="파일로 내보내기 (.json)" onClick={run(onExportFile)} />
                <MenuItem icon={Upload} label="파일 열기" onClick={run(onImportFile)} />
                <div className="h-px bg-slate-100 my-1" />
                <MenuItem icon={FileText} label="PDF로 내보내기 (전체 슬라이드)" onClick={run(onExportPDF)} />
                <MenuItem icon={FileText} label="PDF로 내보내기 (현재 슬라이드)" onClick={run(onExportCurrentPDF)} />
                <div className="h-px bg-slate-100 my-1" />
                <MenuItem icon={LayoutTemplate} label="도구 막대 위치 바꾸기" onClick={run(onToggleLayout)} />
                {!isInstalled() && <MenuItem icon={Download} label="앱으로 설치하기" hint="인터넷 없이도 열림" onClick={run(async () => {
                  if (!(await promptInstall())) toast.info('이 브라우저에서는 메뉴로 설치합니다.', { description: '아이패드·아이폰 사파리: 공유 버튼 → [홈 화면에 추가]. 크롬·엣지: 주소창 오른쪽의 설치 아이콘.', duration: 8000 });
                })} />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="w-px h-6 bg-slate-200" />
        <div className="flex items-center gap-1.5 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameDraft(projectName); setEditingName(false); } }}
              className="px-2.5 py-1.5 text-[14px] font-semibold text-slate-800 bg-white rounded-lg outline-none ring-2 ring-indigo-200 w-56"
              aria-label="수업 이름"
            />
          ) : (
            <button onClick={() => setEditingName(true)} title="눌러서 수업 이름 바꾸기" className="px-2 py-1.5 text-[14px] font-semibold text-slate-800 rounded-lg hover:bg-slate-900/[0.05] truncate max-w-[120px] sm:max-w-[260px]">
              {projectName}
            </button>
          )}
          <button
            onClick={onOpenLessons}
            className={cn('shrink-0 flex items-center gap-1 h-8 px-2 rounded-lg hover:bg-slate-900/[0.05] text-[12px] font-medium',
              driveState === 'synced' ? 'text-sky-600' : driveState === 'need-auth' || driveState === 'conflict' ? 'text-amber-600' : driveState === 'error' || saveState === 'error' ? 'text-red-500' : 'text-slate-400')}
            title={DRIVE_TITLES[driveState] ?? (saveState === 'saved' ? '이 브라우저에 저장됨 · 눌러서 구글 드라이브 동기화 켜기' : saveState === 'dirty' ? '저장 대기 중 (곧 자동 저장)' : '저장하지 못했습니다')}
            aria-label="내 수업 (저장 상태)"
          >
            {driveState === 'saving' ? <Cloud size={17} className="animate-pulse" /> : saveState === 'error' || driveState === 'error' ? <CloudOff size={17} /> : <Cloud size={17} />}
            {driveState !== 'off' && <span className="hidden xl:inline whitespace-nowrap">{DRIVE_LABELS[driveState]}</span>}
          </button>
        </div>

        <div className="flex-1" />

        <button onClick={onPresent} className="flex items-center gap-2 h-10 px-4 rounded-xl bg-slate-900 text-white text-[14px] font-semibold hover:bg-black shadow-sm" title="발표 모드 (전체 화면)">
          <Play size={15} fill="currentColor" />
          <span className="hidden sm:inline whitespace-nowrap">발표</span>
        </button>
        <button
          onClick={onOpenStudentCast}
          className={cn('flex items-center gap-2 h-10 px-3.5 rounded-xl text-[14px] font-medium', castOn ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' : 'text-slate-700 hover:bg-slate-900/[0.05]')}
          title="학생 태블릿에 지금 화면을 보여 주기 (읽기 전용)"
          aria-label={castOn ? `학생 화면 보내는 중, ${castCount}명` : '학생 화면'}
        >
          <MonitorSmartphone size={16} />
          <span className="hidden xl:inline">{castOn ? `학생 ${castCount}명` : '학생 화면'}</span>
        </button>
        <button
          onClick={onOpenMultiplayer}
          className={cn('flex items-center gap-2 h-10 px-3.5 rounded-xl text-[14px] font-medium', peerStatus === 'connected' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'text-slate-700 hover:bg-slate-900/[0.05]')}
          title="방 코드로 실시간 함께 그리기"
        >
          <Users size={16} />
          <span className="hidden lg:inline">{peerStatus === 'connected' ? `협업 중 · ${peerCount}명` : '협업'}</span>
        </button>
        <button onClick={onShare} className="flex items-center gap-2 h-10 px-4 rounded-xl bg-indigo-600 text-white text-[14px] font-semibold hover:bg-indigo-700 shadow-[0_6px_14px_-4px_rgba(79,70,229,0.55)]" title="Google 로그인으로 공유 링크 만들기">
          <Share size={15} />
          <span className="hidden sm:inline whitespace-nowrap">{isSharing ? '링크 복사' : '공유'}</span>
        </button>
        <div className={cn('relative hidden lg:flex items-center w-56 h-10 rounded-xl bg-slate-100/80 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-200 transition-all focus-within:w-72', !aiEnabled && 'opacity-70')}>
          <input
            type="text"
            placeholder={aiEnabled ? 'AI에게 판서 정리 부탁하기…' : 'AI 기능 준비 중'}
            className="flex-1 min-w-0 bg-transparent outline-none pl-3.5 text-[13px] text-slate-700 placeholder:text-slate-400"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }}
            aria-label="AI 판서 주제"
          />
          <button onClick={submit} disabled={isGenerating || !query.trim()} aria-label="AI로 만들기" className="w-9 h-9 mr-0.5 flex items-center justify-center rounded-lg text-indigo-500 hover:bg-indigo-50 disabled:hover:bg-transparent">
            {isGenerating ? <Sparkles size={16} className="animate-spin" /> : <Sparkles size={16} />}
          </button>
        </div>
      </div>

      {/* 오른쪽 위 수업 도구 카드 */}
      <div ref={bgRef} className={cn('absolute top-[86px] right-6 z-40 flex items-center gap-0.5 p-1.5 rounded-2xl', glass)}>
        <CardBtn icon={PanelBottomClose} label="가림막" active={shadeOn} onClick={onToggleShade} />
        <CardBtn icon={Flashlight} label="스포트라이트" active={spotlightOn} onClick={onToggleSpotlight} />
        <CardBtn icon={Timer} label="타이머" active={timerOn} onClick={onToggleTimer} />
        <CardBtn icon={Paintbrush} label="배경" title="수업 배경 (오선지·원고지·영어 4선 등)" active={bgOpen} onClick={() => setBgOpen(o => !o)} />
        <CardBtn icon={Eraser} label="지우기" title="이 슬라이드 지우기" danger onClick={onClearAll} />
        <CardBtn icon={Settings} label="설정" onClick={onOpenSettings} />
        <AnimatePresence>
          {bgOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="absolute right-0 top-full mt-2 w-[340px] p-3 rounded-2xl bg-white/95 backdrop-blur-xl ring-1 ring-slate-900/[0.07] shadow-[0_18px_40px_-12px_rgba(15,23,42,0.3)]"
              role="dialog" aria-label="수업 배경"
            >
              <div className="px-1 pb-2 text-[12px] font-semibold text-slate-500">수업 배경</div>
              <BackgroundPicker value={background} compact onChange={(bg, scope) => onBackgroundChange(bg, scope)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
