/**
 * 옥쌤보드 데스크톱
 * - 웹 앱(https://fumon1218.github.io/educanvas-pro/)을 그대로 열고, 늘 최신 버전을 쓴다(오프라인은 앱의 저장본).
 * - 수업 창의 '웹 브라우저'가 진짜 브라우저(webview)로 열려 네이버·다음 등 모든 사이트를 쓸 수 있다.
 */
const { app, BrowserWindow, shell, session, ipcMain, desktopCapturer, Menu } = require('electron');

const APP_URL = process.env.OKSSAM_URL || 'https://fumon1218.github.io/educanvas-pro/';
const APP_ORIGIN = new URL(APP_URL).origin;
// 구글 로그인은 '내장 브라우저'를 막으므로 일반 크롬과 같은 이름표를 쓴다
const CHROME_UA = () => {
  const v = process.versions.chrome || '130.0.0.0';
  const os = process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
};
const AUTH_HOSTS = ['accounts.google.com', 'gen-lang-client-0451170730.firebaseapp.com', 'apis.google.com'];

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: '옥쌤보드',
    backgroundColor: '#eef1f6',
    webPreferences: {
      preload: require('path').join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false,
    },
  });
  win.webContents.setUserAgent(CHROME_UA());
  win.loadURL(APP_URL);

  // 로그인 팝업은 앱 안에서, 그 밖의 새 창은 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const h = new URL(url).hostname;
      if (AUTH_HOSTS.includes(h)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true } };
    } catch { /* 무시 */ }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // 앱 화면이 다른 사이트로 넘어가지 않게
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_ORIGIN)) { e.preventDefault(); shell.openExternal(url); }
  });
}

app.on('web-contents-created', (_e, contents) => {
  // 로그인 팝업도 크롬 이름표
  if (contents.getType() === 'window') contents.setUserAgent(CHROME_UA());
  if (contents.getType() !== 'webview') return;
  contents.setUserAgent(CHROME_UA());
  // 수업 창(webview) 안에서 새 창을 열면 같은 창에서 연다
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) contents.loadURL(url);
    return { action: 'deny' };
  });
});

// webview는 웹 주소만, Node 기능 없이
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (_ev, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    if (!/^https?:/i.test(params.src || 'https:')) _ev.preventDefault();
  });
});

ipcMain.on('open-external', (_e, url) => { if (/^https?:/i.test(url)) shell.openExternal(url); });

app.whenReady().then(() => {
  // 녹화(마이크·카메라·화면), 전체 화면, 클립보드 허락
  const allow = new Set(['media', 'display-capture', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'notifications']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allow.has(permission)));
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then(sources => cb({ video: sources[0] }));
  }, { useSystemPicker: true });

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' },
      { label: '보기', submenu: [{ role: 'reload', label: '새로 고침' }, { role: 'togglefullscreen', label: '전체 화면' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
      { role: 'windowMenu' },
    ]));
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
