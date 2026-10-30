// 웹 앱에 '데스크톱에서 실행 중'임을 알려 준다 (Node 기능은 넘기지 않음)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('okssamDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || '',
  openExternal: url => ipcRenderer.send('open-external', String(url)),
});
