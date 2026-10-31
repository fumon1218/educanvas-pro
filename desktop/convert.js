/**
 * 문서 → PDF 변환 (옥쌤보드 데스크톱 전용)
 *
 * 컴퓨터에 이미 깔린 프로그램으로 원본 그대로 PDF를 만든다. 파일은 이 컴퓨터 밖으로 나가지 않는다.
 *  - 맥: 키노트(key·pptx·ppt), 페이지스(pages·docx·doc·rtf), 넘버스(numbers·xlsx·xls·csv)
 *  - 윈도우: 파워포인트·워드 (깔려 있으면)
 *  - 어디서나: LibreOffice (깔려 있으면, 한글 hwp 포함)
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = (cmd, args, timeout = 150000) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) reject(new Error(String(stderr || err.message).slice(0, 400))); else resolve(stdout);
  });
});

const MAC_APP = {
  key: 'Keynote', pptx: 'Keynote', ppt: 'Keynote', ppsx: 'Keynote', odp: 'Keynote',
  pages: 'Pages', docx: 'Pages', doc: 'Pages', rtf: 'Pages', odt: 'Pages',
  numbers: 'Numbers', xlsx: 'Numbers', xls: 'Numbers', csv: 'Numbers',
};

/** AppleScript 문자열 안에 안전하게 넣기 */
const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

async function viaApple(appName, input, output) {
  const script = [
    `tell application ${q(appName)}`,
    `  set d to open (POSIX file ${q(input)})`,
    `  delay 0.5`,
    `  export d to (POSIX file ${q(output)}) as PDF`,
    `  close d saving no`,
    `end tell`,
  ].join('\n');
  await run('osascript', ['-e', script]);
}

async function viaOfficeWin(ext, input, output) {
  const ps = (s) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', s]);
  const esc = s => s.replace(/'/g, "''");
  if (['ppt', 'pptx', 'ppsx', 'odp'].includes(ext)) {
    await ps(`$a=New-Object -ComObject PowerPoint.Application; $p=$a.Presentations.Open('${esc(input)}',$true,$false,$false); $p.SaveAs('${esc(output)}',32); $p.Close(); $a.Quit()`);
  } else if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) {
    await ps(`$a=New-Object -ComObject Word.Application; $a.Visible=$false; $d=$a.Documents.Open('${esc(input)}',$false,$true); $d.SaveAs2('${esc(output)}',17); $d.Close($false); $a.Quit()`);
  } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
    await ps(`$a=New-Object -ComObject Excel.Application; $a.Visible=$false; $w=$a.Workbooks.Open('${esc(input)}',0,$true); $w.ExportAsFixedFormat(0,'${esc(output)}'); $w.Close($false); $a.Quit()`);
  } else throw new Error('no office app');
}

function findSoffice() {
  const c = process.platform === 'darwin'
    ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice']
    : process.platform === 'win32'
      ? ['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe']
      : ['/usr/bin/soffice', '/usr/local/bin/soffice'];
  return c.find(p => { try { return fs.existsSync(p); } catch { return false; } });
}

async function viaLibreOffice(input, dir) {
  const bin = findSoffice();
  if (!bin) throw new Error('no libreoffice');
  await run(bin, ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', dir, input]);
  const out = path.join(dir, path.basename(input).replace(/\.[^.]+$/, '') + '.pdf');
  if (!fs.existsSync(out)) throw new Error('libreoffice produced nothing');
  return out;
}

/**
 * @param {string} name 원래 파일 이름 (확장자만 씀)
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {Promise<{ok:boolean, pdf?:ArrayBuffer, via?:string, error?:string}>}
 */
async function convertToPdf(name, data) {
  const ext = (String(name).toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1];
  if (!ext) return { ok: false, error: 'no extension' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okssam-'));
  const input = path.join(dir, `문서.${ext}`);
  const output = path.join(dir, 'out.pdf');
  fs.writeFileSync(input, Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data));
  const tries = [];
  if (process.platform === 'darwin' && MAC_APP[ext]) tries.push(['apple', () => viaApple(MAC_APP[ext], input, output).then(() => output)]);
  if (process.platform === 'win32') tries.push(['office', () => viaOfficeWin(ext, input, output).then(() => output)]);
  tries.push(['libreoffice', () => viaLibreOffice(input, dir)]);
  const errors = [];
  try {
    for (const [via, fn] of tries) {
      try {
        const out = await fn();
        if (fs.existsSync(out) && fs.statSync(out).size > 0) {
          const buf = fs.readFileSync(out);
          return { ok: true, via, pdf: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
        }
      } catch (e) { errors.push(`${via}: ${e.message}`); }
    }
    return { ok: false, error: errors.join(' | ') || 'no converter' };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 무시 */ }
  }
}

module.exports = { convertToPdf };
