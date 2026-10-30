import React, { useEffect, useRef, useState } from 'react';
import { MonitorUp, ExternalLink, Square, MousePointer2 } from 'lucide-react';

/**
 * 다른 앱 안에서 열리지 않는 사이트(네이버·다음 등)를 보여 주는 방법:
 * 브라우저 새 탭에서 사이트를 열고, 그 탭의 화면을 실시간으로 이 창에 가져온다(화면 공유 기능).
 * - 크롬·엣지 최신판은 이 창에서 휠로 그 탭을 스크롤할 수도 있다(Captured Surface Control).
 * - 판서·녹화 화면에도 그대로 담긴다.
 */
export function canCaptureTabs() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}

export const TabCaptureView: React.FC<{
  url: string;
  host: string;
  /** 녹화에 쓰도록 비디오 요소를 알려 준다 */
  registerVideo?: (v: HTMLVideoElement | null) => void;
}> = ({ url, host, registerVideo }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [wheel, setWheel] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setLive(false);
    setWheel(false);
    registerVideo?.(null);
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const openTab = () => { window.open(url, '_blank', 'noopener'); };

  const capture = async () => {
    setMsg(null);
    try {
      const Ctl = (window as any).CaptureController;
      const controller = Ctl ? new Ctl() : undefined;
      const stream: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: 30 },
        audio: true, // 그 탭의 소리(영상 등)도 함께
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        ...(controller ? { controller } : {}),
      });
      // 가져온 뒤에도 이 수업 화면에 머문다
      try { controller?.setFocusBehavior?.('no-focus-change'); } catch { /* 지원 안 함 */ }
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener('ended', stop);
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      setLive(true);
      registerVideo?.(v);
      // 크롬 136+: 이 창에서 휠을 굴리면 가져온 탭이 스크롤된다
      if (controller?.forwardWheel) {
        try { await controller.forwardWheel(v); setWheel(true); } catch { /* 권한 거절 또는 미지원 */ }
      }
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') setMsg('화면 가져오기를 취소했거나 허락하지 않았습니다.');
      else setMsg('이 브라우저에서는 화면 가져오기를 쓸 수 없습니다. 크롬·엣지를 써 주세요.');
    }
  };

  return (
    <div className="absolute inset-0 bg-slate-900">
      <video ref={videoRef} muted playsInline className={live ? 'absolute inset-0 w-full h-full object-contain bg-black' : 'hidden'} />
      {live ? (
        <div className="absolute left-2 bottom-2 flex items-center gap-1.5">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 text-white text-[11px]">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />{host} 탭 화면{wheel ? ' · 휠로 스크롤 가능' : ' · 조작은 그 탭에서'}
          </span>
          <button onClick={stop} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 text-white text-[11px] hover:bg-black/80"><Square size={11} />그만 가져오기</button>
        </div>
      ) : (
        <div className="absolute inset-0 overflow-y-auto flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center"><MonitorUp size={24} /></div>
          <div>
            <div className="text-[15px] font-bold">{host}은(는) 다른 앱 안에서 직접 열리지 않는 사이트입니다</div>
            <p className="mt-1 text-[12px] text-white/60 leading-relaxed">브라우저 새 탭에서 열어 둔 뒤, 그 탭의 화면을 이 창으로 실시간으로 가져와 수업 화면에 띄웁니다.<br />판서·녹화에도 함께 담깁니다.</p>
          </div>
          <ol className="w-full max-w-sm space-y-2 text-left text-[13px]">
            <li className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
              <span className="w-6 h-6 shrink-0 rounded-full bg-white text-slate-900 font-bold flex items-center justify-center text-[12px]">1</span>
              <span className="flex-1">새 탭에서 {host} 열기</span>
              <button onClick={openTab} className="flex items-center gap-1 h-8 px-3 rounded-lg bg-white text-slate-900 font-semibold text-[12px]"><ExternalLink size={13} />열기</button>
            </li>
            <li className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
              <span className="w-6 h-6 shrink-0 rounded-full bg-white text-slate-900 font-bold flex items-center justify-center text-[12px]">2</span>
              <span className="flex-1">그 탭을 골라 화면 가져오기</span>
              <button onClick={capture} disabled={!canCaptureTabs()} className="flex items-center gap-1 h-8 px-3 rounded-lg bg-indigo-500 text-white font-semibold text-[12px] disabled:opacity-40"><MousePointer2 size={13} />가져오기</button>
            </li>
          </ol>
          <p className="text-[11px] text-white/40">크롬·엣지·사파리 컴퓨터용에서 됩니다(아이패드는 화면 가져오기를 지원하지 않음).</p>
          {msg && <p className="text-[12px] text-red-300" role="alert">{msg}</p>}
        </div>
      )}
    </div>
  );
};
