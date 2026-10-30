import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown, Users, Share, Save, FolderOpen, FileText, Trash2, LayoutTemplate, Settings, Sparkles, ArrowRight,
  Download, Upload, File as FileIcon, Presentation, PanelBottomClose, Flashlight, Timer,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface TopNavBarProps {
  projectName: string;
  onRenameProject: (name: string) => void;
  onSave: () => void;
  onLoad: () => void;
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
}

const MenuItem: React.FC<{ icon: React.ElementType; label: string; hint?: string; onClick: () => void }> = ({ icon: Icon, label, hint, onClick }) => (
  <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
    <Icon size={16} className="text-gray-500 shrink-0" />
    <span className="flex-1">{label}</span>
    {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
  </button>
);

export const TopNavBar: React.FC<TopNavBarProps> = ({
  projectName, onRenameProject, onSave, onLoad, onExportFile, onImportFile, onExportPDF, onExportCurrentPDF,
  onClearAll, onOpenSettings, onToggleLayout, onGenerate, onShare, onOpenMultiplayer,
  isGenerating = false, aiEnabled = false, isSharing = false, peerStatus = 'disconnected', peerCount = 0,
  onPresent, onToggleShade, onToggleSpotlight, onToggleTimer, shadeOn = false, spotlightOn = false, timerOn = false,
}) => {
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

  return (
    <div className="absolute top-0 left-0 w-full z-50 flex flex-col pointer-events-none">
      <div className="flex justify-between items-center h-16 px-4 gap-3">
        {/* 왼쪽: 파일 메뉴 + 수업 이름 */}
        <div className="pointer-events-auto flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 pr-1 select-none" title="옥쌤보드">
            <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="w-8 h-8 rounded-lg shadow-sm" />
            <span className="hidden md:inline text-sm font-bold text-indigo-700 tracking-tight">옥쌤보드</span>
          </div>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setIsFileMenuOpen(o => !o)} className={cn(pill, 'flex items-center gap-2 px-4 py-2 hover:bg-gray-50')} aria-haspopup="menu" aria-expanded={isFileMenuOpen}>
              <FileIcon size={16} className="text-gray-500" />
              <span className="font-medium text-sm text-gray-700">파일</span>
              <ChevronDown size={16} className="text-gray-500" />
            </button>
            <AnimatePresence>
              {isFileMenuOpen && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute z-50 top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1"
                >
                  <MenuItem icon={Save} label="저장" hint="Ctrl+S" onClick={run(onSave)} />
                  <MenuItem icon={FolderOpen} label="저장한 수업 불러오기" onClick={run(onLoad)} />
                  <div className="h-px bg-gray-100 my-1" />
                  <MenuItem icon={Download} label="파일로 내보내기 (.json)" onClick={run(onExportFile)} />
                  <MenuItem icon={Upload} label="파일 열기" onClick={run(onImportFile)} />
                  <div className="h-px bg-gray-100 my-1" />
                  <MenuItem icon={FileText} label="PDF로 내보내기 (전체 슬라이드)" onClick={run(onExportPDF)} />
                  <MenuItem icon={FileText} label="PDF로 내보내기 (현재 슬라이드)" onClick={run(onExportCurrentPDF)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameDraft(projectName); setEditingName(false); } }}
              className="px-3 py-1.5 text-sm font-semibold text-gray-800 bg-white border border-indigo-300 rounded-lg outline-none ring-2 ring-indigo-100 w-48"
              aria-label="수업 이름"
            />
          ) : (
            <button onClick={() => setEditingName(true)} title="눌러서 수업 이름 바꾸기" className="px-3 py-1.5 text-sm font-semibold text-gray-800 rounded-lg hover:bg-white/80 truncate max-w-[220px]">
              {projectName}
            </button>
          )}
        </div>

        {/* 오른쪽: 협업 / 공유 / AI */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={onPresent}
            className="flex items-center gap-2 px-4 py-1.5 bg-gray-900 text-white rounded-full shadow-sm hover:shadow-md hover:bg-black transition-all text-sm font-semibold"
            title="발표 모드 (전체 화면)"
          >
            <Presentation size={14} />
            발표
          </button>
          <button
            onClick={onOpenMultiplayer}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm hover:shadow-md transition-all text-sm font-medium',
              peerStatus === 'connected' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50',
            )}
            title="방 코드로 실시간 함께 그리기"
          >
            <Users size={14} />
            {peerStatus === 'connected' ? `실시간 협업 중 · ${peerCount}명` : '실시간 협업'}
          </button>

          <button
            onClick={onShare}
            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-full shadow-sm hover:shadow-md hover:bg-indigo-700 transition-all text-sm font-medium"
            title="Google 로그인으로 공유 링크 만들기"
          >
            <Share size={14} />
            {isSharing ? '링크 복사' : '공유 링크'}
          </button>

          <div className={cn(pill, 'relative flex items-center w-60 focus-within:w-80', !aiEnabled && 'opacity-70')}>
            <div className="pl-3 pr-2 text-indigo-400"><Sparkles size={14} /></div>
            <input
              type="text"
              placeholder={aiEnabled ? 'AI로 판서 정리 (예: 광합성)' : 'AI 기능 준비 중'}
              className="flex-1 min-w-0 bg-transparent border-none outline-none py-1.5 text-xs text-gray-700 placeholder:text-gray-400"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }}
              aria-label="AI 판서 주제"
            />
            <div className="pr-1.5">
              <button
                onClick={submit}
                disabled={isGenerating || !query.trim()}
                aria-label="AI로 만들기"
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full transition-colors',
                  isGenerating || !query.trim() ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
                )}
              >
                {isGenerating ? <Sparkles size={12} className="animate-spin" /> : <ArrowRight size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end items-center h-14 px-4 mt-1">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button onClick={onToggleShade} className={cn(pill, 'p-2.5 hover:bg-gray-50', shadeOn ? 'text-indigo-600 border-indigo-300 bg-indigo-50' : 'text-gray-600')} title="가림막 (화면 아래 가리기)" aria-label="가림막" aria-pressed={shadeOn}>
            <PanelBottomClose size={18} />
          </button>
          <button onClick={onToggleSpotlight} className={cn(pill, 'p-2.5 hover:bg-gray-50', spotlightOn ? 'text-indigo-600 border-indigo-300 bg-indigo-50' : 'text-gray-600')} title="스포트라이트" aria-label="스포트라이트" aria-pressed={spotlightOn}>
            <Flashlight size={18} />
          </button>
          <button onClick={onToggleTimer} className={cn(pill, 'p-2.5 hover:bg-gray-50', timerOn ? 'text-indigo-600 border-indigo-300 bg-indigo-50' : 'text-gray-600')} title="타이머" aria-label="타이머" aria-pressed={timerOn}>
            <Timer size={18} />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <button onClick={onClearAll} className={cn(pill, 'p-2.5 text-gray-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200')} title="이 슬라이드 모두 지우기" aria-label="이 슬라이드 모두 지우기">
            <Trash2 size={18} />
          </button>
          <button onClick={onToggleLayout} className={cn(pill, 'p-2.5 text-gray-600 hover:bg-gray-50')} title="도구 막대 위치 바꾸기 (세로/가로)" aria-label="도구 막대 위치 바꾸기">
            <LayoutTemplate size={18} />
          </button>
          <button onClick={onOpenSettings} className={cn(pill, 'p-2.5 text-gray-600 hover:bg-gray-50')} title="설정" aria-label="설정">
            <Settings size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
