/* 余小渔 · 应用主程序 */
(function () {
  'use strict';

  const LS_KEY = 'yuxiaoyu.v1';
  const $ = (s) => document.querySelector(s);

  const els = {
    log: $('#log'), input: $('#input'), send: $('#btnSend'), status: $('#status'),
    sheet: $('#sheet'), more: $('#btnMore'), closeSheet: $('#closeSheet'),
    panel: $('#stickerPanel'), grid: $('#stickerGrid'), btnSticker: $('#btnSticker'), btnPic: $('#btnPic'),
    closeSticker: $('#closeSticker'), toast: $('#toast'),
    segProactive: $('#segProactive'), proactiveHint: $('#proactiveHint'),
    optSticker: $('#optSticker'), endpoint: $('#endpoint'), apiKey: $('#apiKey'), facts: $('#facts'),
    stickerPick: $('#stickerPick'),
    stats: $('#stats'), filePick: $('#filePick'), importPick: $('#importPick'),
    btnExport: $('#btnExport'), btnImport: $('#btnImport'), btnReset: $('#btnReset')
  };

  /* ---------------- 存储 ---------------- */
  let state = load();

  function defaults() {
    const now = Date.now();
    return {
      v: 1,
      msgs: [],
      mood: Core.initialMood(now),
      facts: { 称呼: '云烟' },
      summary: { text: '刚认识，还没聊太多', topics: [], at: now },
      custom: [],
      life: null,
      settings: { proactive: 'mid', quiet: [2, 7], stickers: true, endpoint: '', apiKey: '', lastProactive: 0 },
      createdAt: now
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaults();
      const s = JSON.parse(raw);
      const d = defaults();
      s.settings = Object.assign(d.settings, s.settings || {});
      s.mood = Object.assign(Core.initialMood(), s.mood || {});
      s.facts = Object.assign({ 称呼: '云烟' }, s.facts || {});
      s.summary = Object.assign(d.summary, s.summary || {});
      s.msgs = Array.isArray(s.msgs) ? s.msgs : [];
      s.custom = Array.isArray(s.custom) ? s.custom : [];
      return s;
    } catch (e) { return defaults(); }
  }
  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { toast('存不下了，去设置里导出备份'); }
    }, 120);
  }

  /* ---------------- 图片存储 ---------------- */
  const IDB = (function () {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('yuxiaoyu-media', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('m');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return dbp;
    }
    return {
      async put(k, v) { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('m', 'readwrite'); t.objectStore('m').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
      async get(k) { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('m', 'readonly'); const q = t.objectStore('m').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
      async clear() { const db = await open(); return new Promise((res) => { const t = db.transaction('m', 'readwrite'); t.objectStore('m').clear(); t.oncomplete = res; }); },
      async del(k) { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('m', 'readwrite'); t.objectStore('m').delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
    };
  })();
  const imgCache = new Map();

  /* ---------------- 渲染 ---------------- */
  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function timeDivider(t) {
    const d = el('div', 'time', Core.stamp(t));
    d.dataset.t = t;
    return d;
  }

  function shouldDivider(prevT, t) {
    return !prevT || t - prevT > 10 * 60 * 1000;
  }

  async function renderMsg(m) {
    const wrap = el('div', 'msg ' + (m.who === 'me' ? 'me' : 'her'));
    let body;
    if (m.kind === 'image') {
      const img = el('img', 'pic');
      let src = imgCache.get(m.src);
      if (!src) { src = await IDB.get(m.src); if (src) imgCache.set(m.src, src); }
      img.src = src || '';
      img.onload = scrollBottom;
      body = img;
    } else if (m.kind === 'sticker') {
      const img = el('img', 'sticker');
      if (String(m.src).startsWith('cs_')) {
        let src = imgCache.get(m.src);
        if (!src) { src = await IDB.get(m.src); if (src) imgCache.set(m.src, src); }
        img.src = src || '';
      } else {
        const s = STICKERS.find((x) => x.id === m.src);
        img.src = s ? s.file : 'stickers/01_happy.png';
        img.alt = s ? s.label : '';
      }
      body = img;
    } else {
      body = el('div', 'bubble', m.text);
    }
    if (m.who === 'her') {
      const a = el('img', 'av'); a.src = 'assets/avatar-192.png'; a.alt = '';
      wrap.appendChild(a);
      wrap.appendChild(body);
    } else {
      wrap.appendChild(body);
      const mine = el('img', 'av');
      mine.src = 'assets/me.jpg';
      mine.alt = '';
      mine.onerror = () => { if (mine.parentNode) mine.replaceWith(el('div', 'av', '云')); };
      wrap.appendChild(mine);
    }
    return wrap;
  }

  async function renderAll() {
    els.log.innerHTML = '';
    let prevT = 0;
    const list = state.msgs.slice(-400);
    for (const m of list) {
      if (shouldDivider(prevT, m.t)) els.log.appendChild(timeDivider(m.t));
      els.log.appendChild(await renderMsg(m));
      prevT = m.t;
    }
    scrollBottom();
  }

  function scrollBottom() {
    requestAnimationFrame(() => { els.log.scrollTop = els.log.scrollHeight; });
  }

  function addMsg(m) {
    state.msgs.push(m);
    const prev = state.msgs[state.msgs.length - 2];
    if (shouldDivider(prev ? prev.t : 0, m.t)) els.log.appendChild(timeDivider(m.t));
    return renderMsg(m).then((node) => { els.log.appendChild(node); scrollBottom(); save(); });
  }

  /* ---------------- 状态显示 ---------------- */
  function setStatus(txt, live) {
    els.status.textContent = txt;
    els.status.classList.toggle('live', !!live);
  }
  let statusTimer = 0;
  function flashStatus(txt, back, ms) {
    setStatus(txt, true);
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => setStatus(back, false), ms || 2200);
  }

  /* ---------------- 打字动画 ---------------- */
  function typingNode() {
    const wrap = el('div', 'msg her');
    const a = el('img', 'av'); a.src = 'assets/avatar-192.png';
    wrap.appendChild(a);
    const b = el('div', 'typing');
    b.innerHTML = '<i></i><i></i><i></i>';
    wrap.appendChild(b);
    wrap.id = 'typingRow';
    return wrap;
  }
  function showTyping() {
    removeTyping();
    els.log.appendChild(typingNode());
    scrollBottom();
    setStatus('正在输入…', true);
  }
  function removeTyping() {
    const n = document.getElementById('typingRow');
    if (n) n.remove();
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function playReply(parts, stickerId) {
    const text = parts.join('|');
    const r = Core.rhythm(text);
    if (r.late) await wait(Math.min(r.late, 9000));
    showTyping();
    await wait(r.typing);
    removeTyping();
    for (const p of parts) {
      await addMsg({ who: 'her', kind: 'text', text: p, t: Date.now() });
      await wait(Core.partDelay(p));
    }
    if (stickerId && state.settings.stickers) {
      await wait(600);
      await addMsg({ who: 'her', kind: 'sticker', src: stickerId, t: Date.now() });
    }
    setStatus('在呢', false);
  }

  /* ---------------- 发送 ---------------- */
  let busy = false;
  let recentSends = [];

  async function send(text) {
    text = (text || '').trim();
    if (!text) return;
    if (busy) { toast('先等小鱼把这几条发完'); return; }

    await addMsg({ who: 'me', kind: 'text', text, t: Date.now() });
    Core.ensureLife(state, new Date());
    state.mood = Core.interact(state.mood, text);
    state.facts = Core.extractFacts(text, state.facts);
    recentSends.push(Date.now());
    recentSends = recentSends.filter((t) => Date.now() - t < 20000);
    state.summary = Core.updateSummary(state);
    save();

    busy = true;
    els.send.disabled = true;
    try {
      const reply = await getReply(text);
      await playReply(reply.parts, reply.sticker);
    } catch (e) {
      console.warn(e);
      await playReply(['欸，我这会儿有点卡…', '你刚说什么来着'], null);
    } finally {
      busy = false;
      els.send.disabled = false;
    }
  }

  async function getReply(text) {
    const key = (state.settings.apiKey || '').trim();
    if (key) {
      try { return await callDirect(text, key); }
      catch (e) { toast(errHint(e)); }
    }
    const ep = (state.settings.endpoint || '').trim();
    if (ep) {
      try {
        const r = await callModel(ep, text);
        if (r && r.parts && r.parts.length) return r;
      } catch (e) {
        toast('中转没连上，先用本地的');
      }
    }
    // 连发三条以上：合并成一句回应
    if (recentSends.length >= 3 && Math.random() < 0.6) {
      const base = Core.compose(text, state);
      return { parts: ['你一下子说这么多…'].concat(base.parts.slice(0, 2)), sticker: base.sticker };
    }
    return Core.compose(text, state);
  }

  function errHint(e) {
    const m = String((e && e.message) || e);
    if (m.includes('401')) return '密钥不对，去设置里再看看';
    if (m.includes('402')) return '余额不足了，去平台充点';
    if (m.includes('429')) return '太频繁了，等一下下';
    if (m.includes('403')) return '密钥没权限';
    return '没连上，先用本地的';
  }

  /* 直连 DeepSeek：不需要任何服务器 */
  async function callDirect(text, key) {
    const history = state.msgs
      .filter((m) => m.kind === 'text')
      .slice(-17, -1)
      .map((m) => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: 'deepseek-chat',
        stream: true,
        temperature: 1.2,
        max_tokens: 140,
        frequency_penalty: 0.4,
        messages: [
          { role: 'system', content: Persona.build(state, Date.now()) },
          ...history,
          { role: 'user', content: text }
        ]
      })
    });

    if (!res.ok || !res.body) throw new Error('http ' + res.status);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let raw = '';
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const d = s.slice(5).trim();
        if (d === '[DONE]') continue;
        try { raw += JSON.parse(d).choices?.[0]?.delta?.content || ''; } catch (e) { /* 跳过 */ }
      }
    }

    const { parts, sticker } = Persona.split(raw);
    if (!parts.length) throw new Error('empty');
    return { parts, sticker };
  }

  async function callModel(endpoint, text) {
    const payload = {
      text,
      now: Date.now(),
      stage: state.mood.stage,
      mood: { p: state.mood.p, a: state.mood.a, i: state.mood.i },
      facts: state.facts,
      summary: state.summary.text,
      life: Core.occurredLife(state.life).map((e) => e.time + ' ' + e.text),
      history: state.msgs.filter((m) => m.kind === 'text').slice(-17, -1).map((m) => ({ who: m.who, text: m.text }))
    };
    const res = await fetch(endpoint.replace(/\/$/, '') + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok || !res.body) throw new Error('http ' + res.status);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const parts = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const body = s.slice(5).trim();
        if (!body || body === '[DONE]') continue;
        try {
          const ev = JSON.parse(body);
          if (ev.type === 'part' && ev.text) parts.push(String(ev.text).trim());
        } catch (e) { /* 忽略非 JSON */ }
      }
    }
    if (!parts.length) throw new Error('empty');
    return { parts: parts.slice(0, 3), sticker: Math.random() < 0.3 ? Core.stickerFor('generic', state.mood) : null };
  }

  /* ---------------- 主动消息 ---------------- */
  function proactiveThreshold() {
    return { high: 20, mid: 24, low: Infinity }[state.settings.proactive] || 24;
  }
  function maybeProactive() {
    const s = state.settings;
    if (s.proactive === 'low') return;
    const now = Date.now();
    const gapH = (now - state.mood.lastActive) / 3600000;
    if (gapH < proactiveThreshold()) return;
    if (now - (s.lastProactive || 0) < 12 * 3600000) return;
    if (Core.isQuiet(new Date(now), s.quiet)) {
      // 静默时段来了消息就攒着，等下次打开再发
      s.pending = true;
      save();
      return;
    }
    const life = Core.occurredLife(state.life);
    const pools = [
      ['欸，你今天跑哪儿去啦', '我还以为你把我忘了'],
      ['在干嘛呢', '半天没动静'],
      ['刚没看手机，才瞧见', '你昨天那事后来怎么样了'],
      ['有点想你了', '不过我才不说呢']
    ];
    let parts = Core.pick(pools).slice();
    if (life.length && Math.random() < 0.5) parts = parts.slice(0, 1).concat(['我今天' + Core.pick(life).text]);
    s.lastProactive = now;
    save();
    setTimeout(() => { playReply(parts, Math.random() < 0.4 ? 'love' : null); }, 1200);
  }

  /* ---------------- 表情面板 ---------------- */
  function section(label, hint) {
    const d = el('div', 'sec');
    d.appendChild(el('span', null, label));
    if (hint) d.appendChild(el('span', null, hint));
    return d;
  }

  function tile(src, label, onClick, cls) {
    const b = document.createElement('button');
    if (cls) b.className = cls;
    const img = document.createElement('img');
    img.alt = label;
    img.title = label;
    if (src) img.src = src;
    b.appendChild(img);
    b.onclick = onClick;
    return b;
  }

  function bindLongPress(node, fn) {
    let timer = 0;
    const start = () => { timer = setTimeout(fn, 600); };
    const cancel = () => { clearTimeout(timer); };
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchend', cancel);
    node.addEventListener('touchmove', cancel, { passive: true });
    node.addEventListener('mousedown', start);
    node.addEventListener('mouseup', cancel);
    node.addEventListener('mouseleave', cancel);
  }

  async function buildStickers() {
    els.grid.innerHTML = '';
    els.grid.appendChild(section('她的表情', ''));
    for (const s of STICKERS) {
      els.grid.appendChild(tile(s.file, s.label, () => { closeSticker(); sendSticker(s.id); }));
    }

    els.grid.appendChild(section('我的表情', state.custom.length ? '长按可删除' : '可以加自己的图'));
    const add = el('button', 'add', '＋');
    add.onclick = () => els.stickerPick.click();
    els.grid.appendChild(add);

    for (const c of state.custom.slice(0, 60)) {
      const b = tile('', '我的表情', () => { closeSticker(); sendSticker(c.id); }, 'del');
      const img = b.querySelector('img');
      let src = imgCache.get(c.id);
      if (!src) { src = await IDB.get(c.id); if (src) imgCache.set(c.id, src); }
      img.src = src || '';
      bindLongPress(b, () => removeCustom(c.id));
      els.grid.appendChild(b);
    }
  }

  async function addCustomStickers(files) {
    let added = 0;
    for (const f of files) {
      if (!f || !f.type.startsWith('image/')) continue;
      const dataUrl = await shrinkImage(f, 400, 'image/png');
      if (!dataUrl) continue;
      const id = 'cs_' + Date.now() + '_' + added;
      await IDB.put(id, dataUrl);
      imgCache.set(id, dataUrl);
      state.custom.unshift({ id, t: Date.now() });
      added++;
    }
    state.custom = state.custom.slice(0, 60);
    save();
    await buildStickers();
    if (added) toast(`加了 ${added} 个表情`);
    else toast('没读到图片');
  }

  function removeCustom(id) {
    if (!confirm('删掉这个表情？')) return;
    state.custom = state.custom.filter((c) => c.id !== id);
    imgCache.delete(id);
    IDB.del(id).catch(() => {});
    save();
    buildStickers();
    toast('删掉了');
  }
  async function sendSticker(id) {
    await addMsg({ who: 'me', kind: 'sticker', src: id, t: Date.now() });
    state.mood = Core.interact(state.mood, '（我发了个表情）');
    save();
    if (busy) return;
    busy = true;
    try {
      const pool = [
        ['干嘛', '发这个'],
        ['哈哈你好烦', '我收下了'],
        ['欸，你也学会这个了']
      ];
      await playReply(Core.pick(pool), Math.random() < 0.25 ? 'love' : null);
    } finally { busy = false; }
  }
  function openSticker() { els.panel.classList.add('open'); }
  function closeSticker() { els.panel.classList.remove('open'); }

  /* ---------------- 设置 ---------------- */
  function renderSettings() {
    const s = state.settings;
    [...els.segProactive.children].forEach((b) => b.classList.toggle('on', b.dataset.v === s.proactive));
    els.proactiveHint.textContent = {
      high: '20 小时没聊她会来敲门，一天最多 2 条',
      mid: '24 小时没聊她会来一次，一天 1 条',
      low: '她只会等你先开口，不再主动发'
    }[s.proactive];
    els.optSticker.checked = !!s.stickers;
    els.endpoint.value = s.endpoint || '';
    els.apiKey.value = s.apiKey || '';
    const keys = Object.keys(state.facts || {});
    els.facts.innerHTML = '';
    if (!keys.length) {
      els.facts.appendChild(el('span', 'empty', '还没什么，多聊聊她就记住了'));
    } else {
      keys.forEach((k) => {
        const b = el('span', null, (Core.FACT_LABEL[k] || k) + '：' + state.facts[k]);
        b.title = '点击删除';
        b.style.cursor = 'pointer';
        b.onclick = () => { delete state.facts[k]; save(); renderSettings(); };
        els.facts.appendChild(b);
      });
    }
    const days = Math.max(1, Math.round((Date.now() - state.createdAt) / 86400000));
    els.stats.textContent = `聊了 ${days} 天 · ${state.mood.count} 句 · 亲密度 ${Math.round(state.mood.i)} · ${state.mood.stage}`;
  }

  function openSheet() { renderSettings(); els.sheet.classList.remove('hidden'); }
  function closeSheet() { els.sheet.classList.add('hidden'); }

  /* ---------------- 导入导出 ---------------- */
  function exportData() {
    const data = JSON.parse(JSON.stringify(state));
    data.msgs = data.msgs.filter((m) => m.kind !== 'image');
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `余小渔备份-${Core.dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('导出好了（不含图片原图）');
  }
  async function importData(file) {
    const txt = await file.text();
    let data;
    try { data = JSON.parse(txt); } catch (e) { return toast('这不是备份文件'); }
    if (!data || !Array.isArray(data.msgs)) return toast('备份格式不对');
    if (!confirm('用这份备份覆盖现在的记录？')) return;
    state = Object.assign(defaults(), data);
    save(); await renderAll();
    toast('恢复好了');
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    els.send.onclick = () => { const v = els.input.value; els.input.value = ''; autoGrow(); send(v); };
    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const v = els.input.value; els.input.value = ''; autoGrow(); send(v);
      }
    });
    els.input.addEventListener('input', autoGrow);

    els.btnSticker.onclick = () => { els.panel.classList.contains('open') ? closeSticker() : openSticker(); };
    els.btnPic.onclick = () => els.filePick.click();
    els.closeSticker.onclick = closeSticker;
    els.more.onclick = openSheet;
    els.closeSheet.onclick = closeSheet;
    els.sheet.addEventListener('click', (e) => { if (e.target === els.sheet) closeSheet(); });

    [...els.segProactive.children].forEach((b) => {
      b.onclick = () => { state.settings.proactive = b.dataset.v; save(); renderSettings(); };
    });
    els.optSticker.onchange = () => { state.settings.stickers = els.optSticker.checked; save(); };
    els.endpoint.onchange = () => {
      state.settings.endpoint = els.endpoint.value.trim().replace(/\/$/, '');
      save();
      toast(state.settings.endpoint ? '已保存中转地址' : '已清空中转地址');
    };
    els.apiKey.onchange = () => {
      state.settings.apiKey = els.apiKey.value.trim();
      save();
      toast(state.settings.apiKey ? '密钥已存在这台设备上' : '已清空密钥');
    };

    els.btnExport.onclick = exportData;
    els.btnImport.onclick = () => els.importPick.click();
    els.importPick.onchange = async () => {
      const f = els.importPick.files[0];
      if (f) await importData(f);
      els.importPick.value = '';
    };
    els.btnReset.onclick = async () => {
      if (!confirm('确定清空所有聊天和记忆？这个不能撤销。')) return;
      localStorage.removeItem(LS_KEY);
      await IDB.clear();
      state = defaults();
      await renderAll();
      closeSheet();
      toast('重新开始了');
    };

    // 图片
    els.input.addEventListener('paste', (e) => {
      const it = [...(e.clipboardData || {}).items || []].find((x) => x.type.startsWith('image/'));
      if (it) { e.preventDefault(); handleImage(it.getAsFile()); }
    });
    els.filePick.onchange = () => { const f = els.filePick.files[0]; if (f) handleImage(f); els.filePick.value = ''; };
    els.stickerPick.onchange = async () => {
      const files = [...els.stickerPick.files];
      els.stickerPick.value = '';
      if (files.length) await addCustomStickers(files);
    };

    document.addEventListener('visibilitychange', () => { if (!document.hidden) save(); });
    window.addEventListener('beforeunload', () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} });
  }

  function autoGrow() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(120, els.input.scrollHeight) + 'px';
  }

  async function handleImage(file) {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) return toast('图太大了，30MB 以内');
    const dataUrl = await compress(file);
    const id = 'img_' + Date.now();
    await IDB.put(id, dataUrl);
    imgCache.set(id, dataUrl);
    await addMsg({ who: 'me', kind: 'image', src: id, t: Date.now() });
    state.mood = Core.interact(state.mood, '（我发了张图）');
    save();
    const replies = [
      ['这是哪儿啊', '看着不错'],
      ['咦', '你拍的？'],
      ['唔…好看', '我也想去了'],
      ['收到啦', '我收着']
    ];
    if (!busy) { busy = true; try { await playReply(Core.pick(replies), Math.random() < 0.3 ? 'love' : null); } finally { busy = false; } }
  }

  function compress(file) {
    return shrinkImage(file, 900, 'image/jpeg', 0.72);
  }

  /** 按长边缩放到 max，返回 dataURL */
  function shrinkImage(file, max, type, quality) {
    return new Promise((res) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * r));
        c.height = Math.max(1, Math.round(img.height * r));
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL(type || 'image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(''); };
      img.src = url;
    });
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    await buildStickers();
    bind();
    state.mood = Core.relaxMood(state.mood);
    Core.ensureLife(state, new Date());
    await renderAll();

    if (!state.msgs.length) {
      const open = [
        ['欸，被你找到啦', '今天怎么样'],
        ['在呢', '刚好想找个人说话']
      ];
      setTimeout(() => playReply(Core.pick(open), 'happy'), 700);
    } else {
      setTimeout(maybeProactive, 900);
    }
    save();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && location.hostname !== 'localhost') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  boot();
})();
