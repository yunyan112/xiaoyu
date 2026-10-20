/* 余小渔 · 应用主程序 */
(function () {
  'use strict';

  const LS_KEY = 'yuxiaoyu.v1';
  const VERSION = 'v9 · 2026-10-20 21:30';
  const $ = (s) => document.querySelector(s);

  const els = {
    log: $('#log'), input: $('#input'), send: $('#btnSend'), status: $('#status'),
    sheet: $('#sheet'), more: $('#btnMore'), closeSheet: $('#closeSheet'),
    panel: $('#stickerPanel'), grid: $('#stickerGrid'), btnSticker: $('#btnSticker'), btnPic: $('#btnPic'),
    closeSticker: $('#closeSticker'), toast: $('#toast'),
    segProactive: $('#segProactive'), proactiveHint: $('#proactiveHint'),
    optSticker: $('#optSticker'), endpoint: $('#endpoint'), apiKey: $('#apiKey'), facts: $('#facts'),
    segHot: $('#segHot'), hotHint: $('#hotHint'),
    optPlace: $('#optPlace'), placeHint: $('#placeHint'),
    factKey: $('#factKey'), factVal: $('#factVal'), factAdd: $('#factAdd'),
    segCall: $('#segCall'), callHint: $('#callHint'),
    stickerPick: $('#stickerPick'),
    stats: $('#stats'), filePick: $('#filePick'), importPick: $('#importPick'),
    banner: $('#banner'), bannerText: $('#bannerText'), bannerBtn: $('#bannerBtn'),
    btnExport: $('#btnExport'), btnImport: $('#btnImport'), btnReset: $('#btnReset'), btnUpdate: $('#btnUpdate')
  };

  /* ---------------- 存储 ---------------- */
  let state = load();

  function defaults() {
    const now = Date.now();
    return {
      v: 1,
      msgs: [],
      mood: Core.initialMood(now),
      facts: { 称呼: '云烟', 爱好: '画画', 在忙: '考研' },
      summary: { text: '刚认识，还没聊太多', topics: [], at: now },
      custom: [],
      seen: {},
      notes: [],
      life: null,
      settings: { proactive: 'mid', quiet: [2, 7], stickers: true, endpoint: '', apiKey: '', hot: 'off', place: true, call: 'mid', lastProactive: 0 },
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
      s.facts = Object.assign({ 称呼: '云烟', 爱好: '画画', 在忙: '考研' }, s.facts || {});
      s.summary = Object.assign(d.summary, s.summary || {});
      s.msgs = Array.isArray(s.msgs) ? s.msgs : [];
      s.custom = Array.isArray(s.custom) ? s.custom : [];
      s.seen = s.seen && typeof s.seen === 'object' ? s.seen : {};
      s.notes = Array.isArray(s.notes) ? s.notes : [];
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
    } else if (m.kind === 'media') {
      let blob = imgCache.get(m.src);
      if (!blob) { blob = await IDB.get(m.src); if (blob) imgCache.set(m.src, blob); }
      if (blob) {
        const node = document.createElement(m.mtype === 'video' ? 'video' : 'audio');
        node.controls = true;
        node.src = URL.createObjectURL(blob);
        node.className = m.mtype === 'video' ? 'vid' : 'aud';
        if (m.mtype === 'video') node.onloadeddata = scrollBottom;
        body = node;
      } else {
        body = el('div', 'bubble', '（文件找不到了）');
      }
    } else if (m.kind === 'file') {
      const card = el('div', 'filecard');
      card.innerHTML = '<b>' + esc(m.name) + '</b><span>' + fmtSize(m.size) + '</span>';
      body = card;
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

  /* ---------------- 连接状态 ---------------- */
  function showBanner(text) {
    els.bannerText.textContent = text;
    els.banner.classList.remove('hidden');
  }
  function hideBanner() {
    els.banner.classList.add('hidden');
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
    parts = (parts || []).filter(Boolean);
    // 她不发只有表情、没有一个字的消息
    if (!parts.length && stickerId) parts = ['喏'];
    if (!parts.length) return;
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
    setStatus(Core.activity(new Date()), false);
  }

  /* ---------------- 发送 ---------------- */
  let busy = false;
  let thinkTimer = 0;
  let lastUserText = '';
  let lastUserKind = 'text';
  let lastImageId = null;
  let lastStickerSent = null;
  let replyQueued = false;
  let recentSends = [];

  async function send(text) {
    text = (text || '').trim();
    if (!text) return;

    await addMsg({ who: 'me', kind: 'text', text, t: Date.now() });
    Core.ensureLife(state, new Date());
    state.mood = Core.interact(state.mood, text);
    state.facts = Core.extractFacts(text, state.facts);
    recentSends.push(Date.now());
    recentSends = recentSends.filter((t) => Date.now() - t < 20000);
    state.summary = Core.updateSummary(state);
    Core.remember(state, text);
    lastUserText = text;
    lastUserKind = 'text';
    save();

    // 她在说话的时候你也可以继续说，说完她会回你最新那句
    if (busy) { replyQueued = true; return; }
    scheduleReply();
  }

  function scheduleReply() {
    clearTimeout(thinkTimer);
    const hold = 700 + Math.random() * 500; // 0.7~1.2 秒的空档
    thinkTimer = setTimeout(runReply, hold);
  }

  async function runReply() {
    thinkTimer = 0;
    if (busy) { replyQueued = true; return; }
    busy = true;
    try {
      const reply = await getReply(lastUserText);
      reply.sticker = pickHerSticker(reply.sticker);
      await playReply(reply.parts, reply.sticker);
    } catch (e) {
      console.warn(e);
      await playReply(['欸，我这会儿有点卡…', '你刚说什么来着'], null);
    } finally {
      busy = false;
      if (replyQueued) { replyQueued = false; scheduleReply(); }
    }
  }

  async function getReply(text) {
    const key = (state.settings.apiKey || '').trim();
    if (key) {
      try {
        const r = await callDirect(text, key, lastUserKind === 'image' ? lastImageId : null);
        hideBanner();
        return r;
      } catch (e) {
        showBanner(errHint(e) + '，这条是她本地回的');
      }
    }
    const ep = (state.settings.endpoint || '').trim();
    if (ep) {
      try {
        const r = await callModel(ep, text);
        if (r && r.parts && r.parts.length) { hideBanner(); return r; }
      } catch (e) {
        showBanner('中转没连上，这条是她本地回的');
      }
    }
    // 连发三条以上：合并成一句回应
    if (recentSends.length >= 3 && Math.random() < 0.6) {
      const base = Core.compose(text, state);
      return { parts: ['你一下子说这么多…'].concat(base.parts.slice(0, 2)), sticker: base.sticker };
    }
    // 他发的是表情包：记得他常发，但别每次都点破
    if (lastUserKind === 'sticker') {
      const id = lastStickerSent || '';
      state.seen = state.seen || {};
      const n = (state.seen[id] || 0) + 1;
      state.seen[id] = n;
      save();

      let parts = Core.pick([
        ['这个表情好呆', '我喜欢'],
        ['哈哈', '你哪来这么多'],
        ['存了', '下次我也发'],
        ['这什么', '好笑'],
        ['你表情包好多', '我这个就不够了']
      ]);
      // 偶尔才点破，语气也要收着
      if (n > 1 && Math.random() < 0.18) parts = ['这个你发过了', pickSoft()];
      else if (n > 3 && Math.random() < 0.12) parts = ['你是不是特别喜欢这张', '我也觉得好用'];
      return { parts, sticker: Math.random() < 0.3 ? 'roll' : null };
    }
    if (lastUserKind === 'image') {
      return {
        parts: Core.pick([
          ['这是哪儿啊', '看着不错'],
          ['咦', '你拍的？'],
          ['唔…好看', '我也想去了'],
          ['收到啦', '我收着']
        ]),
        sticker: Math.random() < 0.3 ? 'love' : null
      };
    }
    if (lastUserKind === 'media' || lastUserKind === 'file') {
      return {
        parts: Core.pick([
          ['我看看', '一会儿回你'],
          ['收到', '这是你做的？'],
          ['等下就听', '别催我'],
          ['哇', '你还有这个']
        ]),
        sticker: null
      };
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
  async function callDirect(text, key, imageId) {
    const history = state.msgs
      .filter((m) => m.kind === 'text')
      .slice(-31, -1)
      .map((m) => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));

    // 有图就走视觉模型
    let model = 'deepseek-chat';
    let userContent = text;
    if (imageId) {
      let dataUrl = imgCache.get(imageId);
      if (!dataUrl) dataUrl = await IDB.get(imageId);
      if (typeof dataUrl === 'string' && dataUrl.indexOf('data:image') === 0) {
        model = 'deepseek-v4-flash-vision-exp';
        userContent = [
          { type: 'text', text: text },
          { type: 'image_url', image_url: { url: dataUrl } }
        ];
      }
    }

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.95,
        max_tokens: 140,
        frequency_penalty: 0.4,
        messages: [
          { role: 'system', content: Persona.build(state, Date.now(), Core.recall(state, text)) },
          ...history,
          { role: 'user', content: userContent }
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
  function pickSoft() {
    return Core.pick(['不过我还是笑了', '但我还是收下了', '你别老发']);
  }

  /** 她也要发表情时：一部分概率用他收藏的那堆表情包 */
  function pickHerSticker(builtin) {
    if (!state.settings.stickers) return null;
    const custom = state.custom || [];
    if (custom.length && (builtin || Math.random() < 0.18)) {
      if (Math.random() < 0.45) return Core.pick(custom).id;
    }
    return builtin;
  }

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
    // 输入框里有字就先把它发出去，再来表情包（一句 + 一个表情连着发）
    const pending = (els.input.value || '').trim();
    if (pending) {
      els.input.value = '';
      autoGrow();
      await send(pending);
    }

    await addMsg({ who: 'me', kind: 'sticker', src: id, t: Date.now() });
    state.mood = Core.interact(state.mood, '（我发了个表情）');
    lastUserText = '（发了张表情包）';
    lastUserKind = 'sticker';
    lastStickerSent = id;
    save();

    if (busy) { replyQueued = true; return; }
    scheduleReply();
  }
  function openSticker() { els.panel.classList.add('open'); }
  function closeSticker() { els.panel.classList.remove('open'); }

  /* ---------------- 她刷到的热点 ---------------- */
  const HOT_POOL = [
    '猫咖里那只橘猫胖到上不去台阶',
    '大学食堂的免费汤里终于有蛋花了',
    '有人把宿舍改成了小型画室',
    '降温了，短袖和羽绒服同时出现在操场上',
    '图书馆的座位预约系统又崩了',
    '一个男生在操场跑了三十圈给室友过生日',
    '新出的奶茶联名，杯子好看但不好喝',
    '某高校的猫学会了开自动门',
    '宿舍楼下开始卖烤肠了',
    '有人在二手平台卖「考研上岸锦鲤」',
    '上课偷偷画画被老师夸了',
    '凌晨的便利店永远有人在吃关东煮'
  ];

  function localHot(n) {
    const r = Core.seeded(Core.hashStr('hot' + Core.dayKey()));
    const start = Math.floor(r() * HOT_POOL.length);
    return Array.from({ length: n }, (_, i) => HOT_POOL[(start + i) % HOT_POOL.length]);
  }

  async function genHot(key, n) {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 1.3,
        max_tokens: 240,
        messages: [
          {
            role: 'system',
            content:
              '你叫余小渔，19 岁，大二。你喜欢画画、爱吃、追剧、看搞笑视频，也爱刷热搜但只关心有意思的那些。' +
              '列出 ' + n + ' 条你今天在手机上刷到、而且你真的会点开看的内容。' +
              '范围可以是：搞笑视频或梗、校园里的小事、好吃的店、画画相关、追剧吐槽、萌宠、偶尔一条大家都在讨论的大事。' +
              '要求：每条不超过 16 个字；用真人口吻，不要标题党；不涉及真实人名、政治、灾难；不编号，每条一行。'
          },
          { role: 'user', content: '我今天刷到了什么？' }
        ]
      })
    });
    if (!res.ok) throw new Error('hot ' + res.status);
    const j = await res.json();
    const txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    return txt.split('\n')
      .map((s) => s.replace(/^[\d.、\s\-*]+/, '').trim())
      .filter((s) => s.length >= 4 && s.length <= 30)
      .slice(0, n);
  }

  async function ensureHot(force) {
    const lvl = state.settings.hot || 'off';
    if (lvl === 'off') { state.hot = null; return; }
    const ttl = lvl === 'high' ? 7 * 3600e3 : 20 * 3600e3;
    if (!force && state.hot && Date.now() - state.hot.at < ttl) return;
    const n = lvl === 'low' ? 3 : lvl === 'mid' ? 5 : 6;
    let items = null;
    let src = 'local';
    const key = (state.settings.apiKey || '').trim();
    if (key) {
      try {
        items = await genHot(key, n);
        src = 'model';
      } catch (e) { items = null; }
    }
    if (!items || !items.length) { items = localHot(n); src = 'local'; }
    state.hot = { at: Date.now(), items, src, lvl };
    save();
  }

  /* ---------------- 定位和天气 ---------------- */
  const WMO = {
    0: '晴', 1: '晴间多云', 2: '多云', 3: '阴', 45: '有雾', 48: '雾凇',
    51: '毛毛雨', 53: '小雨', 55: '中雨', 56: '冻雨', 57: '冻雨',
    61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '米雪',
    80: '阵雨', 81: '中阵雨', 82: '暴雨', 85: '阵雪', 86: '强阵雪',
    95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷暴'
  };

  function placeErrText(code) {
    if (code === 1) return '权限被拒绝了（去系统设置里给「余小渔」开定位权限）';
    if (code === 2) return '拿不到位置（手机的定位开关可能没开）';
    if (code === 3) return '超时了（室内信号差，多试一次）';
    return '定位失败';
  }

  async function updatePlace(force) {
    if (!state.settings.place) return;
    if (state.place && !force && Date.now() - state.place.at < 30 * 60000) return;
    if (!navigator.geolocation) {
      state.placeErr = '这台设备不支持定位';
      save();
      renderSettings();
      return;
    }

    const pos = await new Promise((res) => {
      navigator.geolocation.getCurrentPosition(
        (p) => res({ ok: true, lat: p.coords.latitude, lon: p.coords.longitude }),
        (err) => res({ ok: false, code: err && err.code }),
        { timeout: 20000, maximumAge: 5 * 60000, enableHighAccuracy: false }
      );
    });

    if (!pos.ok) {
      state.placeErr = placeErrText(pos.code);
      save();
      renderSettings();
      return;
    }

    let city = '';
    let temp = null;
    let desc = '';
    try {
      const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + pos.lat + '&longitude=' + pos.lon + '&localityLanguage=zh');
      const j = await r.json();
      city = j.city || j.locality || j.principalSubdivision || '';
    } catch (e) { /* 查不到就算了 */ }
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + pos.lat + '&longitude=' + pos.lon + '&current=temperature_2m,weather_code&timezone=auto');
      const j = await r.json();
      if (j.current) {
        temp = Math.round(j.current.temperature_2m);
        desc = WMO[j.current.weather_code] || '';
      }
    } catch (e) { /* 同上 */ }

    state.placeErr = '';
    state.place = { at: Date.now(), city, temp, desc, lat: pos.lat, lon: pos.lon };
    save();
    renderSettings();
  }

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

    const callMode = s.call || 'mid';
    [...els.segCall.children].forEach((b) => b.classList.toggle('on', b.dataset.v === callMode));
    els.callHint.textContent = {
      high: '大部分时候会带上你的名字',
      mid: '十句里两三句带名字，其余直接开口（推荐）',
      off: '完全不叫名字，直接说话，急了才连名带姓'
    }[callMode];
    els.optPlace.checked = !!s.place;
    if (state.place && state.place.city) {
      els.placeHint.textContent = `${state.place.city} · ${state.place.desc} ${state.place.temp}° · 30 分钟更新一次`;
    } else if (state.placeErr) {
      els.placeHint.textContent = '定位失败：' + state.placeErr;
    } else if (s.place) {
      els.placeHint.textContent = '正在获取…（第一次会让你授权定位）';
    } else {
      els.placeHint.textContent = '关掉之后她不知道你在哪、外面什么天气';
    }
    if (s.place && !state.place) {
      const a = document.createElement('a');
      a.href = 'javascript:void(0)';
      a.textContent = ' 重试';
      a.style.color = 'var(--accent)';
      a.onclick = async () => {
        els.placeHint.textContent = '重新定位中…';
        await updatePlace(true);
      };
      els.placeHint.appendChild(a);
    }
    [...els.segHot.children].forEach((b) => b.classList.toggle('on', b.dataset.v === (s.hot || 'off')));
    els.endpoint.value = s.endpoint || '';
    els.apiKey.value = s.apiKey || '';

    const hotText = {
      off: '关掉之后她不会提任何外面的事',
      low: '每天 1 次 · 3 条 · 只当背景，不太会提',
      mid: '每天 1 次 · 5 条 · 聊天里偶尔冒出',
      high: '每 7 小时 1 次 · 6 条 · 主动说得更勤'
    };
    let hint = hotText[s.hot || 'off'];
    if (s.hot && s.hot !== 'off' && state.hot) {
      const t = new Date(state.hot.at);
      const when = `${Core.pad(t.getHours())}:${Core.pad(t.getMinutes())}`;
      hint += `\n上次刷新 ${when} · ${state.hot.items.length} 条 · ${state.hot.src === 'model' ? '模型生成' : '内置'}`;
    }
    els.hotHint.textContent = hint;
    if (s.hot && s.hot !== 'off') {
      const a = document.createElement('a');
      a.href = 'javascript:void(0)';
      a.textContent = ' 立即刷新';
      a.style.color = 'var(--accent)';
      a.onclick = async () => { toast('正在刷新…'); await ensureHot(true); renderSettings(); toast('刷新好了'); };
      els.hotHint.appendChild(a);
    }
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
    const total = state.msgs.filter((m) => m.kind === 'text').length;
    els.stats.textContent = `聊了 ${days} 天 · ${state.mood.count} 句 · 亲密度 ${Math.round(state.mood.i)} · ${state.mood.stage}` +
      `\n记得 ${total} 条对话 · ${(state.notes || []).length} 条摘记 · ${Object.keys(state.facts || {}).length} 个标签` +
      `\n版本 ${VERSION}`;
  }

  function openSheet() {
    renderSettings();
    els.sheet.classList.remove('hidden');
    if (state.settings.place && !state.place) updatePlace(true).catch(() => {});
  }
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
    els.bannerBtn.onclick = openSheet;
    els.sheet.addEventListener('click', (e) => { if (e.target === els.sheet) closeSheet(); });

    [...els.segProactive.children].forEach((b) => {
      b.onclick = () => { state.settings.proactive = b.dataset.v; save(); renderSettings(); };
    });
    els.optSticker.onchange = () => { state.settings.stickers = els.optSticker.checked; save(); };
    [...els.segCall.children].forEach((b) => {
      b.onclick = () => { state.settings.call = b.dataset.v; save(); renderSettings(); };
    });
    els.factAdd.onclick = () => {
      const k = (els.factKey.value || '').trim();
      const v = (els.factVal.value || '').trim();
      if (!k || !v) return toast('两格都要填');
      state.facts[k] = v;
      els.factKey.value = '';
      els.factVal.value = '';
      save();
      renderSettings();
      toast('记住了');
    };
    els.optPlace.onchange = async () => {
      state.settings.place = els.optPlace.checked;
      save();
      renderSettings();
      if (state.settings.place) await updatePlace(true).catch(() => {});
    };
    [...els.segHot.children].forEach((b) => {
      b.onclick = async () => {
        state.settings.hot = b.dataset.v;
        save();
        renderSettings();
        if (b.dataset.v !== 'off') {
          await ensureHot();
          renderSettings();
        }
      };
    });
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
    els.btnUpdate.onclick = async () => {
      toast('正在清缓存…');
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if (window.caches) {
          const ks = await caches.keys();
          await Promise.all(ks.map((k) => caches.delete(k)));
        }
      } catch (e) { /* 忽略 */ }
      setTimeout(() => location.reload(), 400);
    };
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
      if (it) { e.preventDefault(); handleFile(it.getAsFile()); }
    });
    els.filePick.onchange = () => { const f = els.filePick.files[0]; if (f) handleFile(f); els.filePick.value = ''; };
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

  async function handleFile(file) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return toast('文件太大了，25MB 以内');
    const type = file.type || '';
    const id = 'f_' + Date.now();

    if (type.startsWith('image/')) {
      const dataUrl = await compress(file);
      if (!dataUrl) return toast('这张图读不出来');
      await IDB.put(id, dataUrl);
      imgCache.set(id, dataUrl);
      await addMsg({ who: 'me', kind: 'image', src: id, t: Date.now() });
      state.mood = Core.interact(state.mood, '（我发了张图）');
      lastUserText = '（发了张图片）';
      lastUserKind = 'image';
      lastImageId = id;
    } else if (type.startsWith('video/') || type.startsWith('audio/')) {
      await IDB.put(id, file);
      await addMsg({
        who: 'me', kind: 'media', src: id, t: Date.now(),
        mtype: type.startsWith('video') ? 'video' : 'audio',
        name: file.name || '', size: file.size
      });
      state.mood = Core.interact(state.mood, '（我发了个文件）');
      lastUserText = type.startsWith('video') ? '（发了段视频）' : '（发了首歌）';
      lastUserKind = 'media';
    } else {
      await IDB.put(id, file);
      await addMsg({
        who: 'me', kind: 'file', src: id, t: Date.now(),
        name: file.name || '文件', size: file.size, mtype: type
      });
      state.mood = Core.interact(state.mood, '（我发了个文件）');
      lastUserText = '（发了个文件：' + (file.name || '文件') + '）';
      lastUserKind = 'file';
    }
    save();
    if (busy) { replyQueued = true; return; }
    scheduleReply();
  }

  function fmtSize(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function compress(file) {
    return shrinkImage(file, 1440, 'image/jpeg', 0.82);
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
  async function opener() {
    const key = (state.settings.apiKey || '').trim();
    if (key) {
      try {
        const r = await callDirect('（我刚通过你的好友申请）', key);
        if (r && r.parts && r.parts.length) {
          hideBanner();
          await playReply(r.parts, r.sticker);
          return;
        }
      } catch (e) {
        showBanner(errHint(e) + '，开场先用本地的');
      }
    }
    const open = [
      ['欸，被你找到啦', '今天怎么样'],
      ['在呢', '刚好想找个人说话'],
      ['嗯？你是……', '哦，是你啊']
    ];
    showBanner('还没填密钥，现在是她本地回你');
    await playReply(Core.pick(open), 'happy');
  }

  async function boot() {
    await buildStickers();
    bind();
    state.mood = Core.relaxMood(state.mood);
    Core.ensureLife(state, new Date());
    await renderAll();
    setStatus(Core.activity(new Date()), false);
    setInterval(() => { if (!busy) setStatus(Core.activity(new Date()), false); }, 60000);
    ensureHot().catch(() => {});
    setTimeout(() => updatePlace().catch(() => {}), 2500);
    setInterval(() => { updatePlace().catch(() => {}); }, 30 * 60000);

    if (!state.msgs.length) {
      setTimeout(opener, 700);
    } else {
      if (!(state.settings.apiKey || '').trim() && !(state.settings.endpoint || '').trim()) {
        showBanner('还没填密钥，现在是她本地回你');
      }
      setTimeout(maybeProactive, 900);
    }
    save();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && location.hostname !== 'localhost') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  boot();
})();
