import React, { useState } from 'react';
import { Hand, ChevronDown, ChevronUp, X, RotateCcw, Users } from 'lucide-react';
import type { Poll, StudentState } from '@/src/lib/studentCast';
import { cn } from '@/src/lib/utils';

/** 학생 반응 판: 손든 학생, O/X·번호 묻기와 결과 */
export const StudentResponsePanel: React.FC<{
  students: StudentState[];
  connected: number;
  poll: Poll | null;
  onPoll: (p: Poll | null) => void;
  onLower: (sid?: string) => void;
  className?: string;
}> = ({ students, connected, poll, onPoll, onLower, className }) => {
  const [open, setOpen] = useState(true);
  const [showNames, setShowNames] = useState(false);
  const hands = students.filter(s => s.hand).sort((a, b) => a.handAt - b.handAt);
  const options = poll ? (poll.kind === 'ox' ? ['O', 'X'] : Array.from({ length: poll.n || 4 }, (_, i) => String(i + 1))) : [];
  const answered = poll ? students.filter(s => s.answer?.pollId === poll.id) : [];
  const countOf = (v: string) => answered.filter(s => s.answer!.value === v).length;
  const max = Math.max(1, ...options.map(countOf));
  const newPoll = (kind: Poll['kind'], n?: number) => onPoll({ id: Math.random().toString(36).slice(2, 9), kind, n });

  return (
    <div className={cn('absolute z-30 w-[268px] rounded-2xl bg-white/95 backdrop-blur-xl ring-1 ring-slate-900/[0.07] shadow-[0_12px_32px_-12px_rgba(15,23,42,0.3)] text-[13px]', className)} role="region" aria-label="학생 반응">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2.5">
        <Users size={15} className="text-sky-600" />
        <span className="font-semibold text-slate-800">학생 반응</span>
        <span className="text-slate-500">· {connected}명 연결</span>
        {hands.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[11px] font-bold">✋ {hands.length}</span>}
        <span className="ml-auto text-slate-400">{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-semibold text-slate-500">손든 학생</span>
              {hands.length > 0 && <button onClick={() => onLower()} className="text-[11px] text-slate-500 hover:text-slate-800">모두 내리기</button>}
            </div>
            {hands.length === 0 ? (
              <p className="text-[12px] text-slate-400">아직 없습니다</p>
            ) : (
              <ol className="space-y-1 max-h-28 overflow-y-auto">
                {hands.map((s, i) => (
                  <li key={s.sid} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-amber-50">
                    <span className="w-4 text-[11px] font-bold text-amber-700">{i + 1}</span>
                    <Hand size={13} className="text-amber-600" />
                    <span className="flex-1 truncate text-slate-800">{s.name}</span>
                    <button onClick={() => onLower(s.sid)} className="p-0.5 text-slate-400 hover:text-slate-700" aria-label={`${s.name} 손 내리기`}><X size={13} /></button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100">
            {!poll ? (
              <>
                <div className="text-[12px] font-semibold text-slate-500 mb-1.5">학생에게 묻기</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button onClick={() => newPoll('ox')} className="h-9 rounded-lg bg-slate-900 text-white font-semibold">O / X</button>
                  <button onClick={() => newPoll('choice', 4)} className="h-9 rounded-lg bg-slate-100 text-slate-700 font-semibold">1~4</button>
                  <button onClick={() => newPoll('choice', 5)} className="h-9 rounded-lg bg-slate-100 text-slate-700 font-semibold">1~5</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-slate-500">답한 학생 {answered.length} / {students.length || connected}</span>
                  <button onClick={() => setShowNames(v => !v)} className="text-[11px] text-slate-500 hover:text-slate-800">{showNames ? '이름 숨기기' : '이름 보기'}</button>
                </div>
                <div className="space-y-1.5">
                  {options.map(v => (
                    <div key={v}>
                      <div className="flex items-center gap-2">
                        <span className={cn('w-6 text-center font-black', v === 'O' ? 'text-sky-600' : v === 'X' ? 'text-rose-600' : 'text-slate-700')}>{v}</span>
                        <div className="flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
                          <div className={cn('h-full rounded-md transition-all', v === 'O' ? 'bg-sky-400' : v === 'X' ? 'bg-rose-400' : 'bg-indigo-400')} style={{ width: `${(countOf(v) / max) * 100}%` }} />
                        </div>
                        <span className="w-6 text-right tabular-nums font-semibold text-slate-700">{countOf(v)}</span>
                      </div>
                      {showNames && countOf(v) > 0 && <div className="pl-8 text-[11px] text-slate-500 truncate">{answered.filter(s => s.answer!.value === v).map(s => s.name).join(', ')}</div>}
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button onClick={() => newPoll(poll.kind, poll.n)} className="h-8 rounded-lg bg-slate-100 text-slate-700 font-semibold flex items-center justify-center gap-1"><RotateCcw size={13} />다시 묻기</button>
                  <button onClick={() => onPoll(null)} className="h-8 rounded-lg bg-slate-900 text-white font-semibold">묻기 끝내기</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
