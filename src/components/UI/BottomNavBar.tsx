import React from 'react';
import { Video, ChevronLeft, ChevronRight, Plus, Minus, LayoutGrid } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface SlideThumb {
  id: string;
  name: string;
  thumbnail?: string;
}

interface BottomNavBarProps {
  zoomLevel: number;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  slides: SlideThumb[];
  activeSlideId: string;
  onSelectSlide: (id: string) => void;
  onNextSlide: () => void;
  onPrevSlide: () => void;
  onAddSlide: () => void;
  onOpenSlideNavigator: () => void;
  isCameraOpen?: boolean;
  onToggleCamera?: () => void;
  isVertical?: boolean;
  onRecord?: () => void;
  isRecording?: boolean;
  /** 휴대폰: 작게 (확대 비율은 두 손가락으로) */
  isPhone?: boolean;
}

export const glass = 'bg-white/80 backdrop-blur-xl ring-1 ring-slate-900/[0.06] shadow-[0_8px_30px_-6px_rgba(15,23,42,0.18)]';

/** 아래쪽 막대: 왼쪽 녹화·카메라 / 가운데 슬라이드 썸네일 띠 / 오른쪽 확대 비율 */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  zoomLevel, onResetZoom, onZoomIn, onZoomOut, slides, activeSlideId, onSelectSlide,
  onNextSlide, onPrevSlide, onAddSlide, onOpenSlideNavigator, isCameraOpen = false, onToggleCamera,
  isVertical = true, onRecord, isRecording = false, isPhone = false,
}) => {
  const idx = Math.max(0, slides.findIndex(s => s.id === activeSlideId));
  const total = slides.length;
  // 현재 슬라이드를 가운데에 두고 최대 5장만 보인다
  const WIN = 5;
  const from = Math.max(0, Math.min(idx - Math.floor(WIN / 2), total - WIN));
  const visible = slides.slice(from, from + WIN);
  const zoomPercent = Math.round(zoomLevel * 100);

  return (
    <div className={cn('absolute bottom-0 left-0 w-full flex justify-between items-end pointer-events-none z-40', isPhone ? 'gap-1.5 pb-2 px-2' : 'gap-3 pb-4', !isPhone && (isVertical ? 'pl-[92px] pr-4' : 'px-4'))}>
      {/* 녹화 · 카메라 */}
      <div className={cn('pointer-events-auto flex items-center gap-1 p-1.5 rounded-2xl', glass)}>
        {onRecord && (
          <button
            onClick={onRecord}
            disabled={isRecording}
            className="flex items-center gap-2 pl-3 pr-3.5 h-10 rounded-xl text-slate-700 hover:bg-slate-900/5 disabled:opacity-60 transition-colors"
            title={isRecording ? '녹화 중' : '수업 녹화'}
            aria-label={isRecording ? '녹화 중' : '수업 녹화'}
          >
            <span className={cn('w-3 h-3 rounded-full bg-red-500', isRecording && 'animate-pulse')} />
            {!isPhone && <span className="text-[13px] font-semibold">{isRecording ? '녹화 중' : '녹화'}</span>}
          </button>
        )}
        <button
          onClick={onToggleCamera}
          className={cn('w-10 h-10 flex items-center justify-center rounded-xl transition-colors', isCameraOpen ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-900/5')}
          title={isCameraOpen ? '카메라 끄기' : '카메라 켜기'}
          aria-label={isCameraOpen ? '카메라 끄기' : '카메라 켜기'}
          aria-pressed={isCameraOpen}
        >
          <Video size={19} strokeWidth={1.7} />
        </button>
      </div>

      {/* 슬라이드 띠 */}
      <div className={cn('pointer-events-auto flex items-center gap-1 p-1.5 rounded-2xl min-w-0', glass)}>
        <button onClick={onPrevSlide} disabled={idx <= 0} className="w-9 h-10 sm:h-12 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-900/5 disabled:opacity-30" title="이전 슬라이드 (PageUp)" aria-label="이전 슬라이드">
          <ChevronLeft size={19} />
        </button>
        <div className="hidden md:flex items-center gap-1.5 px-0.5">
          {visible.map((s, i) => {
            const n = from + i + 1;
            const active = s.id === activeSlideId;
            return (
              <button
                key={s.id}
                onClick={() => onSelectSlide(s.id)}
                className={cn(
                  'relative w-[68px] h-[42px] rounded-lg overflow-hidden bg-white transition-all',
                  active ? 'ring-2 ring-indigo-500 shadow-md' : 'ring-1 ring-slate-200 opacity-80 hover:opacity-100 hover:ring-slate-300',
                )}
                title={`${n}. ${s.name}`}
                aria-label={`${n}번 슬라이드: ${s.name}`}
                aria-current={active ? 'true' : undefined}
              >
                {s.thumbnail ? <img src={s.thumbnail} alt="" className="w-full h-full object-contain" /> : null}
                <span className={cn('absolute left-1 bottom-0.5 text-[10px] font-bold leading-none px-1 py-0.5 rounded', active ? 'bg-indigo-600 text-white' : 'bg-white/90 text-slate-500')}>{n}</span>
              </button>
            );
          })}
        </div>
        <button onClick={onAddSlide} className="w-9 h-10 sm:h-12 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-900/5" title="슬라이드 추가" aria-label="슬라이드 추가">
          <Plus size={19} />
        </button>
        <div className="w-px h-7 bg-slate-200 mx-0.5" />
        <button onClick={onOpenSlideNavigator} className="flex items-center gap-1.5 h-10 sm:h-12 px-2.5 rounded-xl text-slate-600 hover:bg-slate-900/5" title="슬라이드 전체 보기" aria-label="슬라이드 전체 보기">
          <LayoutGrid size={16} />
          <span className="text-[13px] font-semibold tabular-nums">{idx + 1} / {total}</span>
        </button>
        <button onClick={onNextSlide} disabled={idx >= total - 1} className="w-9 h-10 sm:h-12 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-900/5 disabled:opacity-30" title="다음 슬라이드 (PageDown)" aria-label="다음 슬라이드">
          <ChevronRight size={19} />
        </button>
      </div>

      {/* 확대 비율 */}
      <div className={cn('pointer-events-auto items-center p-1.5 rounded-2xl', glass, isPhone ? 'hidden' : 'flex')}>
        <button onClick={onZoomOut} className="w-9 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-900/5" title="축소" aria-label="축소"><Minus size={16} /></button>
        <button onClick={onResetZoom} className="h-10 px-2 min-w-[56px] rounded-xl text-[13px] font-semibold tabular-nums text-slate-700 hover:bg-slate-900/5" title="100%로 돌아가기" aria-label={`확대 비율 ${zoomPercent}%, 누르면 100%`}>
          {zoomPercent}%
        </button>
        <button onClick={onZoomIn} className="w-9 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-900/5" title="확대" aria-label="확대"><Plus size={16} /></button>
      </div>
    </div>
  );
};
