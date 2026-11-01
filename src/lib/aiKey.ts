/**
 * AI(Gemini) 키
 *  - 각자 [설정 → AI 기능]에서 자기 키를 넣는다. 키는 이 기기(브라우저)에만 저장하고 어디로도 보내지 않는다
 *    (Google Gemini에 질문을 보낼 때만 쓴다).
 *  - 키는 https://aistudio.google.com/apikey 에서 무료로 만든다. 결제를 등록하지 않으면 무료 사용량 안에서만 쓰인다.
 *  - 앱을 만들 때 GEMINI_API_KEY를 넣었다면 그 키를 기본으로 쓴다 (자기 키가 있으면 자기 키가 먼저).
 */
const KEY = 'okssam_gemini_key';
const BUILT_IN = process.env.GEMINI_API_KEY || '';

export const getUserAiKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const getAiKey = () => getUserAiKey() || BUILT_IN;
export const setUserAiKey = (k: string) => {
  try { if (k) localStorage.setItem(KEY, k.trim()); else localStorage.removeItem(KEY); } catch { /* 무시 */ }
  window.dispatchEvent(new CustomEvent('okssam:ai-key'));
};
/** Google AI Studio 키 모양 (AIza로 시작하는 39자) */
export const looksLikeKey = (k: string) => /^AIza[0-9A-Za-z_-]{30,}$/.test(k.trim());
