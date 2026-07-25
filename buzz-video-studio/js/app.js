import { load, save, defaultProject, loadApiKey, saveApiKey, download } from './store.js';
import { scoreTopic, SOURCE_LABELS, SATURATION_LABELS } from './topic-score.js';
import { STRUCTURES, buildScriptPrompt, parseScriptResponse, draftScript, callGemini } from './script-gen.js';
import { analyzeAiNess } from './ai-ness.js';
import { buildTimeline, toASS, toSRT, validateTelop, TELOP_PRESETS, ALIGN, SAFE } from './telop.js';
import { buildFfmpegCommand, buildSegmentScript, buildShotList, buildTtsHints } from './ffmpeg.js';
import { computeKpi, compareHitsAndMisses, YPP_SHORTS } from './kpi.js';
import { totalDurationSec, estimateDurationSec, fmtSec } from './mora.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let project = load();
let apiKey = loadApiKey();
let selectedBeat = 0;

/* ---------- state helpers ---------- */
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const setPath = (obj, path, val) => {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
  target[last] = val;
};

let saveTimer = null;
function persist() {
  $('#saveState').textContent = '保存中…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    save(project);
    $('#saveState').textContent = '保存済み';
  }, 250);
}

function bind(id, path, { type = 'text', on = () => {} } = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur = getPath(project, path);
  if (type === 'checkbox') el.checked = !!cur;
  else el.value = cur ?? '';
  el.addEventListener('input', () => {
    let v = type === 'checkbox' ? el.checked : el.value;
    if (type === 'number') v = el.value === '' ? '' : Number(el.value);
    setPath(project, path, v);
    persist();
    on(v);
  });
  if (type === 'checkbox' || el.tagName === 'SELECT') {
    el.addEventListener('change', () => {
      const v = type === 'checkbox' ? el.checked : el.value;
      setPath(project, path, v);
      persist();
      on(v);
    });
  }
}

function fillSelect(id, entries, value) {
  const el = document.getElementById(id);
  el.innerHTML = entries.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
  el.value = value;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('ja-JP');

/* ---------- steps ---------- */
$$('.step').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.step').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.pane').forEach((p) => p.classList.toggle('active', p.id === `pane-${btn.dataset.step}`));
    refreshAll();
  });
});

/* ---------- 1. ネタ ---------- */
fillSelect('t_sourceType', Object.entries(SOURCE_LABELS), project.topic.sourceType);
fillSelect('t_saturation', Object.entries(SATURATION_LABELS), project.topic.saturation);

bind('projectName', 'name');
[
  ['t_genre', 'topic.genre'], ['t_topicGenre', 'topic.topicGenre'], ['t_subject', 'topic.subject'],
  ['t_sourceType', 'topic.sourceType'], ['t_referenceUrl', 'topic.referenceUrl'],
  ['t_hook', 'topic.hook'], ['t_whyNow', 'topic.whyNow'], ['t_footage', 'topic.footage'],
  ['t_saturation', 'topic.saturation'],
].forEach(([id, p]) => bind(id, p, { on: renderTopicScore }));
bind('t_referenceViews', 'topic.referenceViews', { type: 'number', on: renderTopicScore });
bind('t_referenceDaysAgo', 'topic.referenceDaysAgo', { type: 'number', on: renderTopicScore });
bind('t_rights', 'topic.rights', { type: 'checkbox' });

function renderTopicScore() {
  const r = scoreTopic(project.topic);
  $('#scoreTotal').textContent = r.total;
  const v = $('#scoreVerdict');
  v.textContent = r.verdict;
  v.className = `verdict ${r.level}`;
  $('#scoreBreakdown').innerHTML = r.breakdown
    .map((b) => {
      const pct = Math.round((b.score / b.max) * 100);
      const cls = pct >= 75 ? 'go' : pct >= 40 ? 'warn' : 'stop';
      return `<div class="bd-item">
        <div class="lbl">${esc(b.label)}</div>
        <div class="bar"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
        <div class="val">${b.score}/${b.max}</div>
        <div class="note">${esc(b.note)}</div>
      </div>`;
    })
    .join('');
}

/* ---------- 2. 台本 ---------- */
fillSelect('s_structure', Object.entries(STRUCTURES).map(([k, s]) => [k, s.name]), project.structure);
bind('s_structure', 'structure', { on: () => { renderStructureDesc(); } });
bind('s_targetSec', 'targetSec', { type: 'number', on: refreshDerived });
bind('s_moraPerSec', 'moraPerSec', { type: 'number', on: refreshDerived });
bind('s_title', 'script.title');
bind('s_description', 'script.description');

$('#s_hashtags').addEventListener('input', (e) => {
  ensureScript();
  project.script.hashtags = e.target.value.split(/\s+/).filter(Boolean);
  persist();
});

function renderStructureDesc() {
  const s = STRUCTURES[project.structure] || STRUCTURES.clip;
  $('#structureDesc').textContent = `${s.desc}／${s.beats.join(' → ')}`;
}

function ensureScript() {
  if (!project.script) project.script = { title: '', beats: [], description: '', hashtags: [] };
  if (!Array.isArray(project.script.beats)) project.script.beats = [];
  return project.script;
}

function renderScriptMeta() {
  const s = ensureScript();
  $('#s_title').value = s.title || '';
  $('#s_description').value = s.description || '';
  $('#s_hashtags').value = (s.hashtags || []).join(' ');
}

function renderBeats() {
  const beats = ensureScript().beats;
  const list = $('#beatList');
  if (!beats.length) {
    list.innerHTML = '<p class="hint">まだ台本がありません。「AIに台本を書かせる」か「テンプレで下書き」から始めてください。</p>';
    return;
  }
  list.innerHTML = beats
    .map(
      (b, i) => `<div class="beat" data-i="${i}">
      <div class="beat-head">
        <input class="role" data-f="role" value="${esc(b.role)}" style="max-width:180px" />
        <span class="dur" data-dur></span>
        <button class="ghost sm" data-del="${i}">削除</button>
      </div>
      <label class="full">ナレーション<textarea data-f="narration" rows="2">${esc(b.narration)}</textarea></label>
      <label>テロップ（画面に出す文字）<input data-f="telop" value="${esc(b.telop)}" /></label>
      <label>強調する1語<input data-f="emphasis" value="${esc(b.emphasis)}" /></label>
      <label class="full">映像指示<input data-f="broll" value="${esc(b.broll)}" /></label>
    </div>`
    )
    .join('');

  $$('.beat', list).forEach((el) => {
    const i = Number(el.dataset.i);
    el.addEventListener('click', () => selectBeat(i));
    $$('[data-f]', el).forEach((input) => {
      input.addEventListener('input', () => {
        beats[i][input.dataset.f] = input.value;
        persist();
        refreshDerived();
      });
    });
  });
  $$('[data-del]', list).forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      beats.splice(Number(btn.dataset.del), 1);
      persist();
      renderBeats();
      refreshDerived();
    })
  );
  selectBeat(Math.min(selectedBeat, beats.length - 1));
}

function selectBeat(i) {
  selectedBeat = Math.max(0, i);
  $$('.beat').forEach((el) => el.classList.toggle('selected', Number(el.dataset.i) === selectedBeat));
  const timed = timeline();
  if (timed[selectedBeat]) {
    playhead = timed[selectedBeat].start + 0.01;
    renderPreview();
  }
}

$('#btnAddBeat').addEventListener('click', () => {
  ensureScript().beats.push({ role: 'カット', narration: '', telop: '', emphasis: '', broll: '' });
  persist();
  renderBeats();
  refreshDerived();
});

$('#btnDraft').addEventListener('click', () => {
  project.script = draftScript(project.topic, { structure: project.structure });
  persist();
  renderScriptMeta();
  renderBeats();
  refreshDerived();
  status('テンプレートで下書きしました。ナレーションを自分の言葉に直すほど伸びます。', 'ok');
});

$('#btnCopyPrompt').addEventListener('click', async () => {
  const p = buildScriptPrompt(project.topic, { structure: project.structure, targetSec: project.targetSec });
  await copy(p);
  status('プロンプトをコピーしました。Claude / ChatGPT にそのまま貼れます。', 'ok');
});

$('#btnGenerate').addEventListener('click', async () => {
  if (!apiKey) {
    status('Gemini APIキーが未設定です。右上の「API設定」から登録するか、「プロンプトをコピー」で手動生成してください。', 'err');
    return;
  }
  const btn = $('#btnGenerate');
  btn.disabled = true;
  status('生成中…');
  try {
    const prompt = buildScriptPrompt(project.topic, { structure: project.structure, targetSec: project.targetSec });
    const text = await callGemini(apiKey, prompt, project.model || 'gemini-2.5-flash');
    project.script = parseScriptResponse(text);
    persist();
    renderScriptMeta();
    renderBeats();
    refreshDerived();
    status('生成しました。AIっぽさ診断を見て、赤い箇所だけ直してください。', 'ok');
  } catch (e) {
    status(`生成に失敗: ${e.message}`, 'err');
  } finally {
    btn.disabled = false;
  }
});

function status(msg, cls = '') {
  const el = $('#genStatus');
  el.textContent = msg;
  el.className = `status ${cls}`;
}

function renderAiNess() {
  const text = ensureScript().beats.map((b) => b.narration).join('\n');
  const r = analyzeAiNess(text);
  $('#aiScore').textContent = r.score;
  const v = $('#aiVerdict');
  const map = { human: ['go', '人間が書いた台本に見える。'], mixed: ['warn', 'AI感が残っている。指摘を2つ直すと変わる。'], ai: ['stop', 'このままだと「AIですよね？」と言われる。'] };
  const [cls, msg] = map[r.level];
  v.textContent = `${msg}（文${r.stats.sentences} / 平均${r.stats.meanLen}字 / ばらつき${r.stats.sd}）`;
  v.className = `verdict ${cls}`;
  $('#aiSignals').innerHTML = r.signals.map((s) => `<span class="chip ${s.ok ? 'ok' : 'ng'}">${s.ok ? '✓' : '×'} ${esc(s.label)}</span>`).join('');
  $('#aiFindings').innerHTML = r.findings.length
    ? r.findings.map((f) => `<div class="finding"><span class="ph">${esc(f.phrase)}</span> ×${f.count} — ${esc(f.msg)}<div class="fix">→ ${esc(f.fix)}</div></div>`).join('')
    : '<div class="finding none">指摘なし。</div>';
}

/* ---------- 3. テロップ ---------- */
fillSelect('p_preset', Object.entries(TELOP_PRESETS).map(([k, p]) => [k, p.name]), project.presetKey);
fillSelect('p_align', [[String(ALIGN.top), '上寄せ'], [String(ALIGN.middle), '中央'], [String(ALIGN.bottom), '下寄せ']], String(project.style.align));

$('#p_preset').addEventListener('change', (e) => {
  project.presetKey = e.target.value;
  project.style = { ...TELOP_PRESETS[e.target.value] };
  persist();
  syncStyleInputs();
  refreshDerived();
});

const STYLE_FIELDS = [
  ['p_fontName', 'style.fontName', 'text'],
  ['p_fontSize', 'style.fontSize', 'number'],
  ['p_outlineWidth', 'style.outlineWidth', 'number'],
  ['p_primary', 'style.primary', 'text'],
  ['p_outlineColor', 'style.outlineColor', 'text'],
  ['p_highlight', 'style.highlight', 'text'],
  ['p_marginV', 'style.marginV', 'number'],
  ['p_maxChars', 'style.maxChars', 'number'],
];
STYLE_FIELDS.forEach(([id, path, type]) => bind(id, path, { type, on: refreshDerived }));
bind('p_bold', 'style.bold', { type: 'checkbox', on: refreshDerived });
$('#p_align').addEventListener('change', (e) => {
  project.style.align = Number(e.target.value);
  persist();
  refreshDerived();
});

function syncStyleInputs() {
  STYLE_FIELDS.forEach(([id, path]) => { $(`#${id}`).value = getPath(project, path) ?? ''; });
  $('#p_bold').checked = !!project.style.bold;
  $('#p_align').value = String(project.style.align);
}

function renderTelopPane() {
  const timed = timeline();
  const warnings = validateTelop(timed, project.style);
  $('#telopWarnings').innerHTML = warnings.length
    ? warnings.map((w) => `<div class="finding ${w.level === 'error' ? 'error' : ''}">${esc(w.msg)}</div>`).join('')
    : '<div class="finding none">問題なし。この設定のまま焼き込めます。</div>';
  $('#assPreview').textContent = timed.length ? toASS(timed, project.style) : '(台本がありません)';
}

$('#btnExportAss').addEventListener('click', () => download('telop.ass', toASS(timeline(), project.style)));
$('#btnExportSrt').addEventListener('click', () => download('subtitle.srt', toSRT(timeline())));
$('#btnCopyAss').addEventListener('click', async () => { await copy(toASS(timeline(), project.style)); });

/* ---------- 4. 編集 ---------- */
['r_broll:render.broll', 'r_voice:render.voice', 'r_bgm:render.bgm', 'r_out:render.out'].forEach((s) => {
  const [id, path] = s.split(':');
  bind(id, path, { on: renderEditPane });
});
bind('r_fps', 'render.fps', { type: 'number', on: renderEditPane });
bind('r_bgmGain', 'render.bgmGain', { type: 'number', on: renderEditPane });
bind('e_voiceMode', 'voiceMode', { on: renderEditPane });

const VOICE_HINTS = {
  ai: 'AI音声だけで通すと、どうしても同じ空気になる。せめて速度と間だけは動画ごとに変える。',
  self: '肉声にすると印象が最も変わる。噛んでも良い。切り抜きの合間に3秒入れるだけでも効く。',
  mix: '推奨。冒頭2秒のフックだけ肉声、本編はAI音声。作業時間はほぼ変わらない。',
};

function renderEditPane() {
  const timed = timeline();
  const duration = timed.length ? timed[timed.length - 1].end : project.targetSec;
  const opts = { ...project.render, duration };
  $('#cmdOne').textContent = buildFfmpegCommand(opts);
  $('#cmdSeg').textContent = timed.length ? buildSegmentScript(timed, opts) : '(台本がありません)';
  $('#shotList').textContent = timed.length ? buildShotList(timed) : '(台本がありません)';
  $('#ttsHints').textContent = buildTtsHints(ensureScript().beats.map((b) => b.narration).join(' '));
  $('#voiceHint').textContent = VOICE_HINTS[project.voiceMode] || '';
}

$('#btnExportSh').addEventListener('click', () => {
  const timed = timeline();
  const duration = timed.length ? timed[timed.length - 1].end : project.targetSec;
  download('render.sh', buildSegmentScript(timed, { ...project.render, duration }), 'text/x-shellscript');
});

/* ---------- 5. 運用 ---------- */
const CHECKS = [
  ['noGimmick', 'AIっぽさ消しの小細工に逃げていない', '手書きイラストに喋らせる等は、AI感より先に「安っぽさ」が出る'],
  ['noFullSub', 'ナレーション全文を字幕にしていない', '読ませたい所だけに絞ると視線が残る'],
  ['humanVoice', '読み上げがAI音声だけになっていない', 'フックの2秒だけでも肉声にする'],
  ['sameGenre', '既存動画と同じジャンルとして認識される内容', '別ジャンル判定でおすすめが止まる'],
  ['noIntro', '冒頭2秒に挨拶・前置きがない', '「こんにちは」で全部終わる'],
  ['refWatched', '伸びている参照動画を1本以上見た', 'AIには「今伸びているもの」が分からない'],
  ['rights', '素材の権利・引用の範囲を確認した', '切り抜きは特に'],
  ['reproducible', '当たった型を次も再現できる状態', '1本のバズより、型の複製'],
  ['titleConcrete', 'タイトルに数字か固有名詞が入っている', '抽象語だけのタイトルはクリックされない'],
  ['fixedTime', '投稿時間を固定した', '毎日1本・同じ時間'],
];

function renderChecklist() {
  $('#checklist').innerHTML = CHECKS.map(
    ([k, label, note]) =>
      `<label><input type="checkbox" data-check="${k}" ${project.checks[k] ? 'checked' : ''} /><div>${esc(label)}<span>${esc(note)}</span></div></label>`
  ).join('');
  $$('[data-check]').forEach((el) =>
    el.addEventListener('change', () => {
      project.checks[el.dataset.check] = el.checked;
      persist();
    })
  );
}

bind('o_subs', 'subs', { type: 'number', on: renderKpi });

function renderPosts() {
  const rows = project.posts;
  $('#postRows').innerHTML = rows
    .map(
      (p, i) => `<tr data-i="${i}">
      <td><input type="date" data-p="date" value="${esc(p.date || '')}" /></td>
      <td><input data-p="title" value="${esc(p.title || '')}" /></td>
      <td><input type="number" min="0" data-p="views" value="${esc(p.views ?? '')}" /></td>
      <td><select data-p="source">${Object.entries(SOURCE_LABELS).map(([k, v]) => `<option value="${k}" ${p.source === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td><button class="ghost sm" data-delp="${i}">×</button></td>
    </tr>`
    )
    .join('');
  $$('#postRows [data-p]').forEach((el) =>
    el.addEventListener('input', () => {
      const i = Number(el.closest('tr').dataset.i);
      const f = el.dataset.p;
      project.posts[i][f] = f === 'views' ? Number(el.value) || 0 : el.value;
      persist();
      renderKpi();
    })
  );
  $$('#postRows [data-delp]').forEach((btn) =>
    btn.addEventListener('click', () => {
      project.posts.splice(Number(btn.dataset.delp), 1);
      persist();
      renderPosts();
      renderKpi();
    })
  );
}

$('#btnAddPost').addEventListener('click', () => {
  project.posts.push({ date: new Date().toISOString().slice(0, 10), title: project.script?.title || '', views: 0, source: project.topic.sourceType });
  persist();
  renderPosts();
  renderKpi();
});

function renderKpi() {
  const k = computeKpi(project.posts, { subs: project.subs });
  $('#kpiGrid').innerHTML = [
    ['90日間の再生数', `${num(k.windowViews)}<small> / ${num(k.targetViews)}</small>`],
    ['1日あたり', `${num(k.perDay)}<small> 必要 ${num(k.requiredPerDay)}</small>`],
    ['このペースの着地', num(k.projected)],
    ['投稿本数', `${k.posted}<small> / ${k.elapsed}日</small>`],
    ['平均再生', num(k.avgViews)],
    ['中央値', num(k.median)],
    ['1本あたり必要', k.requiredPerVideo == null ? '—' : num(k.requiredPerVideo)],
    ['登録者', `${num(k.subs)}<small> / ${num(k.targetSubs)}</small>`],
  ]
    .map(([kk, v]) => `<div class="kpi"><div class="k">${kk}</div><div class="v">${v}</div></div>`)
    .join('');
  const bar = $('#kpiBar');
  bar.style.width = `${Math.round(k.progress * 100)}%`;
  bar.className = `bar-fill ${k.level}`;
  const v = $('#kpiVerdict');
  v.textContent = `${k.verdict}（10万再生1本では${Math.round((100000 / YPP_SHORTS.targetViews) * 1000) / 10}%）`;
  v.className = `verdict ${k.level}`;

  const hm = compareHitsAndMisses(project.posts);
  $('#hitMiss').innerHTML = hm
    ? `当たり平均 <b>${num(hm.hitAvg)}</b> / 外れ平均 <b>${num(hm.missAvg)}</b>${hm.ratio ? `（${hm.ratio}倍）` : ''}<br>
       伸びた: ${hm.hits.map((p) => esc(p.title || '(無題)')).join('、')}<br>
       伸びなかった: ${hm.misses.map((p) => esc(p.title || '(無題)')).join('、')}<br>
       この2群の違いが「ネタの選び方」。次はこの差だけを複製する。`
    : '投稿を3本以上記録すると、当たり／外れの差分を出します。';
}

$('#btnExportJson').addEventListener('click', () => download(`${project.name || 'project'}.json`, JSON.stringify(project, null, 2), 'application/json'));
$('#btnImportJson').addEventListener('click', () => $('#fileImport').click());
$('#fileImport').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    project = { ...defaultProject(), ...JSON.parse(await file.text()) };
    save(project);
    location.reload();
  } catch (err) {
    alert(`読み込めませんでした: ${err.message}`);
  }
});

/* ---------- プレビュー ---------- */
let playhead = 0;
let playing = false;
let rafId = null;
let lastTs = 0;

function timeline() {
  return buildTimeline(ensureScript().beats, project.moraPerSec);
}

$('#showSafe').addEventListener('change', (e) => {
  $('#stage').classList.toggle('show-safe', e.target.checked);
});

$('#btnPlay').addEventListener('click', () => {
  playing = !playing;
  $('#btnPlay').textContent = playing ? '❚❚' : '▶';
  lastTs = 0;
  if (playing) rafId = requestAnimationFrame(tick);
  else cancelAnimationFrame(rafId);
});

$('#seek').addEventListener('input', (e) => {
  const timed = timeline();
  const total = timed.length ? timed[timed.length - 1].end : 1;
  playhead = (Number(e.target.value) / 100) * total;
  renderPreview();
});

function tick(ts) {
  if (!playing) return;
  if (!lastTs) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  const timed = timeline();
  const total = timed.length ? timed[timed.length - 1].end : 0;
  playhead += dt;
  if (playhead > total) playhead = 0;
  renderPreview();
  rafId = requestAnimationFrame(tick);
}

function renderPreview() {
  const timed = timeline();
  const total = timed.length ? timed[timed.length - 1].end : 0;
  const cur = timed.find((t) => playhead >= t.start && playhead < t.end) || timed[0];
  const st = project.style;

  $('#seek').value = total ? String(Math.min(100, (playhead / total) * 100)) : '0';
  $('#seekLabel').textContent = `${fmtSec(playhead)} / ${fmtSec(total)}`;

  const layer = $('#telopLayer');
  const span = $('#telopText');
  layer.style.top = layer.style.bottom = 'auto';
  layer.style.transform = 'none';
  if (st.align === ALIGN.top) layer.style.top = `${st.marginV}px`;
  else if (st.align === ALIGN.bottom) layer.style.bottom = `${st.marginV}px`;
  else { layer.style.top = '50%'; layer.style.transform = 'translateY(-50%)'; }

  span.style.fontSize = `${st.fontSize}px`;
  span.style.fontWeight = st.bold ? '900' : '500';
  span.style.color = st.primary;
  span.style.fontFamily = `"${st.fontName}", "Hiragino Sans", sans-serif`;
  span.style.webkitTextStroke = `${st.outlineWidth}px ${st.outlineColor}`;
  span.style.paintOrder = 'stroke fill';
  span.style.lineHeight = '1.25';

  const telop = cur?.telop || '';
  span.innerHTML = cur && telop
    ? (cur.emphasis && telop.includes(cur.emphasis)
        ? esc(telop).replace(esc(cur.emphasis), `<em style="color:${esc(st.highlight)};font-size:1.15em">${esc(cur.emphasis)}</em>`)
        : esc(telop))
    : '';

  $('#stageBg').dataset.label = cur?.broll || '映像素材';
  $('#ytTitle').textContent = ensureScript().title || '';
  $('#beatMeta').innerHTML = cur
    ? `<b>#${cur.index + 1} ${esc(cur.role)}</b>　${cur.start.toFixed(1)}s〜${cur.end.toFixed(1)}s（${cur.duration.toFixed(1)}s）<br>${esc(cur.narration)}`
    : '台本がまだありません。';
}

/* ---------- 共通 ---------- */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

$$('[data-copy]').forEach((btn) =>
  btn.addEventListener('click', async () => {
    await copy($(btn.dataset.copy).textContent);
    btn.textContent = 'コピー済み';
    setTimeout(() => (btn.textContent = 'コピー'), 1200);
  })
);

/* 設定ダイアログ */
$('#btnSettings').addEventListener('click', () => {
  $('#apiKeyInput').value = apiKey;
  $('#modelInput').value = project.model || 'gemini-2.5-flash';
  $('#settingsDialog').showModal();
});
$('#btnSaveKey').addEventListener('click', () => {
  apiKey = $('#apiKeyInput').value.trim();
  saveApiKey(apiKey);
  project.model = $('#modelInput').value.trim() || 'gemini-2.5-flash';
  persist();
});

function renderTiming() {
  const beats = ensureScript().beats;
  const total = totalDurationSec(beats, project.moraPerSec);
  const target = Number(project.targetSec) || 40;
  const over = total > target * 1.15;
  const under = beats.length > 0 && total < target * 0.7;
  const hookDur = beats[0] ? estimateDurationSec(beats[0].narration, project.moraPerSec) : 0;
  $('#timingInfo').innerHTML =
    `<span class="${over || under ? 'over' : ''}">合計 ${total.toFixed(1)}秒 / 目標 ${target}秒</span>` +
    (over ? '<span class="over">（削る）</span>' : under ? '<span class="over">（尺が足りない。カットを足す）</span>' : '') +
    `　フック ${hookDur.toFixed(1)}秒` +
    (hookDur > 2.5 ? '<span class="over">（長い。2秒以内に）</span>' : '');
  $$('.beat').forEach((el) => {
    const i = Number(el.dataset.i);
    const d = estimateDurationSec(beats[i]?.narration || '', project.moraPerSec);
    const durEl = $('[data-dur]', el);
    if (durEl) durEl.textContent = `${d.toFixed(1)}秒`;
    const telopInput = $('[data-f="telop"]', el);
    if (telopInput) telopInput.classList.toggle('over', (beats[i]?.telop || '').replace(/\s/g, '').length > (project.style.maxChars || 13));
  });
}

function refreshDerived() {
  renderTiming();
  renderAiNess();
  renderTelopPane();
  renderEditPane();
  renderPreview();
}

function refreshAll() {
  renderTopicScore();
  renderStructureDesc();
  renderScriptMeta();
  renderChecklist();
  renderPosts();
  renderKpi();
  refreshDerived();
}

/* 初期化 */
syncStyleInputs();
$('#stage').classList.add('show-safe');
renderBeats();
refreshAll();
