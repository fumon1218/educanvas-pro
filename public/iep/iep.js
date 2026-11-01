/* 개별화교육계획 작성 도구 (curriculum/iep.html)
   - 서식: 특수교육법 제22조·시행규칙 제4조의 필수 내용(인적사항, 현재 학습수행수준, 교육목표, 교육내용, 교육방법, 평가계획,
     특수교육 관련서비스) + 학교 현장 서식(학기별 교과 교육계획 월별 표, 가·나·다·라 평가) + 개별화교육지원팀·행동지원·전환교육.
   - 성취기준: curriculum/standards.js (2022 개정 특수교육 기본 교육과정 [별책 3], 2026.1.21. 일부개정 포함)
   - 차시 연결: curriculum/lessons.js 의 std/stdEarly/stdLink, 기초층은 아래 BASIC_STD
   - 저장: 이 기기 localStorage 'oks_iep_v1'. 이름·생년월일·주소·연락처 등 인적사항은 '이 기기에 저장'을 켤 때만 저장합니다.
   - 성취기준·차시 연결과 자동 문장은 작성 보조용 제안이며 고시가 아닙니다. 최종 내용은 개별화교육지원팀이 정합니다. */
(function () {
  'use strict';
  /* 기본 교육과정(별책 3)과 공통 교육과정(초·중학교 교과) 성취기준. 코드 약어가 서로 달라 한 사전에 함께 둡니다(국어 vs 국, 바생 vs 바). */
  var STD_B = window.OKS_STD_TEXT || {}, STD_C = window.OKS_STD_COMMON || {};
  var STD = Object.assign({}, STD_B, STD_C), AREA = Object.assign({}, window.OKS_STD_AREA || {}, window.OKS_STD_COMMON_AREA || {});
  var COURSE_B = '기본 교육과정', COURSE_C = '공통 교육과정', COURSES = [COURSE_B, COURSE_C];
  var LES = ((window.OKS_LESSONS || {}).lessons) || [];
  var KEY = 'oks_iep_v1', PROF_KEY = 'oks_profiles_v1', LOG_KEY = 'oks_learning_log_v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function uid() { return 'i' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function toast(t) { var e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { e.classList.remove('on'); }, 2200); }

  /* ---------- 교육과정 메타 ---------- */
  var SUBJ = { '국어': '국어', '수학': '수학', '사회': '사회', '과학': '과학', '진로': '진로와 직업', '체육': '체육', '음악': '음악', '미술': '미술',
    '생영': '생활영어', '정통': '정보통신활용', '보건': '보건', '실과': '실과', '바생': '바른 생활', '슬생': '슬기로운 생활', '건생': '건강한 생활', '즐생': '즐거운 생활' };
  var SUBJ_C = { '국': '국어', '수': '수학', '사': '사회', '사(일사)': '사회', '사(지리)': '사회', '역': '역사', '도': '도덕', '과': '과학', '실': '실과', '기가': '기술·가정', '정': '정보',
    '체': '체육', '음': '음악', '미': '미술', '영': '영어', '바': '바른 생활', '슬': '슬기로운 생활', '즐': '즐거운 생활', '건': '건강한 생활' };
  var SUBJ_ORDER_BY = {};
  SUBJ_ORDER_BY[COURSE_B] = ['국어', '수학', '사회', '과학', '진로와 직업', '체육', '음악', '미술', '바른 생활', '슬기로운 생활', '건강한 생활', '즐거운 생활', '실과', '생활영어', '정보통신활용', '보건'];
  SUBJ_ORDER_BY[COURSE_C] = ['국어', '수학', '사회', '도덕', '과학', '실과', '체육', '음악', '미술', '영어', '바른 생활', '슬기로운 생활', '건강한 생활', '즐거운 생활', '역사', '기술·가정', '정보'];
  var BAND = { '2': '초1~2', '4': '초3~4', '6': '초5~6', '9': '중1~3', '09': '중1~3', '12': '고1~3' };
  var BAND_ORDER = ['초1~2', '초3~4', '초5~6', '중1~3', '고1~3'];
  /* 생활지원 영역: 총론의 일상생활 활동 영역 + 행동지원(나이스 생활지원 영역 기준) — 성취기준 없이 학교·교사가 목표를 정함 */
  var LIFE = ['의사소통', '자립생활', '신체활동', '여가활동', '생활적응', '행동지원', '진로·직업(전환)'];
  function meta(code) {
    var m = /^(\d+)(.+?)(\d{2})-(\d{2})$/.exec(code); if (!m) return null;
    var course = STD_C[code] ? COURSE_C : COURSE_B, subj = (course === COURSE_C ? SUBJ_C : SUBJ)[m[2]];
    if (!subj) return null;
    return { course: course, band: BAND[m[1]], subj: subj, area: AREA[m[1] + m[2] + m[3]] || '', areaKey: m[1] + m[2] + m[3] };
  }
  var ALL = Object.keys(STD).map(function (c) { var m = meta(c); return m && { code: c, text: STD[c], course: m.course, band: m.band, subj: m.subj, area: m.area, areaKey: m.areaKey }; }).filter(Boolean);
  function courseLabel(c) { return c === COURSE_C ? '2022 개정 공통 교육과정(초·중학교 교과)' : '2022 개정 특수교육 기본 교육과정'; }

  /* 기초층 차시(한글·시계·영어 기초)는 엑셀 밖 JSON이라 여기서 연결합니다(worksheet/clock.js 의 배움 근거와 같음) */
  var BASIC_STD = {
    '02-00-01-01': ['6수학03-03'], '02-00-01-02': ['6수학03-03'], '02-00-01-03': ['6수학03-03'], '02-00-01-04': ['9수학03-03'],
    '02-00-01-05': ['9수학03-03'], '02-00-02-02': ['9수학03-03', '6수학03-04'], '02-00-02-03': ['6수학03-04'],
    '02-00-03-01': ['6수학03-03', '6수학03-04'], '02-00-03-02': ['6수학03-04'], '02-00-03-03': ['9수학03-03']
  };
  function basicStd(l) {
    if (BASIC_STD[l.id]) return BASIC_STD[l.id];
    if (l.subject === 'korean' && l.school === 'basic') return /낱말/.test(l.topic) ? ['6국어03-02', '4국어03-02'] : ['6국어03-01'];
    if (l.subject === 'english' && l.school === 'basic') {
      var t = l.topic + ' ' + l.goal;
      if (/대문자|소문자/.test(t) && /쓰/.test(t)) return ['09생영03-02'];
      if (/쓰/.test(t)) return ['09생영03-03'];
      if (/대.?소문자|짝/.test(t)) return ['09생영02-02'];
      if (/알파벳/.test(t)) return ['09생영01-02'];
      if (/문장|말하/.test(t)) return ['09생영01-05'];
      if (/읽/.test(t)) return ['09생영02-03'];
      return ['09생영01-04'];
    }
    return [];
  }
  /* 공통 교육과정 연결: 초등 영어 6차시(기본 교육과정 초등에는 영어가 없음) */
  var COMMON_STD = {
    '05-01-01-01': ['4영02-01', '4영01-05'], '05-01-01-02': ['4영01-05', '4영01-01'], '05-01-02-01': ['4영01-05'],
    '05-01-02-02': ['4영01-05', '4영02-06'], '05-01-03-01': ['4영02-05'], '05-01-03-02': ['4영01-04']
  };
  LES.forEach(function (l) { l._std = [].concat(l.std || [], l.stdEarly || [], l.stdLink || [], basicStd(l), COMMON_STD[l.id] || []); });
  function lessonsFor(code) { return LES.filter(function (l) { return l._std.indexOf(code) >= 0; }); }
  function lessonById(id) { return LES.filter(function (l) { return l.id === id; })[0]; }
  function lessonLabel(l) { return l.subjectName + ' ' + l.schoolName + ' ' + l.no + ' ' + l.topic; }

  /* ---------- 문장 다듬기: 성취기준·준거 → '~할 수 있다' 목표, '~할 수 있는가?' 준거 ---------- */
  var JONG = function (ch) { var c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? c % 28 : -1; };
  function setJong(ch, j) { var c = ch.charCodeAt(0) - 0xAC00; return String.fromCharCode(0xAC00 + c - (c % 28) + j); }
  function toGoal(s) {
    s = String(s || '').trim().replace(/\s+/g, ' ').replace(/\.$/, '');
    if (!s) return '';
    if (/수 있다$/.test(s)) return s + '.';
    if (/한다$|하다$/.test(s)) return s.replace(/한다$|하다$/, '할 수 있다.');   /* 원문 '인식하다.'(6실04-06) 같은 표기도 처리 */
    var m = /(\S*?)는다$/.exec(s);
    if (m && m[1]) {
      var st = m[1], last = st.slice(-1), head = s.replace(/는다$/, '');
      var IRR = { '갖': '가질', '듣': '들을', '짓': '지을', '걷': '걸을' };   /* 불규칙: 갖는다→가질, 듣는다→들을, 짝짓는다→짝지을 */
      if (IRR[last]) return head.slice(0, -1) + IRR[last] + ' 수 있다.';
      return head + (JONG(last) > 0 ? '을' : '를') + ' 수 있다.';
    }
    m = /(.)다$/.exec(s);
    if (m && JONG(m[1]) === 4) return s.slice(0, -2) + setJong(m[1], 8) + ' 수 있다.';
    if (/이다$|있다$|없다$/.test(s)) return s + '.';
    return s + '.';
  }
  /* 성취기준 → 교육내용(활동) 초안: '~한다/~할 수 있다'를 '~하기'로 바꾸고, '~하고/~하며'에서 단계로 나눔 */
  var L_STEM = ['만들', '알', '놀', '살', '열', '걸', '팔', '밀', '끌', '돌', '불', '빌', '얼', '울', '털'];   /* ㄹ 받침 동사: 만든다→만들기 (간다→가기, 준다→주기는 제외) */
  function nomEnd(s) {
    s = String(s || '').trim().replace(/\.$/, '');
    var m;
    if ((m = /(\S*)을 수 있다$/.exec(s))) return s.replace(/을 수 있다$/, '기');
    if ((m = /(.) 수 있다$/.exec(s)) && JONG(m[1]) === 8) { var b0 = setJong(m[1], 0); return s.replace(/. 수 있다$/, (L_STEM.indexOf(head2(s, m[1])) >= 0 ? m[1] : b0) + '기'); }
    if (/한다$|하다$/.test(s)) return s.replace(/한다$|하다$/, '하기');
    if (/는다$/.test(s)) return s.replace(/는다$/, '기');
    if ((m = /(.)다$/.exec(s)) && JONG(m[1]) === 4) { var withL = setJong(m[1], 8), noJ = setJong(m[1], 0); return s.slice(0, -2) + (L_STEM.indexOf(head2(s.slice(0, -2) + withL + '다', withL)) >= 0 ? withL : noJ) + '기'; }
    return s;
  }
  function head2(s, last) { var w = s.replace(/ 수 있다$|다$/, '').split(/\s+/).pop() || ''; w = w.slice(0, w.lastIndexOf(last) + 1); return w.length > 2 ? w.slice(-2) : w; }
  function stepsFrom(text) {
    var t = String(text || '').trim().replace(/\.$/, '');
    var parts = t.split(/(?<=하고|하여) /), out = [];   /* '~하며'는 '파악하며 듣고'처럼 동시 동작이 많아 나누지 않음 */
    parts.forEach(function (x, k) {
      x = x.trim(); if (!x) return;
      x = k < parts.length - 1 ? x.replace(/(하고|하여)$/, '하기') : nomEnd(x);
      if (out.length && x.replace(/\s/g, '').length < 9) out[out.length - 1] = out[out.length - 1].replace(/하기$/, '하고 ') + x; else out.push(x);
    });
    return out;
  }
  function contentFor(code) {
    var lines = stepsFrom(STD[code]).map(function (x) { return '- ' + x; });
    ((window.OKS_STD_ACT || {})[code] || []).slice(0, 2).forEach(function (a) { lines.push('- 탐구 활동: ' + a); });
    lines.push('- 생활 속 장면에서 적용해 보기');
    return lines.join('\n');
  }
  function toQuestion(goal) { return String(goal || '').replace(/수 있다\.?$/, '수 있는가?').replace(/\.$/, '?'); }

  /* ---------- 학생·계획 저장 ---------- */
  function profiles() { var d = jget(PROF_KEY, null); return d && Array.isArray(d.list) ? d.list : []; }
  function addProfile(label) {
    var d = jget(PROF_KEY, null); if (!d || !Array.isArray(d.list)) d = { active: '', list: [] };
    var id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
    d.list.push({ id: id, label: label }); jset(PROF_KEY, d); return id;
  }
  var store = jget(KEY, { plans: [] }); if (!Array.isArray(store.plans)) store.plans = [];
  var PERSONAL = ['name', 'birth', 'guardian', 'address', 'phone', 'welfare'];
  var memPersonal = {};   /* 저장하지 않는 인적사항(이 탭이 열려 있는 동안만) */
  var cur = null, curProfile = jget('oks_iep_last', {}).profile || '';
  function persist() {
    var copy = JSON.parse(JSON.stringify(store));
    copy.plans.forEach(function (p) { if (!p.keepPersonal) PERSONAL.forEach(function (k) { if (p.info) p.info[k] = ''; }); });
    if (!jset(KEY, copy)) toast('저장 공간이 부족해요. 백업 파일로 저장해 주세요.');
    jset('oks_iep_last', { profile: curProfile, plan: cur && cur.id });
  }
  var saveT; function save() { clearTimeout(saveT); saveT = setTimeout(persist, 400); }
  function restorePersonal(p) { var m = memPersonal[p.id]; if (m) PERSONAL.forEach(function (k) { if (!p.info[k] && m[k]) p.info[k] = m[k]; }); }

  function termMonths(term) { return term === '2' ? ['8~9월', '10월', '11월', '12월', '1~2월'] : ['3월', '4월', '5월', '6월', '7월']; }
  function newPlan(profileId) {
    var now = new Date(), y = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear(), term = (now.getMonth() >= 7 || now.getMonth() < 1) ? '2' : '1';
    return {
      id: uid(), profile: profileId, created: now.toISOString(), year: String(y), term: term, type: '교과 및 생활지원 중심',
      start: term === '1' ? y + '-03-02' : y + '-08-17', keepPersonal: false, course: COURSE_B,
      info: { school: '', gradeClass: '', name: '', specialTeacher: '', generalTeacher: '', birth: '', placement: '특수학급', disability: '', welfare: '', guardian: '', address: '', selectDate: '', phone: '' },
      team: [['개별화교육지원팀장(교감)', ''], ['보호자', ''], ['특수교육교원', ''], ['일반교육교원(통합학급 담임)', ''], ['진로·직업교육 담당교원', ''], ['특수교육 관련서비스 담당 인력', '']].map(function (r) { return { role: r[0], name: r[1] }; }),
      meetings: [{ date: '', topic: '1차: 현재 수준·요구 공유, 계획 유형과 우선 영역 결정' }, { date: '', topic: '2차: 계획 확정·관련서비스 협의' }],
      services: ['상담지원', '가족지원', '치료지원', '보조인력지원', '보조공학기기지원', '학습보조기기지원', '통학지원', '정보접근지원', '방과후학교 지원'].map(function (k) { return { kind: k, org: '', content: '', note: '' }; }),
      tests: [{ tool: '', date: '', result: '' }],
      present: '', strengths: '', parentNeeds: '', studentNeeds: '', etc: '',
      behavior: { on: false, target: '', func: '', prevent: '', replace: '', respond: '', crisis: '' },
      transition: { on: false, hope: '', goal: '', now: '', link: '', support: '' },
      subjects: [],
      scale: { a: 70, b: 40 },
      evalTotal: '', evalNote: ''
    };
  }
  /* 한 교과 안에서 기본·공통 교육과정과 여러 학년군을 함께 고름(예: 국어 = 기본 초5~6 + 공통 초3~4) */
  function newSubject(name, courses, bands) {
    var life = LIFE.indexOf(name) >= 0;
    return { id: uid(), name: name, courses: life ? [] : courses, bands: life ? [] : bands, life: life, present: '', longGoals: '', stds: [], rows: [], eval: '', open: true };
  }
  function coursesOf(s) { if (s.life) return []; return s.courses && s.courses.length ? s.courses : (s.courses ? [] : [s.course || COURSE_B]); }   /* 예전 계획(course 하나)도 읽음 */
  function bandsOf(s) { return s.bands ? s.bands : (s.band ? [s.band] : []); }
  function availCourses(name) { return COURSES.filter(function (c) { return ALL.some(function (x) { return x.course === c && x.subj === name; }); }); }
  function availBands(name, courses) { return BAND_ORDER.filter(function (b) { return ALL.some(function (x) { return courses.indexOf(x.course) >= 0 && x.subj === name && x.band === b; }); }); }
  function shortC(c) { return c === COURSE_C ? '공통' : '기본'; }
  function planCourses(p) { return p.course === COURSE_C ? [COURSE_C] : p.course === COURSE_B || !p.course ? [COURSE_B] : [COURSE_B, COURSE_C]; }
  function subjSummary(s) {
    if (s.life) return '';
    var g = {};   /* 고른 성취기준이 있으면 그 교육과정·학년군으로, 없으면 고른 범위로 */
    if (s.stds.length) s.stds.forEach(function (c) { var m = meta(c); if (m) { (g[m.course] = g[m.course] || []); if (g[m.course].indexOf(m.band) < 0) g[m.course].push(m.band); } });
    else coursesOf(s).forEach(function (c) { g[c] = bandsOf(s).filter(function (b) { return availBands(s.name, [c]).indexOf(b) >= 0; }); });
    return COURSES.filter(function (c) { return g[c]; }).map(function (c) { return shortC(c) + (g[c].length ? ' ' + BAND_ORDER.filter(function (b) { return g[c].indexOf(b) >= 0; }).join('·') : ''); }).join(' + ');
  }
  function newRow(month) { return { month: month || '', unit: '', goal: '', cond: '', measure: '', period: '', content: '', method: '직접교수, 모델링, 최소촉진', crit: '', result: '', memo: '', std: [], lessons: [], checks: [] }; }

  /* ---------- ① 측정 가능한 목표: 조건 + 행동 + 기준 + 기간 (미국 IEP '측정 가능한 목표' 방식) ---------- */
  var COND_OPTS = ['그림 단서가 주어지면', '시범을 본 후', '교사의 언어 촉진이 있으면', '시각 일과표를 보고', '2개 보기 중에서', '3개 보기 중에서', 'AAC(그림 카드)를 사용하여', '또래와 함께', '실제 생활 장면에서', '촉진 없이 스스로'];
  var MEAS_OPTS = ['5회 중 4회', '5회 중 3회', '10회 중 8회', '80% 이상', '70% 이상', '10문항 중 8문항', '3회 연속', '독립 수행'];
  var PER_OPTS = ['2주 연속', '3회기 연속', '한 달 동안', '학기 말까지', '2학기 동안'];
  function measTail(r) { return [r.measure, r.period].map(function (x) { return oneLine(x); }).filter(Boolean).join(', '); }
  function goalCore(r) { var core = cleanGoal(r.goal); if (!core) return ''; var c = oneLine(r.cond); return (c && core.indexOf(c) !== 0 ? c + ' ' : '') + core; }
  function goalFull(r) { var g = goalCore(r); if (!g) return oneLine(r.goal); var t = measTail(r); return g + '.' + (t ? ' (' + t + ')' : ''); }
  function critFull(r) { var c = oneLine(r.crit), t = measTail(r); return c + (t && c.indexOf(t) < 0 ? ' (' + t + ')' : ''); }
  function targetPct(r) {
    var m = String(r.measure || ''), x;
    if ((x = /(\d+)\s*(?:회|문항|번|개|번 중)\s*중\s*(\d+)/.exec(m))) return Math.min(100, Math.round(+x[2] / +x[1] * 100));
    if ((x = /(\d+)\s*%/.exec(m))) return +x[1];
    if (/독립|스스로/.test(m)) return 100;
    return (cur && cur.scale && +cur.scale.a) || 70;
  }

  /* ---------- ② 진전도 점검: 교사 점검 + 앱 기록(날짜별 독립 수행 비율) ---------- */
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function rowPoints(r) {
    var pts = (r.checks || []).map(function (c) { return { date: c.date, pct: +c.pct, src: 't', note: c.note || '' }; });
    if (r.lessons && r.lessons.length && cur) {
      var by = {}; logsFor(cur, r.lessons).forEach(function (x) { var d = String(x.at).slice(0, 10); (by[d] = by[d] || []).push(x); });
      Object.keys(by).forEach(function (d) { var a = by[d]; pts.push({ date: d, pct: Math.round(a.filter(function (x) { return INDEP[x.independence]; }).length / a.length * 100), src: 'a', note: '앱 ' + a.length + '회' }); });
    }
    return pts.filter(function (q) { return q.date && !isNaN(q.pct); }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  function recentRate(pts) { if (!pts.length) return null; var l = pts.slice(-3); return Math.round(l.reduce(function (t, q) { return t + q.pct; }, 0) / l.length); }
  function rowStatus(r) {
    var pts = rowPoints(r), t = targetPct(r), rr = recentRate(pts);
    if (rr == null) return { txt: '기록 없음', cls: 'none', rate: null, target: t, n: 0 };
    var st = rr >= t ? ['목표 도달', 'ok'] : (pts.length >= 2 && pts[pts.length - 1].pct > pts[0].pct ? ['진전 중', 'up'] : ['지원 점검', 'warn']);
    return { txt: st[0], cls: st[1], rate: rr, target: t, n: pts.length };
  }
  function spark(r, w, h) {
    var pts = rowPoints(r), t = targetPct(r); w = w || 150; h = h || 42;
    if (!pts.length) return '<span class="spark-none">기록 없음</span>';
    var n = pts.length, X = function (i) { return n === 1 ? w / 2 : 6 + i * (w - 12) / (n - 1); }, Y = function (v) { return h - 5 - v / 100 * (h - 10); };
    var g = '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="최근 ' + recentRate(pts) + '%, 목표 ' + t + '%">';
    g += '<line x1="0" x2="' + w + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="#c07a2c" stroke-dasharray="4 3" stroke-width="1.2"/>';
    if (n > 1) g += '<polyline fill="none" stroke="#2b6f9a" stroke-width="1.8" points="' + pts.map(function (q, i) { return X(i).toFixed(1) + ',' + Y(q.pct).toFixed(1); }).join(' ') + '"/>';
    g += pts.map(function (q, i) { return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(q.pct).toFixed(1) + '" r="3.2" fill="' + (q.src === 't' ? '#2b6f9a' : '#fff') + '" stroke="#2b6f9a" stroke-width="1.5"><title>' + esc(q.date + ' · ' + q.pct + '%' + (q.note ? ' · ' + q.note : '')) + '</title></circle>'; }).join('');
    return g + '</svg>';
  }

  /* ---------- ③ 지원·조정: 편의지원·평가 조정·교육과정 조정 수준·통합학급 참여 ---------- */
  var SUP = [
    ['present', '제시 방법', ['확대 자료', '읽어 주기(음성)', '그림·상징 단서', '쉬운 글', '과제 단계 나누기', '시각적 일과표', '실물·구체물']],
    ['respond', '반응 방법', ['AAC·그림 카드', '말로 답하기', '고르기(선택형)', '가리키기', '스위치', '대필·받아쓰기', '보조공학기기']],
    ['time', '시간·과제 양', ['시간 연장', '휴식 제공', '과제 양 줄이기', '짧게 나눠 하기', '미리 알려 주기(예고)']],
    ['env', '환경·인력', ['자리 배치', '소음·자극 줄이기', '보조인력 지원', '또래 도우미', '감각 조절 공간']],
    ['evaladj', '평가 조정', ['평가 시간 연장', '문항 읽어 주기', '별도 공간', '답 표기 방법 조정', '관찰·포트폴리오로 대체', '문항 수·수준 조정']]
  ];
  var ADJ_LEVELS = ['', '같은 성취기준·같은 방법', '편의지원(방법만 조정)', '내용 수정(성취기준 수준 조정)', '대체(다른 교육과정·생활 기능으로)'];
  function supOf(s) { if (!s.sup) s.sup = { present: [], respond: [], time: [], env: [], evaladj: [], level: '', inclHours: '', inclNote: '', note: '' }; return s.sup; }
  function supCount(s) { var u = s.sup; if (!u) return 0; return SUP.reduce(function (t, c) { return t + (u[c[0]] || []).length; }, 0) + (u.level ? 1 : 0) + (u.inclHours || u.inclNote ? 1 : 0) + (u.note ? 1 : 0); }
  function supHtml(s, si) {
    var u = supOf(s), n = supCount(s), b = 'subjects.' + si + '.sup.';
    var h = '<details class="supbox"' + (n ? ' open' : '') + '><summary>🧩 지원·조정 <small>편의지원 · 평가 조정 · 통합학급 참여</small> <span class="opt-tag' + (n ? ' on">' + n + '개 기록' : '">비어 있음') + '</span></summary><div class="supbody">';
    h += '<div class="grid">' + fld('교육과정 조정 수준', b + 'level', u.level, { sel: ADJ_LEVELS }) + fld('통합학급 참여(주당 시간)', b + 'inclHours', u.inclHours, { ph: '예: 주 12시간' }) + fld('통합학급 참여 형태', b + 'inclNote', u.inclNote, { ph: '예: 음악·체육은 통합학급, 국어·수학은 특수학급' }) + '</div>';
    SUP.forEach(function (c) {
      h += '<div class="suprow"><b>' + c[1] + '</b><div class="chips">' + c[2].map(function (v) { return '<label class="chk"><input type="checkbox" data-sup="' + c[0] + '" data-val="' + esc(v) + '" data-si="' + si + '"' + ((u[c[0]] || []).indexOf(v) >= 0 ? ' checked' : '') + '> ' + esc(v) + '</label>'; }).join('') + '</div></div>';
    });
    h += '<div class="grid">' + fld('그 밖의 지원(직접 쓰기)', b + 'note', u.note, { wide: 1, ph: '예: 활동 전 손 씻기 순서표 제시' }) + '</div></div></details>';
    return h;
  }
  function supLines(s) {
    var u = s.sup; if (!u) return [];
    var out = [];
    if (u.level) out.push(['교육과정 조정', u.level]);
    SUP.forEach(function (c) { if ((u[c[0]] || []).length) out.push([c[1], u[c[0]].join(', ')]); });
    if (u.note) out.push(['그 밖의 지원', u.note]);
    if (u.inclHours || u.inclNote) out.push(['통합학급 참여', [u.inclHours, u.inclNote].filter(Boolean).join(' · ')]);
    return out;
  }

  /* ---------- 기록 → 평가 ---------- */
  function logsFor(p, lessonIds) {
    var from = p.start ? new Date(p.start) : null, to = from ? new Date(from.getTime() + 200 * 864e5) : null;
    return jget(LOG_KEY, []).filter(function (r) {
      if ((r.profile || '') !== (p.profile || '')) return false;
      if (lessonIds.indexOf(r.lesson) < 0) return false;
      if (from) { var t = new Date(r.at); if (t < from || t > to) return false; }
      return true;
    });
  }
  var INDEP = { '독립': 1, '언어힌트': 1 };
  function summarize(rs) {
    if (!rs.length) return null;
    var n = rs.length, ind = rs.filter(function (r) { return INDEP[r.independence]; }).length;
    var lv = Math.max.apply(null, rs.map(function (r) { return r.level || 0; }));
    var recent = rs.slice(-3).map(function (r) { return r.independence || '-'; });
    var tr = rs.filter(function (r) { return r.transfer && r.transfer !== '미관찰'; }).map(function (r) { return r.transfer; });
    return { n: n, rate: Math.round(ind / n * 100), maxLevel: lv, recent: recent, transfer: tr };
  }
  /* 앱 기록은 '끝까지 해낸' 판만 남으므로 자동 제안은 가·나·다까지. '라'(수행하지 못함)는 교사가 판단해 고릅니다. */
  function gradeOf(rate, sc) { if (rate == null) return ''; if (rate >= sc.a) return '가'; if (rate >= sc.b) return '나'; return '다'; }
  var GRADE_TEXT = { '가': '대체로 스스로 수행함', '나': '부분적인 도움을 필요로 함', '다': '전반적인 도움을 필요로 함', '라': '과제 수행을 하지 못함' };

  /* ---------- 화면 ---------- */
  function fld(label, path, val, opt) {
    opt = opt || {};
    var id = 'f_' + path.replace(/\W/g, '_');
    var input = opt.area ? '<textarea id="' + id + '" data-p="' + path + '" placeholder="' + esc(opt.ph || '') + '">' + esc(val) + '</textarea>'
      : opt.sel ? '<select id="' + id + '" data-p="' + path + '">' + opt.sel.map(function (o) { return '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>'
      : '<input id="' + id + '" data-p="' + path + '" type="' + (opt.type || 'text') + '" value="' + esc(val) + '" placeholder="' + esc(opt.ph || '') + '">';
    return '<div class="' + (opt.wide ? 'wide' : '') + '"><label for="' + id + '">' + esc(label) + '</label>' + input + '</div>';
  }
  function getP(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj); }
  function setP(obj, path, v) { var ks = path.split('.'), o = obj; for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
  function addDays(d, n) { if (!d) return ''; var t = new Date(d); if (isNaN(t)) return ''; t.setDate(t.getDate() + n); return t.getFullYear() + '. ' + (t.getMonth() + 1) + '. ' + t.getDate() + '.'; }

  function render() {
    var app = $('#app');
    if (!cur) {
      app.innerHTML = '<section class="card"><h2>개별화교육계획을 시작해요</h2><p class="hint">위에서 학생을 고르고 <b>＋ 새 계획</b>을 누르세요. 학생은 배움 지도와 같은 익명 프로필(별명·번호)을 씁니다. 실제 이름은 계획서의 인적사항 칸에만 적고, 기본값으로는 이 기기에 저장하지 않습니다.</p></section>';
      return;
    }
    var p = cur, i = p.info, h = '';
    /* 1 기본 정보 */
    h += '<section class="card" id="s-basic"><h2>기본 정보</h2><p class="hint">특수교육법 시행규칙 제4조: 개별화교육지원팀은 학기 시작일부터 2주 이내 구성, 계획은 매 학기 시작일부터 30일 이내 작성(지역 지침 확인).</p>';
    h += '<div class="grid">' + fld('학년도', 'year', p.year) + fld('학기', 'term', p.term, { sel: ['1', '2'] }) + fld('학기 시작일(배치일)', 'start', p.start, { type: 'date' }) +
      fld('계획 유형', 'type', p.type, { sel: ['교과 중심', '생활지원 중심', '교과 및 생활지원 중심'] }) +
      fld('적용 교육과정', 'course', p.course || COURSE_B, { sel: [COURSE_B, COURSE_C, '기본·공통 교육과정 병행'] }) + '</div>' +
      '<div style="margin-top:10px"><label>학생 학년군 <small>(여러 개 고를 수 있어요 · 새로 추가하는 교과의 기본값)</small></label><div class="chips">' +
      BAND_ORDER.map(function (b) { return '<label class="chk"><input type="checkbox" data-pband="' + b + '"' + ((p.bands || []).indexOf(b) >= 0 ? ' checked' : '') + '> ' + b + '</label>'; }).join('') + '</div></div>';
    h += '<p class="dates">팀 구성 기한 <b>' + (addDays(p.start, 14) || '-') + '</b> · 계획 결재 기한 <b>' + (addDays(p.start, 30) || '-') + '</b> · 학기 말 평가 결과 보호자 안내</p>';
    h += '</section><section class="card" id="s-info"><h2>학교·학생 인적사항</h2><p class="hint">출력물 첫 장의 학교·학생 정보예요. 비워 두면 출력에서도 빠집니다.</p>';
    h += '<div class="grid">' + fld('학교명', 'info.school', i.school) + fld('학년 반', 'info.gradeClass', i.gradeClass, { ph: '예: 5학년 2반' }) + fld('이름', 'info.name', i.name) +
      fld('특수학급(특수교육) 담임', 'info.specialTeacher', i.specialTeacher) + fld('통합학급 담임', 'info.generalTeacher', i.generalTeacher) + '</div>';
    h += '<h3 style="font-size:15px;margin:14px 0 6px">학생·가족 정보</h3><div class="grid">' + fld('생년월일', 'info.birth', i.birth, { type: 'date' }) +
      fld('배치형태', 'info.placement', i.placement, { sel: ['특수학급', '일반학급(전일제 통합)', '특수학교', '순회교육', '병원학교·원격수업'] }) +
      fld('장애유형', 'info.disability', i.disability, { ph: '선정 시 장애 영역' }) + fld('복지카드', 'info.welfare', i.welfare, { ph: '유/무' }) +
      fld('보호자', 'info.guardian', i.guardian) + fld('전화번호', 'info.phone', i.phone) + fld('주소', 'info.address', i.address, { wide: true }) +
      fld('특수교육대상자 선정·배치일', 'info.selectDate', i.selectDate, { type: 'date' }) + '</div>';
    h += '<label style="display:flex;gap:8px;align-items:center;margin-top:10px;color:var(--ink)"><input type="checkbox" id="keepP" style="width:auto"' + (p.keepPersonal ? ' checked' : '') + '> 이름·생년월일·보호자·주소·전화·복지카드를 이 기기에 저장</label>';
    h += '<p class="note">꺼 두면 이 칸들은 지금 열린 화면에서만 쓰이고 저장되지 않습니다(출력·한글 파일에는 들어감). 공용 기기에서는 끈 채로 쓰세요. 개별화교육계획은 학교 규정에 따라 원본을 보관합니다.</p></section>';

    /* 2 팀·관련서비스 */
    h += '<section class="card" id="s-team"><h2>2. 개별화교육지원팀·특수교육 관련서비스</h2><p class="hint">팀: 보호자, 특수교육교원, 일반교육교원, 진로·직업교육 담당교원, 관련서비스 담당 인력 등(시행규칙 제4조). 관련서비스는 실제로 필요한 것만 남기세요.</p>';
    h += '<div class="scroll"><table class="edit"><thead><tr><th style="width:42%">역할</th><th>이름</th><th style="width:44px"></th></tr></thead><tbody>' +
      p.team.map(function (t, k) { return '<tr><td><input data-p="team.' + k + '.role" value="' + esc(t.role) + '"></td><td><input data-p="team.' + k + '.name" value="' + esc(t.name) + '"></td><td><button class="ghost del" data-del="team.' + k + '" aria-label="삭제">✕</button></td></tr>'; }).join('') +
      '</tbody></table></div><div class="actions"><button data-add="team">＋ 팀원</button></div>';
    h += '<div class="scroll"><table class="edit"><thead><tr><th style="width:140px">협의회 일자</th><th>협의 내용</th><th style="width:44px"></th></tr></thead><tbody>' +
      p.meetings.map(function (t, k) { return '<tr><td><input type="date" data-p="meetings.' + k + '.date" value="' + esc(t.date) + '"></td><td><input data-p="meetings.' + k + '.topic" value="' + esc(t.topic) + '"></td><td><button class="ghost del" data-del="meetings.' + k + '" aria-label="삭제">✕</button></td></tr>'; }).join('') +
      '</tbody></table></div><div class="actions"><button data-add="meetings">＋ 협의회</button></div>';
    h += '<div class="scroll"><table class="edit"><thead><tr><th style="width:150px">제공 서비스</th><th>지원기관명</th><th>교육(지원) 내용</th><th>비고</th><th style="width:44px"></th></tr></thead><tbody>' +
      p.services.map(function (s, k) { return '<tr><td><input data-p="services.' + k + '.kind" value="' + esc(s.kind) + '"></td><td><input data-p="services.' + k + '.org" value="' + esc(s.org) + '"></td><td><input data-p="services.' + k + '.content" value="' + esc(s.content) + '"></td><td><input data-p="services.' + k + '.note" value="' + esc(s.note) + '"></td><td><button class="ghost del" data-del="services.' + k + '" aria-label="삭제">✕</button></td></tr>'; }).join('') +
      '</tbody></table></div><div class="actions"><button data-add="services">＋ 서비스</button></div></section>';

    /* 3 진단·현재 수준 */
    h += '<section class="card" id="s-diag"><h2>3. 진단·평가 결과와 현재 수행 수준</h2>';
    h += '<div class="scroll"><table class="edit"><thead><tr><th>검사도구</th><th style="width:150px">검사일자</th><th>검사결과</th><th style="width:44px"></th></tr></thead><tbody>' +
      p.tests.map(function (t, k) { return '<tr><td><input data-p="tests.' + k + '.tool" value="' + esc(t.tool) + '" placeholder="예: K-WISC-V, 기초학력검사"></td><td><input type="date" data-p="tests.' + k + '.date" value="' + esc(t.date) + '"></td><td><input data-p="tests.' + k + '.result" value="' + esc(t.result) + '"></td><td><button class="ghost del" data-del="tests.' + k + '" aria-label="삭제">✕</button></td></tr>'; }).join('') +
      '</tbody></table></div><div class="actions"><button data-add="tests">＋ 검사</button><button data-act="recSummary">📋 앱 기록 요약 넣기</button></div>';
    h += '<div class="grid">' + fld('현재 수행 수준 및 행동특성', 'present', p.present, { area: 1, wide: 1, ph: '영역별로 할 수 있는 것과 지원이 필요한 것을 관찰한 행동으로 적어요.' }) +
      fld('강점·흥미(동기 부여 요소)', 'strengths', p.strengths, { area: 1 }) + fld('학생의 요구·선호', 'studentNeeds', p.studentNeeds, { area: 1 }) +
      fld('학부모 요구사항', 'parentNeeds', p.parentNeeds, { area: 1, wide: 1 }) + fld('기타(건강·투약·의사소통 수단 등)', 'etc', p.etc, { area: 1, wide: 1 }) + '</div></section>';

    /* 4 교과·영역별 계획 */
    h += '<section class="card" id="s-subj"><h2>4. 교과·영역별 교육계획</h2><p class="hint">교과를 추가한 뒤 그 안에서 교육과정과 학년군을 고르면 성취기준에서 목표를 고를 수 있습니다. 한 교과에 기본·공통 교육과정, 여러 학년군을 함께 담을 수 있어요. <b>기본 교육과정</b>은 특수학교 기본 교육과정(별책 3, 초1~고3), <b>공통 교육과정</b>은 일반 초·중학교 교과 교육과정(초1~중3)입니다. 앱 차시가 연결된 성취기준은 단원·차시·평가 준거까지 월별 표에 채워집니다. 생활지원 영역은 성취기준 없이 학교가 정한 목표로 씁니다.</p>';
    var allSubj = SUBJ_ORDER_BY[COURSE_B].concat(SUBJ_ORDER_BY[COURSE_C].filter(function (x) { return SUBJ_ORDER_BY[COURSE_B].indexOf(x) < 0; }));
    h += '<div class="actions"><select id="addSubjName" style="width:auto" aria-label="교과"><optgroup label="교과">' + allSubj.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</optgroup><optgroup label="생활지원 영역">' + LIFE.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</optgroup></select>' +
      '<button class="pri" data-act="addSubj">＋ 교과·영역 추가</button><span class="hint" style="margin:0;align-self:center">교육과정(기본·공통)과 학년군은 교과 안에서 여러 개 고를 수 있어요</span></div>';
    h += p.subjects.map(subjectHtml).join('') || '<p class="hint">아직 추가한 교과·영역이 없어요.</p>';
    h += '<datalist id="dl-cond">' + COND_OPTS.map(function (x) { return '<option value="' + x + '">'; }).join('') + '</datalist><datalist id="dl-meas">' + MEAS_OPTS.map(function (x) { return '<option value="' + x + '">'; }).join('') + '</datalist><datalist id="dl-per">' + PER_OPTS.map(function (x) { return '<option value="' + x + '">'; }).join('') + '</datalist>';
    h += '</section>';

    /* 5 행동지원·전환 */
    var b = p.behavior, t = p.transition;
    h += '<section class="card" id="s-beh"><h2>5. 도전행동 지원·전환교육</h2>';
    h += '<label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" data-chk="behavior.on" style="width:auto"' + (b.on ? ' checked' : '') + '> 도전행동 지원계획 포함</label>';
    if (b.on) h += '<div class="grid" style="margin-top:8px">' + fld('도전행동(관찰 가능한 행동으로)', 'behavior.target', b.target, { area: 1, wide: 1 }) +
      fld('추정 기능(왜 하는가)', 'behavior.func', b.func, { sel: ['', '관심 얻기', '회피·도피', '원하는 물건·활동 얻기', '감각 자극', '복합·확인 중'] }) +
      fld('예방 전략(선행사건 조절)', 'behavior.prevent', b.prevent, { area: 1 }) + fld('대체행동 교수', 'behavior.replace', b.replace, { area: 1 }) +
      fld('반응 전략(후속결과)', 'behavior.respond', b.respond, { area: 1 }) + fld('위기 행동 대응 절차', 'behavior.crisis', b.crisis, { area: 1 }) + '</div>';
    h += '<label style="display:flex;gap:8px;align-items:center;color:var(--ink);margin-top:12px"><input type="checkbox" data-chk="transition.on" style="width:auto"' + (t.on ? ' checked' : '') + '> 개별화전환교육계획(중·고) 포함 <small style="color:var(--soft)">— 법적 의무는 아니며 진로·직업교육을 위해 넣을 수 있어요</small></label>';
    if (t.on) h += '<div class="grid" style="margin-top:8px">' + fld('졸업 후 희망 진로(학생·보호자)', 'transition.hope', t.hope, { area: 1 }) + fld('현재 진로 준비 수준', 'transition.now', t.now, { area: 1 }) +
      fld('이번 학기 전환 목표', 'transition.goal', t.goal, { area: 1 }) + fld('연계 기관·현장실습·체험', 'transition.link', t.link, { area: 1 }) + fld('필요한 지원', 'transition.support', t.support, { area: 1, wide: 1 }) + '</div>';
    h += '</section>';

    /* 6 평가 */
    h += '<section class="card" id="s-eval"><h2>6. 평가</h2><p class="hint">학기별 1회 보호자에게 평가 결과를 안내합니다. 4번 월별 계획의 단원·단기 목표·성취준거마다 결과(가·나·다·라)와 관찰 메모를 남기면, 그 내용으로 교과별 서술형 평가 문장을 만듭니다. 앱 기록이 있으면 결과를 먼저 제안받을 수 있어요.</p>';
    h += '<div class="grid">' + fld('가: 이상(%)', 'scale.a', p.scale.a, { type: 'number' }) + fld('나: 이상(%)', 'scale.b', p.scale.b, { type: 'number' }) + '</div>';
    h += '<p class="hint" style="margin-top:6px">가 ' + p.scale.a + '% 이상 대체로 스스로 수행 · 나 ' + p.scale.b + '~' + p.scale.a + '% 부분적 도움 · 다 ' + p.scale.b + '% 미만 전반적 도움 · 라 수행하지 못함</p>';
    h += '<div class="actions"><button data-act="fillEval">📊 점검·앱 기록으로 결과 제안</button><button data-act="progressReport">📨 보호자용 진전 안내</button><button class="pri" data-act="evalWriteAll">✍️ 모든 교과 평가 문장 만들기</button><button data-act="aiOpen" data-si="-1">🤖 AI 도움 받기(전체)</button></div>';
    if (!p.subjects.length) h += '<p class="note">4번에서 교과·영역을 먼저 추가해 주세요.</p>';
    h += p.subjects.map(evalSubjectHtml).join('');
    h += '<div class="subj"><div class="head"><h3>종합 평가</h3><button data-act="evalTotal">✍️ 종합 평가 만들기</button></div><div class="body"><div class="grid">' + fld('종합 평가', 'evalTotal', p.evalTotal, { area: 1, wide: 1, ph: '교과별 평가와 행동·생활 영역을 묶어 학생의 성장과 다음 학기 중점을 적어요.' }) + '</div></div></div></section>';

    /* 7 파일 */
    h += '<section class="card" id="s-file"><h2>7. 저장·불러오기</h2><p class="hint">작성 내용은 이 기기에 자동 저장돼요(실명·연락처는 인적사항 항목의 저장 설정에 따름). 다른 기기로 옮기거나 보관하려면 백업 파일을 쓰세요.</p>' +
      '<div class="actions"><button data-act="exportJson">💾 백업 파일 저장</button><label class="ghost" style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:10px;padding:8px 12px;color:var(--ink);margin:0;cursor:pointer">📂 백업 파일 불러오기<input type="file" id="importJson" accept="application/json,.json" style="display:none"></label>' +
      '<button data-act="copyPlan">📑 다음 학기로 복사</button><button class="del" data-act="delPlan">🗑️ 이 계획 삭제</button></div></section>';
    app.innerHTML = arrange(h, p);
    $$('table.edit textarea, #s-eval textarea', app).forEach(grow);
  }
  /* 교과·평가를 앞에, 인적사항·진단·지원팀·행동지원은 '선택'으로 접어 둠(필요할 때만 펼침) */
  var MAIN = ['s-basic', 's-subj', 's-eval'], OPTS = ['s-info', 's-diag', 's-team', 's-beh'];
  var OPT_TITLE = { 's-info': '학교·학생 인적사항', 's-diag': '진단·현재 수행 수준', 's-team': '지원팀·관련서비스', 's-beh': '도전행동 지원·전환교육' };
  function uiOpen(id) { return !!jget('oks_iep_ui', {})[id]; }
  function filled(id, p) {
    var i = p.info, any = function (a) { return a.some(function (x) { return x && String(x).trim(); }); };
    if (id === 's-info') return any([i.school, i.gradeClass, i.name, i.specialTeacher, i.generalTeacher, i.birth, i.disability, i.welfare, i.guardian, i.address, i.selectDate, i.phone]);
    if (id === 's-diag') return any([p.present, p.strengths, p.studentNeeds, p.parentNeeds, p.etc].concat(p.tests.map(function (t) { return t.tool + t.result; })));
    if (id === 's-team') return any(p.team.map(function (t) { return t.name; }).concat(p.meetings.map(function (m) { return m.date; }), p.services.map(function (x) { return x.org + x.content; })));
    if (id === 's-beh') return !!((p.behavior && p.behavior.on) || (p.transition && p.transition.on));
    return false;
  }
  function arrange(h, p) {
    var chunks = {};
    h.split(/(?=<section class="card" id=")/).forEach(function (c) { var m = /^<section class="card" id="([^"]+)"/.exec(c); if (m) chunks[m[1]] = c; });
    var n = 0, out = '';
    MAIN.forEach(function (id) { if (chunks[id]) { n++; out += chunks[id].replace(/<h2>(?:\d+\.\s*)?/, '<h2>' + n + '. '); } });
    out += '<h2 class="optdiv">선택 항목 <small>필요할 때만 펼쳐서 쓰세요 · 비워 두면 출력에서 빠져요</small></h2>';
    OPTS.forEach(function (id) {
      var c = chunks[id]; if (!c) return;
      c = c.replace('<section class="card" id="' + id + '">', '<details class="card opt" id="' + id + '"' + (uiOpen(id) ? ' open' : '') + '><summary>')
        .replace(/<h2>(?:\d+\.\s*)?([^<]*)<\/h2>/, '<h2>' + OPT_TITLE[id] + '</h2><span class="opt-tag' + (filled(id, p) ? ' on">작성됨' : '">비어 있음') + '</span></summary>')
        .replace(/<\/section>\s*$/, '</details>');
      out += c;
    });
    if (chunks['s-file']) out += chunks['s-file'].replace(/<h2>(?:\d+\.\s*)?/, '<h2>');
    return out;
  }
  document.addEventListener('toggle', function (e) {
    var d = e.target; if (!d.matches || !d.matches('details.opt')) return;
    var u = jget('oks_iep_ui', {}); u[d.id] = d.open; jset('oks_iep_ui', u);
  }, true);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('nav.steps a'); if (!a) return;
    var t = document.querySelector(a.getAttribute('href')); if (t && t.tagName === 'DETAILS') t.open = true;
  });
  function grow(t) { t.style.height = 'auto'; t.style.height = Math.max(56, t.scrollHeight + 2) + 'px'; }

  function subjectHtml(s, si) {
    var base = 'subjects.' + si;
    var h = '<div class="subj" data-si="' + si + '"><div class="head"><h3>' + esc(s.name) + (subjSummary(s) ? ' <small style="font-weight:400;color:var(--soft)">' + esc(subjSummary(s)) + '</small>' : '') + '</h3>' +
      '<button class="ghost" data-act="moveSubj" data-si="' + si + '" data-dir="-1" aria-label="위로">▲</button><button class="ghost" data-act="moveSubj" data-si="' + si + '" data-dir="1" aria-label="아래로">▼</button>' +
      '<button class="ghost del" data-act="delSubj" data-si="' + si + '">삭제</button></div><div class="body">';
    if (!s.life) {
      var cs = coursesOf(s), ac = availCourses(s.name), ab = availBands(s.name, cs), bs = bandsOf(s);
      h += '<div class="picker"><div class="row"><div><label>교육과정 <small>(함께 고를 수 있어요)</small></label><div class="chips">' +
        COURSES.map(function (c) { var ok = ac.indexOf(c) >= 0; return '<label class="chk' + (ok ? '' : ' off') + '"><input type="checkbox" data-scourse="' + c + '" data-si="' + si + '"' + (cs.indexOf(c) >= 0 ? ' checked' : '') + (ok ? '' : ' disabled title="이 교과는 ' + c + '에 없어요"') + '> ' + c + '</label>'; }).join('') + '</div></div>' +
        '<div><label>학년군 <small>(여러 개)</small></label><div class="chips">' +
        BAND_ORDER.map(function (b) { var ok = ab.indexOf(b) >= 0; return '<label class="chk' + (ok ? '' : ' off') + '"><input type="checkbox" data-sband="' + b + '" data-si="' + si + '"' + (bs.indexOf(b) >= 0 ? ' checked' : '') + (ok ? '' : ' disabled') + '> ' + b + '</label>'; }).join('') + '</div></div></div>' +
        '<div class="row"><div><label>성취기준 찾기</label><input data-pick="q" data-si="' + si + '" placeholder="낱말로 찾기 (예: 시각, 화폐, 인사)"></div></div>' +
        '<div class="stdlist" id="stdlist-' + si + '">' + stdListHtml(s, si, '') + '</div>' +
        '<div class="actions"><button class="pri" data-act="autoFill" data-si="' + si + '">⚡ 고른 성취기준으로 장기 목표·월별 계획 채우기</button><span class="hint" style="margin:0;align-self:center">앱 차시가 있으면 단원·차시·평가 준거까지 들어가요</span></div></div>';
    }
    if (s.stds.length) h += '<div class="chips" style="margin:6px 0">' + s.stds.map(function (c) { var m = meta(c) || {}; return '<span class="chip std" title="' + esc(STD[c]) + '"><span class="ctag ' + (m.course === COURSE_C ? 'c' : 'b') + '">' + shortC(m.course) + '</span><b>' + esc(c) + '</b></span>'; }).join('') + '</div>';
    h += '<div class="grid">' + fld('현재 학습 수행 수준', base + '.present', s.present, { area: 1, wide: 1, ph: '- 할 수 있는 것(구체적 행동)\n- 도움이 필요한 것' }) +
      fld('학기 장기 목표', base + '.longGoals', s.longGoals, { area: 1, wide: 1, ph: '- (조건) + 행동 + (기준) 으로 적어요. 예: 그림 단서가 주어지면 ~을 5회 중 4회 할 수 있다.' }) + '</div>';
    h += '<div class="actions"><button data-act="presentFromRec" data-si="' + si + '">📋 앱 기록으로 현재 수준 초안</button></div>';
    h += supHtml(s, si);
    if (s.rows.length) h += '<p class="hint" style="margin:8px 0 4px">단기 목표마다 <b>조건</b>(어떤 도움으로)·<b>기준</b>(얼마나)·<b>기간</b>(얼마 동안)을 붙이면 측정 가능한 목표가 됩니다. 목록에서 고르거나 직접 쓰세요.</p>';
    h += '<div class="scroll"><table class="edit"><thead><tr><th style="width:74px">월</th><th style="width:140px">단원</th><th>단기 교육목표</th><th>교육내용</th><th style="width:120px">교육방법</th><th style="width:150px">성취준거</th><th style="width:70px">평가결과</th><th style="width:96px"></th></tr></thead><tbody>';
    h += s.rows.map(function (r, ri) {
      var rb = base + '.rows.' + ri;
      var tags = r.std.map(function (c) { return '<span class="chip std" title="' + esc(STD[c]) + '">' + esc(c) + '</span>'; }).concat(r.lessons.map(function (id) { var l = lessonById(id); return '<span class="chip les" title="' + esc(l ? lessonLabel(l) : id) + '">🎮 ' + esc(id) + '</span>'; })).join('');
      return '<tr><td><input data-p="' + rb + '.month" value="' + esc(r.month) + '" list="months-' + si + '"></td><td><textarea data-p="' + rb + '.unit">' + esc(r.unit) + '</textarea></td>' +
        '<td><textarea data-p="' + rb + '.goal">' + esc(r.goal) + '</textarea>' +
        '<div class="meas"><input data-p="' + rb + '.cond" value="' + esc(r.cond || '') + '" list="dl-cond" placeholder="조건" title="조건: 어떤 도움·상황에서"><input data-p="' + rb + '.measure" value="' + esc(r.measure || '') + '" list="dl-meas" placeholder="기준" title="기준: 얼마나 정확하게"><input data-p="' + rb + '.period" value="' + esc(r.period || '') + '" list="dl-per" placeholder="기간" title="기간: 얼마 동안 유지"></div>' +
        (goalCore(r) && (r.cond || r.measure || r.period) ? '<div class="goalfull">🎯 ' + esc(goalFull(r)) + '</div>' : '') +
        (tags ? '<div class="chips">' + tags + '</div>' : '') + '</td><td><textarea data-p="' + rb + '.content">' + esc(r.content) + '</textarea></td>' +
        '<td><textarea data-p="' + rb + '.method">' + esc(r.method) + '</textarea></td><td><textarea data-p="' + rb + '.crit">' + esc(r.crit) + '</textarea></td>' +
        '<td><select data-p="' + rb + '.result"><option></option>' + ['가', '나', '다', '라'].map(function (g) { return '<option' + (g === r.result ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select><input data-p="' + rb + '.memo" value="' + esc(r.memo) + '" placeholder="근거" title="평가 근거"></td>' +
        '<td><button class="ghost" data-act="pickLes" data-si="' + si + '" data-ri="' + ri + '" title="앱 차시 연결">🎮</button><button class="ghost" data-act="moveRow" data-si="' + si + '" data-ri="' + ri + '" data-dir="-1" aria-label="위로">▲</button><button class="ghost del" data-del="' + rb + '" aria-label="삭제">✕</button></td></tr>';
    }).join('');
    h += '</tbody></table></div><datalist id="months-' + si + '">' + termMonths(cur.term).map(function (m) { return '<option value="' + m + '">'; }).join('') + '<option value="학기 내내"></datalist>';
    h += '<div class="actions"><button data-add="' + base + '.rows">＋ 행 추가</button><button data-act="fillContent" data-si="' + si + '">📝 빈 교육내용 채우기</button></div></div></div>';
    return h;
  }
  function stdListHtml(s, si, q) {
    var cs = coursesOf(s), bs = bandsOf(s);
    var list = ALL.filter(function (x) { return cs.indexOf(x.course) >= 0 && x.subj === s.name && bs.indexOf(x.band) >= 0; });
    list.sort(function (a, b) { return (COURSES.indexOf(a.course) - COURSES.indexOf(b.course)) || (BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band)) || 0; });
    if (q) { var w = q.split(/\s+/).filter(Boolean); list = list.filter(function (x) { return w.every(function (t) { return (x.code + x.text + x.area).indexOf(t) >= 0; }); }); }
    if (!list.length) return '<p class="hint" style="padding:8px">' + (q ? '찾는 성취기준이 없어요.' : (!cs.length || !bs.length ? '위에서 교육과정과 학년군을 하나 이상 골라 주세요.' : '고른 교육과정·학년군에 이 교과 성취기준이 없어요. 회색이 아닌 학년군을 골라 보세요.')) + '</p>';
    var lastA = null, h = '';
    list.forEach(function (x) {
      if (x.course + x.areaKey !== lastA) { h += '<div class="area"><span class="ctag ' + (x.course === COURSE_C ? 'c' : 'b') + '">' + shortC(x.course) + '</span> ' + esc(x.band) + ' · ' + esc(x.area || x.subj) + '</div>'; lastA = x.course + x.areaKey; }
      var n = lessonsFor(x.code).length;
      h += '<label><input type="checkbox" data-std="' + x.code + '" data-si="' + si + '"' + (s.stds.indexOf(x.code) >= 0 ? ' checked' : '') + '><span><b>[' + esc(x.code) + ']</b> ' + esc(x.text) + (n ? ' <small>· 🎮 앱 차시 ' + n + '개</small>' : '') + '</span></label>';
    });
    return h;
  }

  /* ---------- 자동 채우기 ---------- */
  function autoFill(si) {
    var s = cur.subjects[si]; if (!s.stds.length) { toast('먼저 성취기준을 골라 주세요'); return; }
    if (s.rows.length && !confirm('지금 있는 월별 표 뒤에 새 행을 붙일까요? (기존 행은 그대로 둡니다)')) return;
    var months = termMonths(cur.term), stds = s.stds.slice();
    var goals = stds.map(function (c) { return '- ' + toGoal(STD[c]); });
    s.longGoals = (s.longGoals ? s.longGoals.replace(/\s+$/, '') + '\n' : '') + goals.join('\n');
    var made = 0;
    stds.forEach(function (c, k) {
      var month = months[Math.min(months.length - 1, Math.floor(k * months.length / stds.length))];
      var bsx = bandsOf(s), ls = lessonsFor(c).filter(function (l) { return !bsx.length || bsx.indexOf(bandOfLesson(l)) >= 0 || !bandOfLesson(l); });
      if (!ls.length) ls = lessonsFor(c);
      var m = meta(c);
      if (!ls.length) {
        var r = newRow(month); r.unit = m.area ? '[' + m.area + ']' : ''; r.goal = toGoal(STD[c]); r.content = contentFor(c); r.crit = toQuestion(r.goal); r.std = [c];
        s.rows.push(r); made++; return;
      }
      ls.slice(0, 3).forEach(function (l) {
        var r = newRow(month);
        r.unit = l.unit + '\n(' + l.schoolName + ' ' + l.no + ' ' + l.topic + ')';
        var g = l.crit ? toGoal(l.crit) : toGoal(STD[c]);
        r.goal = g;
        r.content = '- ' + l.goal + '\n- 앱 차시 ' + l.id + ' 〈' + (l.space || l.topic) + '〉 수준 ' + startLevel(l) + '→' + Math.min(5, startLevel(l) + 1) + '\n- 실제 생활 장면에서 해 보기';
        r.method = '직접교수, 모델링, 최소촉진\n앱 차시(수준 ' + startLevel(l) + ')';
        r.crit = toQuestion(g); r.std = [c]; r.lessons = [l.id];
        s.rows.push(r); made++;
      });
    });
    var ord = function (x) { var i = months.indexOf(x.month); return i < 0 ? 99 : i; };
    s.rows.sort(function (a, b) { return ord(a) - ord(b); });
    save(); render(); toast('장기 목표 ' + goals.length + '개, 월별 계획 ' + made + '행을 채웠어요. 학생에 맞게 고쳐 주세요');
  }
  function bandOfLesson(l) { return { elem: '', middle: '중1~3', high: '고1~3', basic: '' }[l.school] || ''; }
  function startLevel(l) {
    var pr = jget('oks_learning_progress_v1' + (cur.profile ? '__' + cur.profile : ''), {})[l.id];
    if (pr && pr.last) return Math.min(5, pr.last);
    return 2;
  }

  function presentFromRec(si) {
    var s = cur.subjects[si], ids = {};
    s.rows.forEach(function (r) { r.lessons.forEach(function (id) { ids[id] = 1; }); });
    if (!Object.keys(ids).length) LES.forEach(function (l) { if (l.subjectName === s.name || (s.name === '생활영어' && l.subject === 'english')) ids[l.id] = 1; });
    var rs = jget(LOG_KEY, []).filter(function (r) { return (r.profile || '') === (cur.profile || '') && ids[r.lesson]; });
    if (!rs.length) { toast('이 학생의 앱 기록이 아직 없어요'); return; }
    var by = {}; rs.forEach(function (r) { (by[r.lesson] = by[r.lesson] || []).push(r); });
    var lines = Object.keys(by).map(function (id) { var l = lessonById(id), sm = summarize(by[id]); return '- ' + (l ? l.topic : id) + ': 수준 ' + sm.maxLevel + '까지 ' + sm.n + '회, 독립·언어힌트 수행 ' + sm.rate + '% (최근: ' + sm.recent.join('→') + ')'; });
    s.present = (s.present ? s.present.replace(/\s+$/, '') + '\n' : '') + '[앱 기록 요약]\n' + lines.join('\n');
    save(); render(); toast('현재 수준에 앱 기록 요약을 넣었어요');
  }
  function recSummary() {
    var rs = jget(LOG_KEY, []).filter(function (r) { return (r.profile || '') === (cur.profile || ''); });
    if (!rs.length) { toast('이 학생의 앱 기록이 아직 없어요'); return; }
    var by = {}; rs.forEach(function (r) { var l = lessonById(r.lesson); var k = l ? l.subjectName : '기타'; (by[k] = by[k] || []).push(r); });
    var lines = Object.keys(by).map(function (k) { var sm = summarize(by[k]); return '- ' + k + ': ' + sm.n + '회 활동, 독립·언어힌트 수행 ' + sm.rate + '%, 최고 수준 ' + sm.maxLevel; });
    cur.tests.push({ tool: '옥쌤의 즐거운 교실 활동 기록', date: new Date().toISOString().slice(0, 10), result: lines.join(' / ') });
    save(); render(); toast('진단·평가 결과에 앱 기록 요약을 넣었어요');
  }
  function fillEval() {
    var n = 0, none = 0;
    cur.subjects.forEach(function (s) {
      s.rows.forEach(function (r) {
        var st = rowStatus(r);
        if (st.rate == null) { if (r.lessons.length || (r.checks || []).length) none++; return; }
        r.result = gradeOf(st.rate, cur.scale);
        var auto = '최근 ' + st.rate + '%·목표 ' + st.target + '%·기록 ' + st.n + '회';
        if (!r.memo || /^(앱 |최근 )/.test(r.memo)) r.memo = auto;
        n++;
      });
    });
    save(); render(); toast(n ? n + '개 목표에 결과를 제안했어요' + (none ? ' (기간 안 기록 없는 목표 ' + none + '개)' : '') : '점검 기록이나 앱 기록이 있는 목표가 없어요. ＋ 점검 기록으로 남겨 주세요');
  }
  /* 점검 기록 창 */
  var chkTarget = null;
  function openChk(si, ri) {
    chkTarget = { si: si, ri: ri };
    var r = cur.subjects[si].rows[ri], d = $('#chkDlg');
    var list = (r.checks || []).map(function (c, k) { return '<tr><td>' + esc(c.date) + '</td><td>' + esc(c.pct) + '%' + (c.raw ? ' <small>(' + esc(c.raw) + ')</small>' : '') + '</td><td>' + esc(c.note || '') + '</td><td><button type="button" class="ghost del" data-act="delCheck" data-k="' + k + '" aria-label="삭제">✕</button></td></tr>'; }).join('');
    $('.dbody', d).innerHTML = '<p class="hint"><b>' + esc(goalFull(r)) + '</b><br>목표 수준 ' + targetPct(r) + '% · 앱 기록은 자동으로 합쳐져요</p>' +
      '<div class="grid"><div><label for="ckDate">날짜</label><input id="ckDate" type="date" value="' + today() + '"></div>' +
      '<div><label for="ckOk">해낸 횟수</label><input id="ckOk" type="number" min="0" inputmode="numeric" placeholder="예: 4"></div>' +
      '<div><label for="ckTry">시도 횟수</label><input id="ckTry" type="number" min="1" inputmode="numeric" placeholder="예: 5"></div>' +
      '<div><label for="ckPct">또는 수행률(%)</label><input id="ckPct" type="number" min="0" max="100" inputmode="numeric" placeholder="예: 80"></div>' +
      '<div class="wide"><label for="ckNote">관찰 메모</label><input id="ckNote" placeholder="예: 그림 카드 2장 중에서 스스로 고름"></div></div>' +
      '<div class="actions"><button type="button" class="pri" data-act="saveCheck">기록 추가</button></div>' +
      (list ? '<table class="edit"><thead><tr><th>날짜</th><th>수행</th><th>메모</th><th></th></tr></thead><tbody>' + list + '</tbody></table>' : '<p class="hint">아직 점검 기록이 없어요.</p>');
    if (!d.open) d.showModal();
  }
  /* 보호자용 진전 안내(1쪽) */
  function progressHtml(p) {
    var nm = p.info.name || profLabel(p.profile) || '';
    var h = '<div class="docwrap"><h1>' + esc(p.year) + '학년도 ' + esc(p.term) + '학기 개별화교육 진전 안내</h1>';
    h += '<p>' + (nm ? '<b>' + esc(nm) + '</b> 학생의 ' : '') + '이번 학기 개별화교육 목표를 향해 지금까지 배운 모습을 알려 드립니다. <small>(' + today() + ' 기준)</small></p>';
    p.subjects.forEach(function (s) {
      if (!s.rows.length) return;
      h += '<h2>' + esc(subjLabel(s)) + '</h2><table><tr><th style="width:38%">목표</th><th style="width:28%">지금까지의 진전</th><th>지금의 모습</th></tr>' +
        s.rows.map(function (r) {
          var st = rowStatus(r), pts = rowPoints(r), lastNote = (r.checks || []).length ? r.checks[r.checks.length - 1].note : '';
          return '<tr><td>' + esc(goalFull(r)) + '</td><td class="center">' + spark(r, 160, 44) + '<br><small>' + (st.rate != null ? '최근 ' + st.rate + '% · 목표 ' + st.target + '% · 기록 ' + pts.length + '회' : '아직 기록 없음') + '</small></td><td><b>' + st.txt + '</b>' + (lastNote ? '<br>' + esc(lastNote) : (r.memo ? '<br>' + esc(oneLine(r.memo)) : '')) + '</td></tr>';
        }).join('') + '</table>';
    });
    h += '<table><tr><th style="width:24%">가정에서 함께해 주시면<br>좋은 점</th><td style="height:56pt"></td></tr></table>';
    h += '<p><small>그래프: 실선 ● 선생님 관찰, ○ 앱 활동 기록(스스로 또는 말 도움으로 해낸 비율), 점선은 목표 수준입니다.' + (p.info.specialTeacher ? ' · 담당: ' + esc(p.info.specialTeacher) : '') + '</small></p></div>';
    return h;
  }

  /* ---------- 평가: 목표별 결과 표 → 서술형 문장 ---------- */
  function subjLabel(s) { var sm = subjSummary(s); return s.life ? s.name + ' 영역' : s.name + (sm ? ' (' + sm + ')' : ''); }
  function oneLine(t) { return String(t || '').replace(/\s*\n\s*/g, ' ').trim(); }
  function cleanGoal(g) { return oneLine(g).replace(/^-\s*/, '').replace(/[.。]\s*$/, ''); }
  function unitName(u) { return oneLine(String(u || '').split('\n')[0]).replace(/^\[|\]$/g, ''); }
  function evalSubjectHtml(s, si) {
    var h = '<div class="subj"><div class="head"><h3>' + esc(subjLabel(s)) + ' 평가</h3><button data-act="evalWrite" data-si="' + si + '">✍️ 문장 만들기</button><button data-act="aiOpen" data-si="' + si + '">🤖 AI 도움</button></div><div class="body">';
    if (s.rows.length) {
      h += '<div class="scroll"><table class="edit"><thead><tr><th style="width:64px">월</th><th style="width:150px">단원</th><th>단기 교육목표</th><th style="width:19%">성취준거</th><th style="width:176px">진전(점검 기록)</th><th style="width:150px">결과</th><th style="width:19%">관찰 메모·근거</th></tr></thead><tbody>' +
        s.rows.map(function (r, ri) {
          var stt = rowStatus(r);
          return '<tr><td>' + esc(r.month) + '</td><td>' + esc(unitName(r.unit)) + '</td><td>' + esc(goalFull(r)) + (r.std.length ? '<div class="chips">' + r.std.map(function (c) { return '<span class="chip std" title="' + esc(STD[c]) + '">' + esc(c) + '</span>'; }).join('') + '</div>' : '') + '</td><td>' + esc(critFull(r)) + '</td>' +
            '<td>' + spark(r) + '<div class="stline"><span class="st ' + stt.cls + '">' + stt.txt + '</span>' + (stt.rate != null ? ' 최근 ' + stt.rate + '% / 목표 ' + stt.target + '%' : ' 목표 ' + stt.target + '%') + '</div><button type="button" class="ghost" data-act="addCheck" data-si="' + si + '" data-ri="' + ri + '">＋ 점검 기록' + ((r.checks || []).length ? ' (' + r.checks.length + ')' : '') + '</button></td>' +
            '<td><div class="gbtns" role="group" aria-label="평가 결과">' + ['가', '나', '다', '라'].map(function (g) { return '<button type="button" class="gbtn' + (r.result === g ? ' on' : '') + '" data-grade="' + g + '" data-si="' + si + '" data-ri="' + ri + '" aria-pressed="' + (r.result === g) + '" title="' + GRADE_TEXT[g] + '">' + g + '</button>'; }).join('') + '</div></td>' +
            '<td><textarea data-p="subjects.' + si + '.rows.' + ri + '.memo" placeholder="예: 그림 카드를 주면 스스로 고름">' + esc(r.memo) + '</textarea></td></tr>';
        }).join('') + '</tbody></table></div>';
    } else {
      h += '<p class="hint">4번에서 월별 계획을 채우면 단기 목표마다 결과를 고를 수 있어요. 지금은 장기 목표와 성취기준으로 문장을 만듭니다.</p>';
    }
    h += '<div class="grid" style="margin-top:8px">' + fld(subjLabel(s) + ' 평가 결과(서술)', 'subjects.' + si + '.eval', s.eval, { area: 1, wide: 1 }) + '</div></div></div>';
    return h;
  }
  var GRADE_PHRASE = { '가': '대체로 스스로 수행함', '나': '부분적인 도움을 받아 수행함', '다': '전반적인 도움을 받아 수행함', '라': '아직 수행하지 못함' };
  function goalPhrase(r) {
    var g = goalCore(r) || cleanGoal(r.content) || unitName(r.unit);
    var memo = oneLine(r.memo);
    return '‘' + g + '’' + (/있다$/.test(g) ? '는' : '') + ' 목표는 ' + GRADE_PHRASE[r.result] + (memo ? '(' + memo + ')' : '') + '.';
  }
  function evalText(s) {
    var out = [], rows = s.rows.filter(function (r) { return cleanGoal(r.goal) || cleanGoal(r.content); });
    /* '[읽기]'처럼 대괄호로 들어간 것은 앱 차시가 없어 영역 이름을 넣어 둔 것 → 단원이 아니라 영역으로 씀 */
    var units = [], areas = [];
    rows.forEach(function (r) {
      var raw = oneLine(String(r.unit || '').split('\n')[0]), u = unitName(r.unit);
      if (!u) return;
      if (/^\[.*\]$/.test(raw)) { if (areas.indexOf(u) < 0) areas.push(u); } else if (units.indexOf(u) < 0) units.push(u);
    });
    if (!units.length && !areas.length) s.stds.forEach(function (c) { var m = meta(c); if (m && m.area && areas.indexOf(m.area) < 0) areas.push(m.area); });
    var nm = s.life ? s.name + ' 영역' : s.name;
    var uTxt = units.length ? units.slice(0, 4).map(function (u) { return '‘' + u + '’'; }).join(', ') + (units.length > 4 ? ' 등' : '') + ' 단원' : '';
    var aTxt = areas.length ? areas.join('·') + ' 영역' : '';
    if (uTxt || aTxt) out.push('이번 학기 ' + nm + '에서는 ' + [uTxt, aTxt].filter(Boolean).join('과 ') + '을 중심으로 학습함.');
    else out.push('이번 학기 ' + nm + '에서는 개별화교육 목표를 중심으로 학습함.');
    var done = rows.filter(function (r) { return GRADE_PHRASE[r.result]; });
    ['가', '나', '다', '라'].forEach(function (g) { done.filter(function (r) { return r.result === g; }).forEach(function (r) { out.push(goalPhrase(r)); }); });
    var todo = rows.filter(function (r) { return !GRADE_PHRASE[r.result]; });
    if (!rows.length) {
      var lg = String(s.longGoals || '').split('\n').map(cleanGoal).filter(Boolean);
      if (lg.length) out.push(lg.slice(0, 3).map(function (g) { return '‘' + g + '’'; }).join(', ') + (/있다’$/.test('‘' + lg[0] + '’') ? '는' : '') + ' 목표를 중심으로 지도하였으며 [성취 정도와 관찰한 변화]를 보임.');
      else out.push('[성취 정도와 관찰한 변화를 적어 주세요]');
    } else if (todo.length) {
      var tg = todo.map(function (r) { return '‘' + cleanGoal(r.goal || r.content) + '’'; });
      out.push(tg.join(', ') + (/있다’$/.test(tg[tg.length - 1]) ? '는' : '') + ' 목표는 [평가 결과를 적어 주세요].');
    }
    var weak = done.filter(function (r) { return r.result === '다' || r.result === '라'; });
    if (weak.length) {
      var m0 = oneLine(String(weak[0].method || '').split('\n')[0]);
      out.push('다음 학기에는 ‘' + cleanGoal(weak[0].goal) + '’ 목표를 이어서 지도하고, ' + (m0 ? m0 + ' 등' : '단계별 촉진') + '의 지원을 계속할 필요가 있음.');
    } else if (done.length && done.every(function (r) { return r.result === '가'; })) {
      out.push('다음 학기에는 익힌 내용을 실제 생활 장면에 적용하고 스스로 하는 기회를 넓힐 필요가 있음.');
    } else if (done.length) {
      out.push('다음 학기에는 도움을 점차 줄여 스스로 수행하는 비율을 높일 필요가 있음.');
    }
    return { text: out.join(' '), todo: todo.length, rows: rows.length };
  }
  function writeEval(si, quiet) {
    var s = cur.subjects[si];
    if (s.eval && !quiet && !confirm(subjLabel(s) + ' 평가 칸에 이미 글이 있어요. 새 문장으로 바꿀까요?')) return null;
    var r = evalText(s); s.eval = r.text; return r;
  }
  function totalText(p) {
    var all = [], names = [], by = { '가': 0, '나': 0, '다': 0, '라': 0 }, best = null, bestN = -1;
    p.subjects.forEach(function (s) {
      names.push(s.life ? s.name + ' 영역' : s.name);
      var n = 0; s.rows.forEach(function (r) { if (by[r.result] != null) { by[r.result]++; all.push(r); if (r.result === '가') n++; } });
      if (n > bestN && n > 0) { bestN = n; best = s; }
    });
    var t = [];
    if (all.length) {
      t.push('이번 학기 ' + names.join(', ') + '에서 단기 목표 ' + all.length + '개 중 ' + by['가'] + '개는 대체로 스스로, ' + by['나'] + '개는 부분적인 도움을 받아 수행함.');
      if (best) t.push('특히 ' + (best.life ? best.name + ' 영역' : best.name) + '에서 스스로 해내는 모습이 늘어남.');
      if (by['다'] + by['라']) t.push('도움이 많이 필요했던 ' + (by['다'] + by['라']) + '개 목표는 다음 학기에 이어서 지도할 예정임.');
    } else {
      t.push('이번 학기 ' + (names.join(', ') || '개별화교육 목표') + '를 중심으로 지도함.');
    }
    if (p.behavior && p.behavior.on && p.behavior.target) t.push('도전행동(' + oneLine(p.behavior.target).slice(0, 40) + ')은 지원 계획에 따라 지도하였으며 [변화 정도]를 보임.');
    if (p.transition && p.transition.on && p.transition.goal) t.push('전환 목표(' + oneLine(p.transition.goal).slice(0, 40) + ')와 관련하여 [진행 상황]을 보임.');
    t.push('[학생의 강점과 가정에서 함께 도와줄 점을 덧붙여 주세요]');
    return t.join(' ');
  }

  /* ---------- AI 도움: 개인정보를 뺀 요청문을 만들어 복사 → 답을 붙여 넣으면 교과별로 나눠 넣기 ---------- */
  var aiTarget = -1;
  function aiPrompt(si) {
    var p = cur, list = si >= 0 ? [p.subjects[si]] : p.subjects;
    var L = [];
    L.push('너는 특수교육 교사의 개별화교육계획 학기말 평가 작성을 돕는 조수야. 아래 근거만 사용해 서술형 평가를 써 줘.');
    L.push('');
    L.push('[작성 조건]');
    L.push('- 교과마다 3~5문장. 문장 끝은 "~함", "~임", "~보임"처럼 개조식으로.');
    L.push('- 성장과 강점을 먼저 쓰고, 도움이 필요한 점, 다음 학기 지도 방향 순서로.');
    L.push('- 결과 척도: 가 ' + p.scale.a + '% 이상 대체로 스스로 수행 / 나 ' + p.scale.b + '~' + p.scale.a + '% 부분적 도움 / 다 ' + p.scale.b + '% 미만 전반적 도움 / 라 수행하지 못함.');
    L.push('- 근거에 없는 사실(진단명, 가정 형편, 성격 판단 등)은 지어내지 말고, 모르는 부분은 [ ]로 비워 둬.');
    L.push('- 학생 이름 대신 "학생"이라고 써.');
    L.push('- 출력 형식: 교과마다 "[교과 이름]" 줄 다음에 문단' + (si >= 0 ? '.' : ', 마지막에 "[종합 평가]" 2~3문장.'));
    L.push('');
    L.push('[학생 정보] ' + p.year + '학년도 ' + p.term + '학기 · 계획 유형: ' + p.type + ' · 적용 교육과정: ' + (p.course || COURSE_B));
    if (p.present) L.push('현재 수행 수준(학기 초): ' + oneLine(p.present).slice(0, 400));
    list.forEach(function (s) {
      L.push('');
      L.push('[' + subjLabel(s) + ']');
      if (s.stds.length) L.push('관련 성취기준: ' + s.stds.map(function (c) { return '[' + c + '] ' + STD[c]; }).join(' / '));
      if (s.longGoals) L.push('장기 목표: ' + oneLine(s.longGoals));
      if (s.present) L.push('학기 초 수행 수준: ' + oneLine(s.present).slice(0, 300));
      if (supLines(s).length) L.push('지원·조정: ' + supLines(s).map(function (x) { return x[0] + ' — ' + x[1]; }).join(' / '));
      s.rows.forEach(function (r) {
        L.push('- ' + (r.month ? r.month + ' · ' : '') + (unitName(r.unit) ? '단원 ' + unitName(r.unit) + ' · ' : '') + '단기 목표: ' + goalFull(r) +
          (r.crit ? ' · 성취준거: ' + critFull(r) : '') + (rowStatus(r).rate != null ? ' · 점검 기록: 최근 ' + rowStatus(r).rate + '%(목표 ' + rowStatus(r).target + '%)' : '') + ' · 결과: ' + (r.result ? r.result + '(' + GRADE_TEXT[r.result] + ')' : '미평가') + (r.memo ? ' · 관찰: ' + oneLine(r.memo) : ''));
      });
    });
    if (si < 0 && p.behavior && p.behavior.on && p.behavior.target) { L.push(''); L.push('[도전행동 지원] 목표 행동: ' + oneLine(p.behavior.target) + (p.behavior.replace ? ' · 대체행동: ' + oneLine(p.behavior.replace) : '')); }
    return L.join('\n');
  }
  function openAi(si) {
    aiTarget = si;
    var d = $('#aiDlg');
    $('.dbody', d).innerHTML = '<p class="note">이름·생년월일·주소·연락처는 넣지 않았어요. 현재 수준이나 메모에 실명·학교명이 있으면 지우고 보내세요. 학교의 생성형 AI 사용 지침을 따라 주세요.</p>' +
      '<label for="aiPrompt">1. 이 요청문을 복사해 Claude 같은 AI 대화창에 붙여 넣으세요 (고쳐도 돼요)</label><textarea id="aiPrompt" style="min-height:220px;font-size:13px">' + esc(aiPrompt(si)) + '</textarea>' +
      '<div class="actions"><button type="button" class="pri" id="aiCopy">📋 요청문 복사</button></div>' +
      '<label for="aiAnswer">2. AI가 써 준 답을 여기에 붙여 넣으세요</label><textarea id="aiAnswer" style="min-height:160px" placeholder="[국어 (기본 중1~3)]\n…\n[종합 평가]\n…"></textarea>' +
      '<p class="hint">"[교과 이름]" 줄로 나뉜 답은 교과별 칸에 나눠 들어가고, "[종합 평가]"는 종합 평가 칸에 들어가요. 꼭 다시 읽고 고쳐 주세요.</p>';
    d.showModal();
  }
  function applyAi() {
    var txt = String(($('#aiAnswer') || {}).value || '').trim();
    if (!txt) { toast('AI 답을 붙여 넣어 주세요'); return; }
    var parts = [], re = /^\s*\[([^\]\n]{1,40})\]\s*$/gm, m, last = null;
    while ((m = re.exec(txt))) { if (last) last.body = txt.slice(last.end, m.index).trim(); last = { head: m[1].trim(), end: re.lastIndex }; parts.push(last); }
    if (last) last.body = txt.slice(last.end).trim();
    var n = 0;
    if (!parts.length) {
      if (aiTarget >= 0) { cur.subjects[aiTarget].eval = txt; n = 1; } else { cur.evalTotal = txt; n = 1; }
    } else {
      var used = {};
      parts.forEach(function (pt) {
        if (/종합/.test(pt.head)) { cur.evalTotal = pt.body; n++; return; }
        var idx = -1;
        cur.subjects.forEach(function (s, i) { if (idx < 0 && !used[i] && subjLabel(s) === pt.head) idx = i; });
        if (idx < 0) cur.subjects.forEach(function (s, i) { if (idx < 0 && !used[i] && (pt.head.indexOf(s.name) === 0 || s.name.indexOf(pt.head) === 0)) idx = i; });
        if (idx < 0 && aiTarget >= 0) idx = aiTarget;
        if (idx >= 0) { cur.subjects[idx].eval = pt.body; used[idx] = 1; n++; }
      });
    }
    $('#aiDlg').close(); save(); var y = window.scrollY; render(); window.scrollTo(0, y);
    toast(n ? n + '개 칸에 AI 답을 넣었어요. 다시 읽고 고쳐 주세요' : '나눠 넣을 곳을 찾지 못했어요');
  }

  /* ---------- 앱 차시 고르기 ---------- */
  var lesTarget = null;
  function openLesDlg(si, ri) {
    lesTarget = { si: si, ri: ri };
    var s = cur.subjects[si], r = s.rows[ri];
    var related = {}; (r.std.length ? r.std : s.stds).forEach(function (c) { lessonsFor(c).forEach(function (l) { related[l.id] = 1; }); });
    var list = LES.slice().sort(function (a, b) { return (related[b.id] ? 1 : 0) - (related[a.id] ? 1 : 0); });
    var body = '<input id="lesQ" placeholder="차시 이름·교과로 찾기" style="margin-bottom:8px"><div class="lespick">' + list.map(function (l) {
      return '<label data-txt="' + esc(lessonLabel(l) + ' ' + l.id + ' ' + l.goal) + '"><input type="checkbox" value="' + l.id + '"' + (r.lessons.indexOf(l.id) >= 0 ? ' checked' : '') + '><span>' + (related[l.id] ? '⭐ ' : '') + '<b>' + esc(l.id) + '</b> ' + esc(lessonLabel(l)) + ' <small style="color:var(--soft)">— ' + esc(l.goal) + '</small></span></label>';
    }).join('') + '</div><p class="hint">⭐ = 이 행(또는 교과)의 성취기준과 연결된 차시</p>';
    var d = $('#lesDlg'); $('.dbody', d).innerHTML = body; d.showModal();
    $('#lesQ').addEventListener('input', function (e) { var q = e.target.value.trim(); $$('.lespick label', d).forEach(function (lb) { lb.style.display = !q || lb.getAttribute('data-txt').indexOf(q) >= 0 ? '' : 'none'; }); });
  }

  /* ---------- 출력 문서 ---------- */
  function lines(t) { return esc(t || '').replace(/\n/g, '<br>'); }
  function docHtml(p) {
    var i = p.info, title = p.year + '학년도 ' + p.term + '학기 개별화교육계획';
    var subjNames = p.subjects.map(function (s) { return s.name; }).join(', ');
    var h = '<div class="docwrap"><h1>' + esc(title) + (subjNames ? ' (' + esc(subjNames) + ')' : '') + '</h1>';
    var num = 0, H2 = function (t) { num++; return '<h2>' + num + '. ' + t + '</h2>'; }, has = function (v) { return v != null && String(v).trim() !== ''; };
    var hdr = [['학교명', i.school], ['학년 반', i.gradeClass], ['이 름', i.name], ['특수학급 담임', i.specialTeacher], ['통합학급 담임', i.generalTeacher], ['계획 유형', p.type], ['적용 교육과정', p.course || COURSE_B]].filter(function (x) { return has(x[1]); });
    if (hdr.length) {
      h += '<table>';
      for (var k = 0; k < hdr.length; k += 3) h += '<tr>' + hdr.slice(k, k + 3).map(function (x) { return '<th style="width:13%">' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td>'; }).join('') + '</tr>';
      h += '</table>';
    }
    var info = [['생년월일', i.birth], ['배치형태', i.placement], ['장애유형', i.disability], ['복지카드', i.welfare], ['보호자', i.guardian], ['주 소', i.address], ['특수교육대상자<br>선정배치일', i.selectDate], ['전화번호', i.phone]];
    if (info.some(function (x, k) { return k !== 1 && has(x[1]); })) {
      info = info.filter(function (x) { return has(x[1]); });
      h += H2('인적사항') + '<table>';
      for (var q = 0; q < info.length; q += 2) h += '<tr>' + info.slice(q, q + 2).map(function (x) { return '<th style="width:16%">' + x[0] + '</th><td>' + esc(x[1]) + '</td>'; }).join('') + '</tr>';
      h += '</table>';
    }
    var team = p.team.filter(function (t) { return has(t.role) || has(t.name); });
    var mt = p.meetings.filter(function (m) { return has(m.date); });
    if (p.team.some(function (t) { return has(t.name); }) || mt.length) {
      h += H2('개별화교육지원팀') + '<table><tr><th>역할</th><th>이름</th><th style="width:22%">서명</th></tr>' + team.map(function (t) { return '<tr><td>' + esc(t.role) + '</td><td>' + esc(t.name) + '</td><td></td></tr>'; }).join('') + '</table>';
      if (mt.length) h += '<table><tr><th style="width:22%">협의회 일자</th><th>협의 내용</th></tr>' + mt.map(function (m) { return '<tr><td class="center">' + esc(m.date) + '</td><td>' + esc(m.topic) + '</td></tr>'; }).join('') + '</table>';
    }
    var sv = p.services.filter(function (x) { return has(x.org) || has(x.content) || has(x.note); });
    if (sv.length) h += H2('특수교육 관련서비스') + '<table><tr><th>제공 서비스</th><th>지원기관명</th><th>교육(지원) 내용</th><th>비고</th></tr>' + sv.map(function (x) { return '<tr><td>' + esc(x.kind) + '</td><td>' + esc(x.org) + '</td><td>' + esc(x.content) + '</td><td>' + esc(x.note) + '</td></tr>'; }).join('') + '</table>';
    var tests = p.tests.filter(function (t) { return has(t.tool) || has(t.result); });
    if (tests.length) h += H2('진단·평가 결과') + '<table><tr><th>검사도구</th><th style="width:18%">검사일자</th><th>검사결과</th></tr>' + tests.map(function (t) { return '<tr><td>' + esc(t.tool) + '</td><td class="center">' + esc(t.date) + '</td><td>' + esc(t.result) + '</td></tr>'; }).join('') + '</table>';
    var b = p.behavior || {}, pr = [];
    if (has(p.present)) pr.push(['현재 수행 수준 및<br>행동특성', lines(p.present)]);
    if (has(p.strengths)) pr.push(['강점·흥미', lines(p.strengths)]);
    if (has(p.studentNeeds)) pr.push(['학생 요구', lines(p.studentNeeds)]);
    if (has(p.parentNeeds)) pr.push(['학부모 요구사항', lines(p.parentNeeds)]);
    if (b.on && has(b.target)) pr.push(['도전행동', lines(b.target) + (b.func ? '<br><small>추정 기능: ' + esc(b.func) + '</small>' : '')]);
    var bm = b.on ? ['예방 전략|prevent', '대체행동 교수|replace', '반응 전략|respond', '위기 대응|crisis'].map(function (x) { var a2 = x.split('|'); return has(b[a2[1]]) ? '<b>' + a2[0] + '</b>: ' + lines(b[a2[1]]) : ''; }).filter(Boolean).join('<br>') : '';
    if (bm) pr.push(['도전행동 중재방안', bm]);
    if (pr.length) h += H2('현재 수행 수준' + (b.on ? ' 및 도전행동 관련 사항' : '')) + '<table>' + pr.map(function (x) { return '<tr><th style="width:20%">' + x[0] + '</th><td>' + x[1] + '</td></tr>'; }).join('') + '</table>';
    if (has(p.etc)) h += H2('기타') + '<div class="box">' + esc(p.etc) + '</div>';
    if (p.transition && p.transition.on) {
      var t = p.transition;
      h += H2('개별화전환교육계획') + '<table><tr><th style="width:22%">희망 진로</th><td>' + lines(t.hope) + '</td></tr><tr><th>현재 진로 준비 수준</th><td>' + lines(t.now) + '</td></tr><tr><th>전환 목표</th><td>' + lines(t.goal) + '</td></tr><tr><th>연계 기관·실습</th><td>' + lines(t.link) + '</td></tr><tr><th>필요한 지원</th><td>' + lines(t.support) + '</td></tr></table>';
    }
    var firstSubj = num === 0;
    p.subjects.forEach(function (s, k) {
      h += (firstSubj && k === 0 ? '' : '<div class="pb"></div>') + '<h3>' + esc(p.term) + '학기 ' + esc(s.name) + (s.life ? ' 영역' : / /.test(s.name) ? '' : '과') + ' 교육계획</h3>';
      h += '<table><tr><th>현재 학습 수행 수준</th></tr><tr><td>' + lines(s.present) + '</td></tr><tr><th>' + esc(p.term) + '학기 장기 목표</th></tr><tr><td>' + lines(s.longGoals) + '</td></tr></table>';
      if (s.stds.length) {
        h += '<table>';
        COURSES.forEach(function (crs, k) {
          var list = s.stds.filter(function (c) { var m = meta(c); return m && m.course === crs; }); if (!list.length) return;
          h += '<tr><th style="width:18%">관련 성취기준<br><small>' + esc(courseLabel(crs)) + '</small></th><td>' + list.map(function (c) { return '[' + esc(c) + '] ' + esc(STD[c]); }).join('<br>') + '</td></tr>';
        });
        h += '</table>';
      }
      if (supLines(s).length) h += '<table>' + supLines(s).map(function (x, k) { return '<tr>' + (k === 0 ? '<th rowspan="' + supLines(s).length + '" style="width:12%">지원·<br>조정</th>' : '') + '<th style="width:16%">' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</table>';
      h += '<table><tr><th rowspan="2" style="width:7%">월</th><th rowspan="2" style="width:13%">단원</th><th rowspan="2" style="width:18%">단기 교육목표</th><th rowspan="2">교육내용</th><th rowspan="2" style="width:10%">교육<br>방법</th><th colspan="2">평가계획</th></tr><tr><th style="width:17%">성취준거</th><th style="width:8%">평가결과</th></tr>' +
        (s.rows.length ? s.rows.map(function (r) { return '<tr><td class="center">' + esc(r.month) + '</td><td>' + lines(r.unit) + '</td><td>' + esc(goalFull(r)) + (r.std.length ? '<br><small>' + r.std.map(function (c) { return '[' + esc(c) + ']'; }).join(' ') + '</small>' : '') + '</td><td>' + lines(r.content) + '</td><td>' + lines(r.method) + '</td><td>' + esc(critFull(r)) + '</td><td class="center">' + esc(r.result) + '</td></tr>'; }).join('')
          : '<tr><td colspan="7" class="center">-</td></tr>') + '</table>';
    });
    h += '<div class="pb"></div><h1>' + esc(p.year) + '학년도 ' + esc(p.term) + '학기 개별화교육계획 평가</h1>';
    h += '<table><tr><th>평가 기준</th></tr><tr><td><ul><li>가: ' + p.scale.a + '% 이상 수행한 경우: 대체로 스스로 수행함</li><li>나: ' + p.scale.b + '~' + p.scale.a + '% 수행한 경우: 부분적인 도움을 필요로 함</li><li>다: ' + p.scale.b + '% 미만 수행한 경우: 전반적인 도움을 필요로 함</li><li>라: 과제 수행을 전혀 하지 못함</li></ul></td></tr></table>';
    h += '<table><tr><th colspan="2">' + esc(p.term) + '학기 개별화교육계획 평가 결과</th></tr>' + p.subjects.map(function (s) { return '<tr><th style="width:16%">' + esc(s.name) + '</th><td style="height:60pt">' + lines(s.eval) + '</td></tr>'; }).join('') +
      '<tr><th>종합<br>평가</th><td style="height:70pt">' + lines(p.evalTotal) + '</td></tr></table>';
    h += '<p><small>※ 성취기준: 기본 교육과정 — 교육부 고시 제2022-34호 [별책 3](국가교육위원회 고시 제2026-2호 일부개정 포함), 공통 교육과정 — 교육부 고시 제2022-33호 [별책 2] 초등학교 교육과정(국가교육위원회 고시 제2026-1호 일부개정 포함)·[별책 5~14] 교과별 교육과정. 성취기준·차시 연결과 자동 작성 문장은 작성 보조용 제안이며, 최종 내용은 개별화교육지원팀 협의로 정합니다.</small></p></div>';
    return h;
  }
  var pvMode = 'plan';
  function pvHtml() { return pvMode === 'progress' ? progressHtml(cur) : docHtml(cur); }
  function openPreview(mode) { if (!cur) { toast('먼저 계획을 만들어 주세요'); return; } pvMode = mode === 'progress' ? 'progress' : 'plan'; persistNow(); var d = $('#preview'); $('.dhead b', d).textContent = pvMode === 'progress' ? '보호자용 진전 안내' : '미리보기'; $('.dbody', d).innerHTML = pvHtml(); d.showModal(); }
  function persistNow() { clearTimeout(saveT); persist(); }
  function fileBase() { var p = cur, nm = (p.info.name || profLabel(p.profile) || '학생').replace(/[\\/:*?"<>|\s]+/g, '_'); return '개별화교육계획_' + p.year + '_' + p.term + '학기_' + nm; }
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function exportWord() {
    var css = 'body{font-family:"맑은 고딕","Malgun Gothic",sans-serif;font-size:10pt}table{border-collapse:collapse;width:100%;margin-bottom:6pt}th,td{border:1px solid #000;padding:3pt 5pt;vertical-align:top;font-size:10pt}th{background:#e8e8e8;text-align:center}h1{font-size:15pt;text-align:center}h2{font-size:12pt}h3{font-size:12pt;text-align:center}.center{text-align:center}.pb{page-break-before:always}small{font-size:8.5pt}';
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>' + esc(fileBase()) + '</title><style>' + css + '</style></head><body>' + pvHtml().replace(/<div class="pb"><\/div>/g, '<br style="page-break-before:always" clear="all">') + '</body></html>';
    download(fileBase() + (pvMode === 'progress' ? '_진전안내' : '') + '.doc', new Blob(['﻿' + html], { type: 'application/msword' }));
    toast('한글·Word에서 열 수 있는 파일을 저장했어요');
  }
  function profLabel(id) { var f = profiles().filter(function (x) { return x.id === id; })[0]; return f ? f.label : (id ? '' : '공용'); }

  /* ---------- 머리 영역 ---------- */
  function drawHead() {
    var ps = profiles();
    $('#profSel').innerHTML = '<option value="">공용(프로필 없음)</option>' + ps.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === curProfile ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '<option value="__new">＋ 새 학생(별명)</option>';
    var mine = store.plans.filter(function (p) { return (p.profile || '') === (curProfile || ''); });
    $('#planSel').innerHTML = mine.length ? mine.map(function (p) { return '<option value="' + p.id + '"' + (cur && cur.id === p.id ? ' selected' : '') + '>' + esc(p.year + ' ' + p.term + '학기') + '</option>'; }).join('') : '<option value="">(계획 없음)</option>';
  }
  function choosePlan(id) {
    if (cur && !cur.keepPersonal) memPersonal[cur.id] = PERSONAL.reduce(function (o, k) { o[k] = cur.info[k]; return o; }, {});
    cur = store.plans.filter(function (p) { return p.id === id; })[0] || null;
    if (cur) restorePersonal(cur);
    drawHead(); render(); save();
  }
  function pickProfile(id) {
    curProfile = id;
    var mine = store.plans.filter(function (p) { return (p.profile || '') === (id || ''); });
    choosePlan(mine.length ? mine[mine.length - 1].id : null);
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('input', function (e) {
    var t = e.target, path = t.getAttribute && t.getAttribute('data-p');
    if (t.tagName === 'TEXTAREA' && t.closest('table.edit, #s-eval')) grow(t);
    if (path && cur) {
      var mm = /^subjects\.(\d+)\.sup\./.exec(path); if (mm) supOf(cur.subjects[+mm[1]]);
      var v = t.type === 'number' ? Number(t.value) : t.value; setP(cur, path, v);
      if (PERSONAL.indexOf(path.replace('info.', '')) >= 0 && path.indexOf('info.') === 0) { memPersonal[cur.id] = memPersonal[cur.id] || {}; memPersonal[cur.id][path.slice(5)] = v; }
      save();
      if (path === 'start' || /^scale\./.test(path)) { clearTimeout(render.t); render.t = setTimeout(function () { var y = window.scrollY; render(); window.scrollTo(0, y); }, 600); }
      return;
    }
    var pk = t.getAttribute && t.getAttribute('data-pick');
    if (pk === 'q') { var si = +t.getAttribute('data-si'); $('#stdlist-' + si).innerHTML = stdListHtml(cur.subjects[si], si, t.value.trim()); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'profSel') { if (t.value === '__new') { var nm = prompt('학생 별명이나 번호를 적어 주세요 (실명 대신, 12자 이내)'); if (nm && nm.trim()) { pickProfile(addProfile(nm.trim().slice(0, 12))); } else drawHead(); } else pickProfile(t.value); return; }
    if (t.id === 'planSel') { choosePlan(t.value); return; }
    var sup = t.getAttribute('data-sup');
    if (sup) { var su = supOf(cur.subjects[+t.getAttribute('data-si')]), arr0 = su[sup] = su[sup] || [], v0 = t.getAttribute('data-val'), i0 = arr0.indexOf(v0); if (t.checked && i0 < 0) arr0.push(v0); if (!t.checked && i0 >= 0) arr0.splice(i0, 1); save(); return; }
    var sc = t.getAttribute('data-scourse'), sb = t.getAttribute('data-sband'), pb = t.getAttribute('data-pband');
    if (sc || sb) {
      var sx = cur.subjects[+t.getAttribute('data-si')], key = sc ? 'courses' : 'bands', val = sc || sb;
      var arr = (sc ? coursesOf(sx) : bandsOf(sx)).slice(), ix = arr.indexOf(val);
      if (t.checked && ix < 0) arr.push(val); if (!t.checked && ix >= 0) arr.splice(ix, 1);
      sx[key] = sc ? COURSES.filter(function (c) { return arr.indexOf(c) >= 0; }) : BAND_ORDER.filter(function (b) { return arr.indexOf(b) >= 0; });
      save(); var y4 = window.scrollY; render(); window.scrollTo(0, y4); return;
    }
    if (pb) { var pbs = (cur.bands || []).slice(), pi = pbs.indexOf(pb); if (t.checked && pi < 0) pbs.push(pb); if (!t.checked && pi >= 0) pbs.splice(pi, 1); cur.bands = BAND_ORDER.filter(function (b) { return pbs.indexOf(b) >= 0; }); save(); return; }
    if (t.id === 'keepP') { cur.keepPersonal = t.checked; persistNow(); toast(t.checked ? '인적사항을 이 기기에 저장해요' : '인적사항은 저장하지 않아요'); return; }
    if (t.id === 'importJson') { importFile(t.files[0]); t.value = ''; return; }
    var chk = t.getAttribute('data-chk'); if (chk) { setP(cur, chk, t.checked); save(); var y = window.scrollY; render(); window.scrollTo(0, y); return; }
    var code = t.getAttribute('data-std');
    if (code) { var s = cur.subjects[+t.getAttribute('data-si')]; var k = s.stds.indexOf(code); if (t.checked && k < 0) s.stds.push(code); if (!t.checked && k >= 0) s.stds.splice(k, 1); s.stds.sort(); save(); return; }
    if (t.getAttribute('data-p')) { save(); }
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var gr = b.getAttribute('data-grade');
    if (gr) { var row = cur.subjects[+b.getAttribute('data-si')].rows[+b.getAttribute('data-ri')]; row.result = row.result === gr ? '' : gr; save(); var y0 = window.scrollY; render(); window.scrollTo(0, y0); return; }
    var y = window.scrollY, rerender = function () { render(); window.scrollTo(0, y); };
    var add = b.getAttribute('data-add');
    if (add) {
      var arr = getP(cur, add);
      var tpl = /rows$/.test(add) ? newRow('') : add === 'team' ? { role: '', name: '' } : add === 'meetings' ? { date: '', topic: '' } : add === 'services' ? { kind: '', org: '', content: '', note: '' } : { tool: '', date: '', result: '' };
      arr.push(tpl); save(); rerender(); return;
    }
    var del = b.getAttribute('data-del');
    if (del) { var ks = del.split('.'), idx = +ks.pop(), a2 = getP(cur, ks.join('.')); a2.splice(idx, 1); save(); rerender(); return; }
    var act = b.getAttribute('data-act'), si = +b.getAttribute('data-si'), ri = +b.getAttribute('data-ri');
    if (act === 'addSubj') {
      var nm = $('#addSubjName').value, life = LIFE.indexOf(nm) >= 0;
      var ac2 = availCourses(nm), cs2 = planCourses(cur).filter(function (c) { return ac2.indexOf(c) >= 0; }); if (!cs2.length) cs2 = ac2.slice(0, 1);
      var ab2 = availBands(nm, cs2), bs2 = (cur.bands || []).filter(function (b) { return ab2.indexOf(b) >= 0; }); if (!bs2.length) bs2 = ab2.slice(0, 1);
      cur.subjects.push(newSubject(nm, life ? [] : cs2, life ? [] : bs2)); save(); rerender();
      if (!life && !(cur.bands || []).length) toast('학년군을 ' + bs2.join('·') + '(으)로 시작했어요. 교과 안에서 더 고를 수 있어요');
      var last = $$('.subj'); if (last.length) last[last.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (act === 'delSubj') { if (confirm(cur.subjects[si].name + ' 계획을 지울까요?')) { cur.subjects.splice(si, 1); save(); rerender(); } return; }
    if (act === 'moveSubj') { var d = +b.getAttribute('data-dir'), j = si + d; if (j >= 0 && j < cur.subjects.length) { var tmp = cur.subjects[si]; cur.subjects[si] = cur.subjects[j]; cur.subjects[j] = tmp; save(); rerender(); } return; }
    if (act === 'moveRow') { var rows = cur.subjects[si].rows; if (ri > 0) { var t2 = rows[ri]; rows[ri] = rows[ri - 1]; rows[ri - 1] = t2; save(); rerender(); } return; }
    if (act === 'autoFill') return autoFill(si);
    if (act === 'fillContent') {
      var nfc = 0;
      cur.subjects[si].rows.forEach(function (r) {
        if (String(r.content || '').replace(/[-\s]/g, '')) return;
        var c0 = r.std[0] || cur.subjects[si].stds[0];
        if (c0 && STD[c0]) { r.content = contentFor(c0); nfc++; }
        else if (r.goal) { r.content = stepsFrom(String(r.goal).replace(/할 수 있다\.?$/, '한다')).map(function (x) { return '- ' + x; }).join('\n') + '\n- 생활 속 장면에서 적용해 보기'; nfc++; }
      });
      save(); rerender(); toast(nfc ? '비어 있던 교육내용 ' + nfc + '칸을 채웠어요' : '비어 있는 교육내용이 없어요'); return;
    }
    if (act === 'presentFromRec') return presentFromRec(si);
    if (act === 'recSummary') return recSummary();
    if (act === 'fillEval') return fillEval();
    if (act === 'evalWrite') { var rr = writeEval(si); if (rr) { save(); rerender(); toast(rr.todo ? '문장을 만들었어요. 결과를 고르지 않은 목표 ' + rr.todo + '개는 [ ]로 남겼어요' : '평가 문장을 만들었어요. 학생에 맞게 다듬어 주세요'); } return; }
    if (act === 'evalWriteAll') {
      if (!cur.subjects.length) { toast('4번에서 교과·영역을 먼저 추가해 주세요'); return; }
      var filled = cur.subjects.filter(function (x) { return x.eval; }).length;
      if (filled && !confirm('이미 글이 있는 ' + filled + '개 교과도 새 문장으로 바꿀까요?')) return;
      var todo = 0; cur.subjects.forEach(function (x, i) { todo += writeEval(i, true).todo; });
      if (!cur.evalTotal) cur.evalTotal = totalText(cur);
      save(); rerender(); toast(cur.subjects.length + '개 교과 평가 문장을 만들었어요' + (todo ? ' · 결과 미선택 ' + todo + '개는 [ ]로 남김' : '')); return;
    }
    if (act === 'evalTotal') { if (cur.evalTotal && !confirm('종합 평가를 새 문장으로 바꿀까요?')) return; cur.evalTotal = totalText(cur); save(); rerender(); toast('종합 평가 초안을 만들었어요. [ ] 부분을 채워 주세요'); return; }
    if (act === 'aiOpen') return openAi(si);
    if (act === 'addCheck') return openChk(si, ri);
    if (act === 'progressReport') return openPreview('progress');
    if (act === 'saveCheck' || act === 'delCheck') {
      var rw = cur.subjects[chkTarget.si].rows[chkTarget.ri]; rw.checks = rw.checks || [];
      if (act === 'delCheck') { rw.checks.splice(+b.getAttribute('data-k'), 1); }
      else {
        var ok = $('#ckOk').value, tr = $('#ckTry').value, pc = $('#ckPct').value, pct = null, raw = '';
        if (ok !== '' && tr !== '' && +tr > 0) { pct = Math.round(+ok / +tr * 100); raw = ok + '/' + tr; } else if (pc !== '') pct = Math.max(0, Math.min(100, Math.round(+pc)));
        if (pct == null) { toast('해낸 횟수와 시도 횟수, 또는 수행률을 적어 주세요'); return; }
        rw.checks.push({ date: $('#ckDate').value || today(), pct: pct, raw: raw, note: $('#ckNote').value.trim() });
        rw.checks.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
        toast('점검 기록을 남겼어요 (' + pct + '%)');
      }
      save(); openChk(chkTarget.si, chkTarget.ri); var y5 = window.scrollY; render(); window.scrollTo(0, y5); return;
    }
    if (act === 'pickLes') return openLesDlg(si, ri);
    if (act === 'exportJson') { persistNow(); download(fileBase() + '.json', new Blob([JSON.stringify({ app: 'oks-iep', v: 1, plan: cur }, null, 1)], { type: 'application/json' })); toast('백업 파일을 저장했어요(인적사항 포함 — 보관에 주의)'); return; }
    if (act === 'copyPlan') {
      var c = JSON.parse(JSON.stringify(cur)); c.id = uid(); c.created = new Date().toISOString();
      if (c.term === '1') c.term = '2'; else { c.term = '1'; c.year = String(+c.year + 1); }
      c.start = c.term === '1' ? c.year + '-03-02' : c.year + '-08-17';
      c.subjects.forEach(function (s) { s.present = s.eval ? '[지난 학기 평가]\n' + s.eval : s.present; s.eval = ''; s.rows.forEach(function (r) { r.result = ''; r.memo = ''; r.month = ''; }); });
      c.evalTotal = ''; store.plans.push(c); if (!cur.keepPersonal) memPersonal[c.id] = memPersonal[cur.id]; choosePlan(c.id); toast(c.year + '학년도 ' + c.term + '학기 계획으로 복사했어요'); return;
    }
    if (act === 'delPlan') { if (confirm('이 계획을 이 기기에서 지울까요? 되돌릴 수 없어요.')) { store.plans = store.plans.filter(function (p) { return p.id !== cur.id; }); persistNow(); pickProfile(curProfile); } return; }
  });
  function importFile(f) {
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result), p = d && d.plan; if (!p || !p.subjects) throw 0;
        p.id = uid(); p.profile = curProfile; store.plans.push(p); memPersonal[p.id] = PERSONAL.reduce(function (o, k) { o[k] = (p.info || {})[k]; return o; }, {});
        choosePlan(p.id); toast('계획을 불러왔어요');
      } catch (e) { toast('개별화교육계획 백업 파일이 아니에요'); }
    };
    rd.readAsText(f);
  }
  $('#newPlan').onclick = function () { var p = newPlan(curProfile); store.plans.push(p); choosePlan(p.id); toast('새 계획을 만들었어요'); };
  $('#prevBtn').onclick = function () { openPreview('plan'); };
  $('#pClose').onclick = function () { $('#preview').close(); };
  $('#pPrint').onclick = function () { $('#doc').innerHTML = pvHtml(); $('#preview').close(); setTimeout(function () { window.print(); }, 50); };
  $('#pWord').onclick = exportWord;
  $('#lesClose').onclick = function () { $('#lesDlg').close(); };
  $('#aiClose').onclick = function () { $('#aiDlg').close(); };
  $('#chkClose').onclick = function () { $('#chkDlg').close(); };
  $('#aiApply').onclick = applyAi;
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#aiCopy')) return;
    var ta = $('#aiPrompt'), done = function () { toast('요청문을 복사했어요. AI 대화창에 붙여 넣으세요'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); document.execCommand('copy'); done(); });
    else { ta.select(); document.execCommand('copy'); done(); }
  });
  $('#lesOk').onclick = function () {
    var r = cur.subjects[lesTarget.si].rows[lesTarget.ri];
    r.lessons = $$('#lesDlg .lespick input:checked').map(function (x) { return x.value; });
    r.lessons.forEach(function (id) { var l = lessonById(id); if (l && !r.unit) r.unit = l.unit + '\n(' + l.schoolName + ' ' + l.no + ' ' + l.topic + ')'; });
    $('#lesDlg').close(); save(); var y = window.scrollY; render(); window.scrollTo(0, y);
  };
  window.addEventListener('beforeprint', function () { if (cur && !$('#doc').innerHTML) $('#doc').innerHTML = docHtml(cur); });
  window.addEventListener('afterprint', function () { $('#doc').innerHTML = ''; });

  /* 시작 */
  var last = jget('oks_iep_last', {});
  drawHead();
  var start = store.plans.filter(function (p) { return p.id === last.plan; })[0];
  if (start) { curProfile = start.profile || ''; choosePlan(start.id); } else pickProfile(curProfile);
  window.OKS_IEP = { toGoal: toGoal, toQuestion: toQuestion, docHtml: function () { return cur && docHtml(cur); } };
})();
