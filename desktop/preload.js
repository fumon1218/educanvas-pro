// 웹 앱에 '데스크톱에서 실행 중'임을 알려 준다 (Node 기능은 넘기지 않음)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('okssamDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || '',
  openExternal: url => ipcRenderer.send('open-external', String(url)),
  // 컴퓨터에 깔린 키노트·페이지스·넘버스·오피스로 문서를 PDF로 바꾼다
  convertToPdf: (name, data) => ipcRenderer.invoke('convert-to-pdf', String(name), data),
});
