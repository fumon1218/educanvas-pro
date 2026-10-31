// 앱에 들어가는 오픈소스(운영용 의존성)의 라이선스 전문을 public/licenses.txt로 모은다.
// MIT·Apache 등은 "저작권 고지와 라이선스 전문을 함께 배포"하라고 하므로 앱 안에서 볼 수 있게 한다.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const out = [];
const seen = new Set();
const dirs = execSync('npm ls --omit=dev --all --parseable', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  .split('\n').map(s => s.trim()).filter(d => d && d !== root);
for (const dir of dirs.sort()) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { continue; }
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id) || pkg.private) continue;
  seen.add(id);
  const files = fs.readdirSync(dir).filter(f => /^(licen[cs]e|copying|notice)/i.test(f));
  const lic = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type || (pkg.licenses || []).map(l => l.type || l).join(' OR ') || '알 수 없음';
  let text = files.map(f => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch { return ''; } }).filter(Boolean).join('\n\n');
  if (!text) text = `License: ${lic}`;
  out.push(`================================================================\n${id}  (${lic})\n${pkg.homepage || (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url) || ''}\n----------------------------------------------------------------\n${text}\n`);
}
const head = `옥쌤보드 오픈소스 라이선스 전문 (${seen.size}개 패키지)\n자동 생성: ${new Date().toISOString().slice(0, 10)}\n\n`;
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'licenses.txt'), head + out.join('\n'));
console.log(`licenses.txt: ${seen.size}개 패키지`);
