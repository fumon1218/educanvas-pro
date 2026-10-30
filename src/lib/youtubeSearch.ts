/**
 * 앱 안에서 유튜브 영상 찾기 (YouTube Data API v3, 무료 할당량: 하루 약 100번 검색).
 * 키는 관리자가 Google Cloud에서 만든 '브라우저용 API 키'를 설정에 넣어 쓴다(이 기기에 보관).
 */
const KEY = 'okssam_youtube_key';

export const getYouTubeKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setYouTubeKey = (v: string) => { try { if (v.trim()) localStorage.setItem(KEY, v.trim()); else localStorage.removeItem(KEY); } catch { /* 무시 */ } };

export interface YouTubeResult { id: string; title: string; channel: string; thumb: string; duration?: string }

const cache = new Map<string, YouTubeResult[]>();

const decode = (s: string) => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };

/** ISO 8601 길이(PT4M13S) → 4:13 */
const fmtDur = (iso?: string) => {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const h = +(m[1] || 0), mi = +(m[2] || 0), s = +(m[3] || 0);
  return h ? `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${mi}:${String(s).padStart(2, '0')}`;
};

export class YouTubeSearchError extends Error {
  constructor(public code: 'no-key' | 'quota' | 'bad-key' | 'network' | 'other', msg: string) { super(msg); }
}

export async function searchYouTube(q: string): Promise<YouTubeResult[]> {
  const key = getYouTubeKey();
  if (!key) throw new YouTubeSearchError('no-key', '유튜브 검색 키가 아직 없습니다.');
  const query = q.trim();
  if (cache.has(query)) return cache.get(query)!;
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', safeSearch: 'strict',
    maxResults: '12', regionCode: 'KR', relevanceLanguage: 'ko', q: query, key,
  });
  let res: Response;
  try { res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`); }
  catch { throw new YouTubeSearchError('network', '인터넷 연결을 확인해 주세요.'); }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (/quota/i.test(body)) throw new YouTubeSearchError('quota', '오늘 쓸 수 있는 검색 횟수를 다 썼습니다. 내일 다시 쓸 수 있습니다.');
    if (res.status === 400 || res.status === 403) throw new YouTubeSearchError('bad-key', '유튜브 검색 키가 맞지 않거나, 이 사이트에서 쓰도록 허락되지 않았습니다.');
    throw new YouTubeSearchError('other', `검색 오류 (${res.status})`);
  }
  const json = await res.json();
  const items: YouTubeResult[] = (json.items || []).filter((i: any) => i.id?.videoId).map((i: any) => ({
    id: i.id.videoId,
    title: decode(i.snippet?.title || ''),
    channel: decode(i.snippet?.channelTitle || ''),
    thumb: i.snippet?.thumbnails?.medium?.url || i.snippet?.thumbnails?.default?.url || '',
  }));
  // 영상 길이 (1회 추가 요청, 할당량 1)
  try {
    const ids = items.map(i => i.id).join(',');
    if (ids) {
      const r2 = await fetch(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: 'contentDetails', id: ids, key })}`);
      if (r2.ok) {
        const j2 = await r2.json();
        const dur = new Map<string, string | undefined>((j2.items || []).map((v: any) => [v.id, fmtDur(v.contentDetails?.duration)]));
        items.forEach(i => { i.duration = dur.get(i.id); });
      }
    }
  } catch { /* 길이는 없어도 된다 */ }
  cache.set(query, items);
  return items;
}
