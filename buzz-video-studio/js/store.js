// 保存はすべて端末のlocalStorageのみ。APIキーを含め、どこにも送信しない。

import { TELOP_PRESETS } from './telop.js';

const KEY = 'bvs.project.v1';
const KEY_API = 'bvs.apikey.v1';

export function defaultProject() {
  return {
    name: '無題のチャンネル',
    topic: {
      genre: '',
      topicGenre: '',
      subject: '',
      sourceType: 'clip',
      referenceUrl: '',
      referenceViews: '',
      referenceDaysAgo: '',
      hook: '',
      whyNow: '',
      footage: '',
      saturation: 'mid',
      rights: false,
    },
    structure: 'clip',
    targetSec: 40,
    moraPerSec: 8.5,
    voiceMode: 'ai',
    script: null,
    presetKey: 'punch',
    style: { ...TELOP_PRESETS.punch },
    render: { broll: 'broll.mp4', voice: 'voice.wav', bgm: 'bgm.mp3', ass: 'telop.ass', out: 'short.mp4', fps: 30, bgmGain: 0.1, crf: 18 },
    checks: {},
    posts: [],
    subs: 0,
    model: 'gemini-2.5-flash',
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProject();
    const parsed = JSON.parse(raw);
    return { ...defaultProject(), ...parsed, topic: { ...defaultProject().topic, ...(parsed.topic || {}) } };
  } catch {
    return defaultProject();
  }
}

export function save(project) {
  try {
    localStorage.setItem(KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

export function loadApiKey() {
  try { return localStorage.getItem(KEY_API) || ''; } catch { return ''; }
}

export function saveApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_API, key);
    else localStorage.removeItem(KEY_API);
  } catch { /* ignore */ }
}

export function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
