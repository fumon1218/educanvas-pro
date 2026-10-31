/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_MODEL?: string;
  /** 'lite' = 출시판 */
  readonly VITE_EDITION?: string;
}
