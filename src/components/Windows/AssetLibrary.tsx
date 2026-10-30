import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, Trash2, Search, Box, Loader2, Plus, FolderOpen, Cloud, Check, ArrowLeft } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';
import { addModel, deleteModel, formatBytes, listModels, ModelAsset, setModelThumb, storageEstimate } from '@/src/lib/assetStore';
import type { DriveFile } from '@/src/lib/googleDrive';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 모델을 슬라이드에 넣고 3D 창으로 연다 */
  onInsert: (asset: ModelAsset) => void;
}

/** GLB 하나를 자산함에 넣고 미리보기 그림을 만든다 (드라이브에서 받은 파일 포함) */
export async function importModelBlob(blob: Blob, opts: { name: string; driveId?: string; id?: string }): Promise<ModelAsset> {
  const { renderThumbnail } = await import('@/src/lib/three3d');
  const { asset, existed } = await addModel(blob, opts);
  if (!existed || !asset.thumb) {
    try {
      const thumb = await renderThumbnail(blob);
      await setModelThumb(asset.id, thumb);
      asset.thumb = thumb;
    } catch (err) {
      console.warn('미리보기를 만들지 못했습니다', opts.name, err);
    }
  }
  return asset;
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
  const folderRef = useRef<HTMLInputElement>(null);
  // 구글 드라이브
  const [drive, setDrive] = useState<{ files: DriveFile[]; token: string } | null>(null);
  const [driveBusy, setDriveBusy] = useState<string | null>(null);
  const [driveQ, setDriveQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [haveDrive, setHaveDrive] = useState<Set<string>>(new Set());

  useEffect(() => {
    // webkitdirectory는 표준 속성이 아니라 직접 붙인다
    folderRef.current?.setAttribute('webkitdirectory', '');
    folderRef.current?.setAttribute('directory', '');
  }, [isOpen]);

  const openDrive = async (force = false) => {
    setDriveBusy('구글 드라이브에 연결하는 중…');
    try {
      const { getDriveToken, listGlbFiles } = await import('@/src/lib/googleDrive');
      const token = await getDriveToken(force);
      setDriveBusy('GLB 파일을 찾는 중…');
      const files = await listGlbFiles(token);
      setDrive({ files, token });
      setPicked(new Set());
      setHaveDrive(new Set((await listModels()).map(m => m.driveId).filter(Boolean) as string[]));
      if (!files.length) toast.info('드라이브에서 GLB 파일을 찾지 못했습니다.');
    } catch (e: any) {
      if (e?.code !== 'cancelled') toast.error('구글 드라이브를 열지 못했습니다.', { description: e?.message });
    } finally {
      setDriveBusy(null);
    }
  };

  const importFromDrive = async () => {
    if (!drive || !picked.size) return;
    const { downloadDriveFile, getDriveToken } = await import('@/src/lib/googleDrive');
    const list = drive.files.filter(f => picked.has(f.id));
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      setDriveBusy(`받는 중 ${i + 1} / ${list.length} · ${list[i].name}`);
      try {
        let blob: Blob;
        try { blob = await downloadDriveFile(drive.token, list[i].id); }
        catch (e: any) { if (e?.code !== 'expired') throw e; const t = await getDriveToken(true); setDrive(d => (d ? { ...d, token: t } : d)); blob = await downloadDriveFile(t, list[i].id); }
        await importModelBlob(blob, { name: list[i].name, driveId: list[i].id });
        ok++;
      } catch (e: any) {
        toast.error(`'${list[i].name}'을(를) 받지 못했습니다.`, { description: e?.message });
      }
    }
    setDriveBusy(null);
    if (ok) toast.success(`구글 드라이브에서 3D 모델 ${ok}개를 가져왔습니다.`, { description: '다른 컴퓨터에서도 같은 계정으로 드라이브에서 다시 받을 수 있습니다.' });
    setDrive(null);
    refresh();
  };

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
                <p className="text-xs text-slate-500">GLB를 이 브라우저에 보관하고 어느 슬라이드에서든 꺼내 씁니다. 구글 드라이브에서 가져온 모델은 다른 컴퓨터에서도 다시 받을 수 있습니다. {usage}</p>
              </div>
              <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
            </div>
            <div className="flex items-center gap-2 px-5 py-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름으로 찾기" className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" aria-label="3D 모델 찾기" />
              </div>
              <input ref={inputRef} type="file" accept=".glb,model/gltf-binary" multiple className="hidden" onChange={e => { onFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
              <input ref={folderRef} type="file" multiple className="hidden" onChange={e => { onFiles(Array.from(e.target.files || []).filter(f => /\.glb$/i.test(f.name))); e.target.value = ''; }} />
              <button onClick={() => openDrive()} disabled={!!busy || !!driveBusy} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60" title="구글 드라이브에 있는 GLB를 찾아 가져옵니다">
                <Cloud size={16} className="text-sky-600" />구글 드라이브
              </button>
              <button onClick={() => folderRef.current?.click()} disabled={!!busy} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60" title="폴더 안(하위 폴더 포함)의 GLB를 모두 넣습니다">
                <FolderOpen size={16} className="text-amber-500" />폴더째
              </button>
              <button onClick={() => inputRef.current?.click()} disabled={!!busy} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {busy ? `넣는 중 ${busy}` : 'GLB 파일 넣기'}
              </button>
            </div>
            {(drive || driveBusy) && (
              <div className="absolute inset-0 z-10 flex flex-col bg-white rounded-3xl">
                <div className="flex items-center gap-3 p-5 border-b border-slate-100">
                  <button onClick={() => { setDrive(null); setDriveBusy(null); }} className="p-2 rounded-full text-slate-500 hover:bg-slate-100" aria-label="자산함으로 돌아가기"><ArrowLeft size={18} /></button>
                  <Cloud size={20} className="text-sky-600" />
                  <div className="flex-1">
                    <h3 className="text-[15px] font-bold text-slate-900">구글 드라이브의 3D 모델</h3>
                    <p className="text-xs text-slate-500">가져올 모델을 고르세요. 이미 가져온 모델은 표시됩니다.</p>
                  </div>
                </div>
                {driveBusy ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500"><Loader2 className="animate-spin text-sky-600" size={28} /><span className="text-sm">{driveBusy}</span></div>
                ) : drive && (
                  <>
                    <div className="flex items-center gap-2 px-5 py-3">
                      <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={driveQ} onChange={e => setDriveQ(e.target.value)} placeholder="이름으로 찾기" className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 text-sm outline-none" aria-label="드라이브 모델 찾기" />
                      </div>
                      <button onClick={() => setPicked(new Set(drive.files.filter(f => !haveDrive.has(f.id) && f.name.toLowerCase().includes(driveQ.trim().toLowerCase())).map(f => f.id)))} className="px-3 py-2 rounded-xl bg-slate-100 text-sm text-slate-600">보이는 것 모두 고르기</button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5">
                      <ul className="divide-y divide-slate-100">
                        {drive.files.filter(f => f.name.toLowerCase().includes(driveQ.trim().toLowerCase())).map(f => {
                          const on = picked.has(f.id), have = haveDrive.has(f.id);
                          return (
                            <li key={f.id}>
                              <button
                                disabled={have}
                                onClick={() => setPicked(p => { const n = new Set(p); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}
                                className="w-full flex items-center gap-3 py-2.5 text-left disabled:opacity-50"
                                aria-pressed={on}
                              >
                                <span className={cn('w-5 h-5 rounded-md flex items-center justify-center ring-1', on ? 'bg-indigo-600 ring-indigo-600 text-white' : 'ring-slate-300')}>{on && <Check size={13} />}</span>
                                <Box size={16} className="text-slate-400" />
                                <span className="flex-1 min-w-0 text-[13px] text-slate-800 truncate">{f.name.replace(/\.glb$/i, '')}</span>
                                <span className="text-[11px] text-slate-400 tabular-nums">{have ? '가져옴' : f.size ? formatBytes(+f.size) : ''}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
                      <span className="text-xs text-slate-500 mr-auto">{drive.files.length}개 중 {picked.size}개 고름{picked.size ? ` · ${formatBytes(drive.files.filter(f => picked.has(f.id)).reduce((a, f) => a + (+(f.size || 0)), 0))}` : ''}</span>
                      <button onClick={importFromDrive} disabled={!picked.size} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40">가져오기</button>
                    </div>
                  </>
                )}
              </div>
            )}
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
