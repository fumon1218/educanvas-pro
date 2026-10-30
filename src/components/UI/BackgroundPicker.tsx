import React, { useEffect, useRef, useState } from 'react';
import { BACKGROUND_LIST, drawBackground, type CanvasBackground } from '@/src/lib/backgrounds';
import { cn } from '@/src/lib/utils';

export type BackgroundScope = 'slide' | 'all';

/** 배경 무늬 미리보기 한 칸 */
const Swatch: React.FC<{ bg: CanvasBackground }> = ({ bg }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = 96 * dpr; el.height = 60 * dpr;
    const ctx = el.getContext('2d');
    if (ctx) drawBackground(ctx, bg, el.width, el.height, [0.42, 0, 0, 0.42, 0, 0], dpr, { x: 120, y: 72 });
  }, [bg]);
  return <canvas ref={ref} className="w-full h-full rounded-md" aria-hidden="true" />;
};

/** 수업 배경(템플릿) 고르기 — 이 슬라이드만 / 모든 슬라이드 */
export const BackgroundPicker: React.FC<{
  value: CanvasBackground;
  onChange: (bg: CanvasBackground, scope: BackgroundScope) => void;
  compact?: boolean;
}> = ({ value, onChange, compact }) => {
  const [scope, setScope] = useState<BackgroundScope>('slide');
  return (
    <div>
      <div className="flex p-0.5 mb-2.5 bg-slate-100 rounded-lg text-[12px] font-semibold" role="radiogroup" aria-label="적용 범위">
        {(['slide', 'all'] as const).map(s => (
          <button
            key={s}
            role="radio"
            aria-checked={scope === s}
            onClick={() => setScope(s)}
            className={cn('flex-1 py-1.5 rounded-md transition-colors', scope === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
          >
            {s === 'slide' ? '이 슬라이드만' : '모든 슬라이드'}
          </button>
        ))}
      </div>
      <div className={cn('grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3')}>
        {BACKGROUND_LIST.map(b => (
          <button
            key={b.id}
            onClick={() => onChange(b.id, scope)}
            title={b.hint}
            aria-label={`배경 ${b.label}`}
            aria-pressed={value === b.id}
            className={cn('group flex flex-col gap-1 p-1 rounded-xl text-left transition-all', value === b.id ? 'ring-2 ring-indigo-500 bg-indigo-50/60' : 'ring-1 ring-slate-200 hover:ring-slate-300')}
          >
            <div className="h-[46px] overflow-hidden rounded-md ring-1 ring-slate-900/5"><Swatch bg={b.id} /></div>
            <span className={cn('px-1 pb-0.5 text-[11px] font-semibold', value === b.id ? 'text-indigo-700' : 'text-slate-600')}>{b.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
