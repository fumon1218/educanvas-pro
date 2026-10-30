import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, Trash2, Search, Box, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { addModel, deleteModel, formatBytes, listModels, ModelAsset, setModelThumb, storageEstimate } from '@/src/lib/assetStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 모델을 슬라이드에 넣고 3D 창으로 연다 */
  onInsert: (asset: ModelAsset) => void;
}

/** GLB 파일 여러 개를 자산함에 넣는다 (미리보기 그림도 만든다). 넣은 모델 목록을 돌려준다. */
export async function importModelFiles(files: File[], onProgress?: (done: number, total: number) => void): Promise<ModelAsset[]> {
  const { renderThumbnail } = await import('@/src/lib/three3d');
  const out: ModelAsset[] = [];
  const glbs = files.filter(f => /\.glb$/i.test(f.name));
  const skipped = files.length - glbs.length;
  if (skipped > 0) toast.info(`GLB가 아닌 파일 ${skipped}개는 건너뛰었습니다.`, { description: 'glTF는 텍스처가 하나로 묶인 .glb 형식만 넣을 수 있습니다.' });
  for (let i = 0; i < glbs.length; i++) {
    onProgress?.(i, glbs.length);
    try {
      const { asset, existed } = await addModel(glbs[i]);
      if (!existed || !asset.thumb) {
        try {
          const thumb = await renderThumbnail(glbs[i]);
          await setModelThumb(asset.id, thumb);
          asset.thumb = thumb;
        } catch (err) {
          console.warn('미리보기를 만들지 못했습니다', glbs[i].name, err);
        }
      }
      out.push(asset);
    } catch (err) {
      console.error(err);
      toast.error(`'${glbs[i].name}'을(를) 넣지 못했습니다.`, { description: '저장 공간이 부족할 수 있습니다.' });
    }
  }
  onProgress?.(glbs.length, glbs.length);
  return out;
}

export const AssetLibrary: React.FC<Props> = ({ isOpen, onClose, onInsert }) => {
  const [items, setItems] = useState<ModelAsset[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [usage, setUsage] = useState<string>('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setItems(await listModels());
    const e = await storageEstimate();
    if (e && e.quota) setUsage(`${formatBytes(e.usage)} 사용 / 약 ${formatBytes(e.quota)} 가능`);
  }, []);

  useEffect(() => { if (isOpen) refresh(); }, [isOpen, refresh]);

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(`0 / ${files.length}`);
    const added = await importModelFiles(files, (d, t) => setBusy(`${d} / ${t}`));
    setBusy(null);
    if (added.length) toast.success(`3D 모델 ${added.length}개를 자산함에 넣었습니다.`);
    refresh();
  };

  const filtered = (items || []).filter(i => i.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div
            role="dialog" aria-modal="true" aria-label="3D 자산함"
            initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="relative w-full max-w-4xl h-[min(80vh,720px)] flex flex-col bg-white rounded-3xl shadow-2xl ring-1 ring-black/5"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); onFiles(Array.from(e.dataTransfer.files)); }}
          >
            <div className="flex items-center gap-3 p-5 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600"><Box size={20} /></div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-slate-900">3D 자산함</h2>
                <p className="text-xs text-slate-500">GLB 파일을 이 브라우저에 보관하고 어느 슬라이드에서든 꺼내 씁니다. {usage}</p>
              </div>
              <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
            </div>
            <div className="flex items-center gap-2 px-5 py-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름으로 찾기" className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" aria-label="3D 모델 찾기" />
              </div>
              <input ref={inputRef} type="file" accept=".glb,model/gltf-binary" multiple className="hidden" onChange={e => { onFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
              <button onClick={() => inputRef.current?.click()} disabled={!!busy} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {busy ? `넣는 중 ${busy}` : 'GLB 파일 넣기 (여러 개 가능)'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {items === null ? (
                <div className="h-full flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
                  <Box size={36} strokeWidth={1.2} />
                  <div className="text-sm">{items.length === 0 ? '아직 넣은 3D 모델이 없습니다.' : '찾는 이름의 모델이 없습니다.'}</div>
                  <div className="text-xs">GLB 파일을 이곳에 끌어다 놓거나 위 버튼으로 여러 개를 한꺼번에 넣으세요.</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {filtered.map(a => (
                    <div key={a.id} className="group relative rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden hover:shadow-lg hover:border-indigo-200 transition">
                      <button onClick={() => onInsert(a)} className="block w-full aspect-square bg-gradient-to-b from-white to-slate-100" title="슬라이드에 넣고 3D로 보기">
                        {a.thumb ? <img src={a.thumb} alt="" className="w-full h-full object-contain p-2" /> : <Box className="mx-auto text-slate-300" size={40} />}
                        <span className="absolute inset-x-2 top-2 hidden group-hover:flex items-center justify-center gap-1 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold"><Plus size={12} />슬라이드에 넣기</span>
                      </button>
                      <div className="px-2.5 py-2 bg-white">
                        <div className="text-xs font-medium text-slate-700 truncate" title={a.name}>{a.name.replace(/\.glb$/i, '')}</div>
                        <div className="text-[10px] text-slate-400">{formatBytes(a.size)}</div>
                      </div>
                      {confirmDel === a.id ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/95 p-2 text-center">
                          <span className="text-xs text-slate-700">자산함에서 지울까요?<br /><span className="text-slate-400">슬라이드의 카드는 남지만 3D로 열 수 없게 됩니다.</span></span>
                          <div className="flex gap-1.5">
                            <button onClick={async () => { await deleteModel(a.id); setConfirmDel(null); refresh(); }} className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold">지우기</button>
                            <button onClick={() => setConfirmDel(null)} className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs">취소</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDel(a.id)} className="absolute right-1.5 bottom-9 hidden group-hover:block p-1.5 rounded-lg bg-white/90 text-slate-400 hover:text-red-500 shadow-sm" aria-label={`${a.name} 지우기`} title="자산함에서 지우기">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
