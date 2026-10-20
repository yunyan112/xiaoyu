/* 余小渔 · 核心：情绪 / 记忆 / 生活 / 回复引擎
 * 无依赖，可用 file:// 直接跑。
 */
const Core = (function () {
  'use strict';

  /* ---------------- 工具 ---------------- */
  const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
  const rnd = () => Math.random();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // 去重选择：最近用过的模板降权
  const recent = new Map();
  function pickFresh(arr, key) {
    const now = Date.now();
    const scored = arr.map((v) => {
      const t = recent.get(key + '|' + v) || 0;
      return { v, fresh: now - t > 1000 * 60 * 12 };
    });
    const fresh = scored.filter((s) => s.fresh).map((s) => s.v);
    const out = fresh.length ? pick(fresh) : pick(arr);
    recent.set(key + '|' + out, now);
    return out;
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ---------------- 时间 ---------------- */
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function isQuiet(now, quiet) {
    const h = now.getHours();
    const [s, e] = quiet || [2, 7];
    return s < e ? (h >= s && h < e) : (h >= s || h < e);
  }
  function mealNow(h) {
    if (h >= 6 && h < 9) return '早饭';
    if (h >= 11 && h < 13) return '午饭';
    if (h >= 17 && h < 19) return '晚饭';
    if (h >= 21 && h < 24) return '夜宵';
    return '';
  }

  /* ---------------- 情绪 ---------------- */
  function initialMood(now = Date.now()) {
    return { p: 60, a: 55, i: 5, count: 0, stage: '生疏', lastActive: now, updatedAt: now, shortStreak: 0, coldRounds: 0, coldUntil: 0 };
  }
  function stageFor(count, i) {
    return count >= 400 && i > 80 ? '离不开' : count >= 120 && i > 60 ? '黏人' : count >= 30 ? '熟络' : '生疏';
  }
  function relaxMood(mood, now = Date.now()) {
    const m = Object.assign({}, mood);
    const hours = Math.max(0, (now - m.updatedAt) / 3600000);
    m.p = clamp(60 + (m.p - 60) * Math.pow(0.98, hours));
    m.a = clamp(55 + (m.a - 55) * Math.pow(0.96, hours));
    m.i = clamp(5 + (m.i - 5) * Math.pow(0.999, hours));
    const oldDays = Math.floor(Math.max(0, m.updatedAt - m.lastActive) / 86400000);
    const newDays = Math.floor(Math.max(0, now - m.lastActive) / 86400000);
    if (newDays > oldDays) { m.i = clamp(m.i - (newDays - oldDays)); m.p = clamp(m.p - 3 * (newDays - oldDays)); }
    m.updatedAt = now;
    m.stage = stageFor(m.count, m.i);
    return m;
  }
  const LAZY_RE = /^(嗯+|哦+|啊+|哈+|好+|行+|在|是|对|随便|都行|哈哈|hhh|\.+|…+)[。.!！?？~～\s]*$/i;
  function isLazy(text) {
    const t = String(text).trim();
    if (LAZY_RE.test(t)) return true;
    return [...t].length <= 2 && !/[?？吗呢啊嘛]/.test(t);
  }

  function interact(mood, text, now = Date.now()) {
    const m = relaxMood(mood, now);
    const short = isLazy(text);
    m.shortStreak = short ? (m.shortStreak || 0) + 1 : 0;
    m.coldRounds = Math.max(0, (m.coldRounds || 0) - 1);
    if (short) m.p -= 4;
    if (/可爱|好棒|喜欢你|厉害|漂亮|真乖/.test(text) && !m.coldRounds) m.p += 5;
    if (/讨厌你|滚|闭嘴|烦死|走开/.test(text)) { m.p -= 12; m.coldRounds = 3; }
    if (m.shortStreak >= 2) { m.coldUntil = now + 20000; m.coldRounds = Math.max(m.coldRounds, 2); m.shortStreak = 0; }
    const h = new Date(now).getHours();
    if (h < 6 || h >= 23) m.a -= 10;
    if (h >= 7 && h < 9 && now - mood.lastActive > 6 * 3600000) m.a -= 12;
    if (/哈哈|笑死|太好笑|笑疯/.test(text)) m.a += 8;
    m.i = clamp(m.i + 1 + Math.floor(rnd() * 3));
    m.count = (m.count || 0) + 1;
    m.p = clamp(m.p); m.a = clamp(m.a);
    m.stage = stageFor(m.count, m.i);
    m.lastActive = now; m.updatedAt = now;
    return m;
  }
  function moodLabel(m) {
    if (m.coldRounds > 0) return '还在闹点小脾气';
    if (m.a < 30) return '有点困';
    if (m.p < 40) return '有点不开心';
    if (m.p > 75) return '心情很好';
    return '轻松';
  }

  /* ---------------- 长期记忆：他说过的要紧话 ---------------- */
  function remember(state, text) {
    const t = String(text || '').trim();
    if (t.length < 8 || t.length > 60) return;
    if (!/我|今天|明天|昨天|下周|考试|上课|喜欢|讨厌|累|烦|想|家里|工作|同学|朋友|打算|准备/.test(t)) return;
    const notes = state.notes || [];
    if (notes.some((n) => n.text === t)) return;
    notes.push({ t: Date.now(), text: t.slice(0, 40) });
    state.notes = notes.slice(-80);
  }

  function recentNotes(state, n = 10) {
    return (state.notes || []).slice(-n).map((x) => x.text);
  }

  /** 从全部历史里按关键词翻出相关的旧对话（两三百条也翻得动） */
  function recall(state, query, limit = 4) {
    const q = String(query || '');
    if (q.length < 4) return [];
    const grams = new Set();
    for (let i = 0; i < q.length - 1; i++) {
      const g = q.slice(i, i + 2);
      if (/[\u4e00-\u9fa5a-zA-Z0-9]{2}/.test(g)) grams.add(g);
    }
    if (!grams.size) return [];

    const msgs = (state.msgs || []).filter((m) => m.kind === 'text');
    if (msgs.length <= 40) return [];
    const recent = new Set(msgs.slice(-22).map((m) => m.t));

    const hits = [];
    for (const m of msgs) {
      if (recent.has(m.t)) continue;
      let score = 0;
      for (const g of grams) if (String(m.text).includes(g)) score++;
      if (score >= 2) hits.push({ score, m });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit).map((h) => ({ who: h.m.who, text: h.m.text, t: h.m.t }));
  }


  function extractFacts(text, facts) {
    const f = Object.assign({}, facts || {});
    let m;
    if ((m = text.match(/(?:我叫|叫我)\s*([^\s，。！!？?\n]{1,10})/))) f['称呼'] = m[1];
    if ((m = text.match(/((?:周|星期)[一二三四五六日天][^。！!?？\n]{0,30}(?:早八|上课|有课|满课|课))|(?:早八|满课)/))) f['课表'] = m[0].slice(0, 24);
    if ((m = text.match(/(不吃|爱吃|喜欢吃|能吃|不能吃|讨厌吃)\s*([^\s，。！!?？\n]{1,12})/))) f['口味'] = m[1] + m[2];
    if ((m = text.match(/(?:生日是|生日|纪念日是)\s*([0-9一二三四五六七八九十]{1,2}\s*月?\s*[0-9一二三四五六七八九十]{1,2}\s*[日号]?)/))) f['纪念日'] = m[1];
    if ((m = text.match(/(?:考研|考试|期末|论文|实习|加班)/))) f['最近忙'] = m[0];
    if ((m = text.match(/(?:喜欢|在玩|玩)\s*([^\s，。！!?？\n]{1,10}(?:游戏|原神|王者|LOL|星铁))/))) f['游戏'] = m[1];
    return f;
  }
  const FACT_LABEL = { 称呼: '叫你', 课表: '课表', 口味: '口味', 纪念日: '日子', 最近忙: '最近', 游戏: '在玩', 爱好: '喜欢', 在忙: '在忙' };

  function updateSummary(state) {
    const topics = (state.summary && state.summary.topics) || [];
    const said = state.msgs.filter((x) => x.who === 'me' && x.kind === 'text').slice(-3);
    const parts = [];
    if (topics.length) parts.push('最近聊到：' + topics.slice(-6).join('、'));
    if (said.length) parts.push('他最近说的：' + said.map((m) => m.text.slice(0, 22)).join(' / '));
    const text = parts.join('；');
    return { text: text || '刚认识，还没聊太多', topics: topics.slice(-8), at: Date.now() };
  }

  /* ---------------- 生活 ---------------- */
  const LIFE_POOL = {
    morning: [
      ['07:42', '闹钟响了三遍才爬起来'],
      ['08:03', '早八路上买了个茶叶蛋，差点噎着'],
      ['08:35', '教室最后一排，前面人挡得我什么都看不见'],
      ['09:10', '困得把笔掉地上两次'],
      ['10:20', '课间去买水，碰到室友在楼梯口吃辣条'],
      ['09:40', '老师点名点到我，答了声到手都在抖'],
      ['11:10', '把昨天没画完的速写补了两笔，还是丑']
    ],
    noon: [
      ['11:50', '食堂番茄牛腩，牛肉老得能打人'],
      ['12:20', '排队二十分钟，打到最后一个鸡腿'],
      ['12:40', '和室友分了一份杨枝甘露，甜到齁'],
      ['13:05', '回宿舍路上被晒得睁不开眼'],
      ['12:55', '躺床上刷了半小时短视频，说好只看五分钟'],
      ['13:20', '在阳台给那盆多肉浇了点水，叶子有点蔫']
    ],
    afternoon: [
      ['14:30', '专业课老师讲得飞快，笔记没跟上'],
      ['15:40', '在图书馆占了个靠窗的位置，风一吹就困'],
      ['16:20', '刷到一个猫猫从沙发滑下去的视频，笑了好久'],
      ['17:00', '陪室友去快递站，她买了三个箱子'],
      ['15:10', '看了一集新番，男主太蠢了我直接跳过'],
      ['16:50', '画了半张画，线条全歪了，气死']
    ],
    evening: [
      ['18:30', '晚饭吃得太急，胃有点撑'],
      ['19:10', '操场走了两圈，风挺大的'],
      ['20:00', '玩了两把 2048，第二把 512 就死了'],
      ['20:50', '想点奶茶，看了半天还是没下单'],
      ['19:40', '刷到那个热搜了，评论区吵得比剧还好看'],
      ['21:10', '跟室友聊到高中，笑到打鸣']
    ],
    night: [
      ['21:30', '背单词背到 sleep，眼皮开始打架'],
      ['22:40', '洗澡水忽冷忽热，冻得我尖叫'],
      ['23:20', '躺床上刷视频，说明天一定早睡'],
      ['00:30', '室友还在打游戏，灯没关，烦'],
      ['23:50', '在写一个很小的故事，写了一半自己先笑了']
    ]
  };
  const SLOT = (h) => (h < 10 ? 'morning' : h < 14 ? 'noon' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'night');

  /* 她自己能起的话头：全是她的事，不是等他开口 */
  const TOPICS = [
    ['我最近在追一部剧，男主蠢得我想退订', '你平时看剧吗'],
    ['食堂新开了一个窗口，糖醋里脊居然不酸', '我今天吃了两份，有点撑'],
    ['那盆多肉好像真的不行了，叶子软趴趴的', '我可能真的不适合养东西'],
    ['我室友今天六点就起来背单词', '我佩服到失眠'],
    ['画了一天，最后发现透视全错', '我现在看着它就想哭'],
    ['刷到一个特别离谱的热搜', '评论区比事情本身还精彩'],
    ['今天专业课老师讲了两个小时他自己的故事', '一句重点没有'],
    ['我在想要不要报个画画的班', '但又觉得有点贵'],
    ['突然想吃火锅', '这个天气就该吃火锅'],
    ['我可能有点懒', '今天什么都没干，还挺开心'],
    ['刚看到一个猫猫从沙发滑下去的视频，笑了十分钟', '发给我室友她也笑疯了'],
    ['我今天在图书馆坐了一下午，一页都没看进去', '旁边那个人一直在抖腿']
  ];
  let lastTopicAt = 0;
  function openTopic() {
    const now = Date.now();
    if (now - lastTopicAt < 90000) return null;
    lastTopicAt = now;
    return pickFresh(TOPICS, 'topic').slice(0, 2);
  }

  function lifeFor(dateStr) {
    const r = seeded(hashStr('life' + dateStr));
    const out = [];
    ['morning', 'noon', 'afternoon', 'evening', 'night'].forEach((slot, idx) => {
      // 一天 3~6 件事，白天更密
      const density = 0.78 + (idx >= 1 && idx <= 3 ? 0.12 : 0);
      if (r() < density) {
        const pool = LIFE_POOL[slot];
        const e = pool[Math.floor(r() * pool.length)];
        out.push({ time: e[0], text: e[1], slot, mood: /烦|老|撑|尖叫|难受|死|气死|歪/.test(e[1]) ? 'bad' : 'ok' });
      }
    });
    return out;
  }

  /* 她此刻大概在干嘛：让界面上的状态是活的 */
  const ACTIVITY = {
    0: ['在宿舍，灯还亮着', '躺着刷手机，还没睡'],
    1: ['还没睡，躺着看天花板', '在跟你聊天，别的不想干'],
    2: ['这个点还没睡，有点离谱了'],
    7: ['刚爬起来，头发还乱着', '在食堂找吃的'],
    8: ['在去教室的路上', '早八，最后一排'],
    9: ['在上课，偷偷看手机', '在教室，人有点飘'],
    10: ['课间，在走廊吹风', '在买水'],
    11: ['快下课了，饿了', '在等下课铃'],
    12: ['在食堂排队', '吃饭吃到一半'],
    13: ['在宿舍躺着', '刷手机，说好只睡十分钟'],
    14: ['在上课，或者应该在', '在图书馆占位'],
    15: ['在图书馆，困', '在上专业课'],
    16: ['刚下课，在回宿舍', '在操场附近晃'],
    17: ['在食堂或者在校门口', '纠结吃什么'],
    18: ['在吃饭', '在宿舍歇着'],
    19: ['在操场走圈', '在追剧'],
    20: ['在宿舍，闲', '在看视频'],
    21: ['在写作业或者画画', '刷到好笑的'],
    22: ['在洗漱', '在背单词'],
    23: ['在宿舍待着', '躺床上看手机']
  };
  function activity(now = new Date()) {
    const h = new Date(now).getHours();
    const pool = ACTIVITY[h] || ACTIVITY[0];
    const r = seeded(hashStr('act' + dayKey(now) + h));
    return pool[Math.floor(r() * pool.length)];
  }
  function occurredLife(life, now = new Date()) {
    const today = dayKey(now);
    if (!life || life.date !== today) return [];
    const cur = hm(now);
    return life.events.filter((e) => e.time <= cur);
  }
  function ensureLife(state, now = new Date()) {
    const today = dayKey(now);
    if (!state.life || state.life.date !== today) {
      state.life = { date: today, events: lifeFor(today), carried: (state.life && state.life.carried) || [] };
      const bad = (state.life.events || []).filter((e) => e.mood === 'bad')[0];
      state.life.carried = bad ? [bad.text] : [];
    }
    return state.life;
  }

  /* ---------------- 回复模板 ---------------- */
  const T = {
    greeting: {
      open: ['欸，你来啦', '在呢在呢', '刚好想找个人说话', '嗯？我在的'],
      follow: ['今天怎么样呀', '吃过了没', '在忙吗', '外面冷不冷']
    },
    tired: {
      open: ['辛苦啦', '哎哟，又这么累', '你今天是不是跑太多地方了', '听着就累'],
      follow: ['饭吃了没呀，别又饿着肚子硬扛QAQ', '快去歇会儿', '还剩几节课', '别硬撑着，先坐一会儿']
    },
    food: {
      open: ['一说吃的我也饿了', '吃什么呀', '食堂还是外卖', '啊，我也想吃'],
      follow: ['别光吃泡面哦', '有没有肉', '给我看看', '少吃点辣，你胃又不好']
    },
    laugh: {
      open: ['哈哈哈你在笑什么', '什么事这么好笑', '我也想知道', '说来听听'],
      follow: ['别自己一个人乐', '我也想笑', '笑点这么低的吗']
    },
    sad: {
      open: ['欸，怎么啦', '谁惹你了', '我在这儿', '听起来不太好'],
      follow: ['慢慢讲，不着急', '不想说也没关系', '抱一下', '那要不要先别想了']
    },
    praise: {
      open: ['欸，谁教你这么说的', '你少来', '我脸有点热', '……你今天怎么这么会说话'],
      follow: ['不跟你说了', '再夸要飘了', '真的假的呀']
    },
    angry: {
      open: ['……', '你凶我', '行吧', '哦'],
      follow: ['我先不说话了', '让我缓一会儿']
    },
    ai: {
      open: ['哈？', '你才AI呢', '怎么又问这个', '唔，听不懂你在说什么'],
      follow: ['不理你了哼', '你是不是故意逗我']
    },
    sleep: {
      open: ['这么晚还醒着', '快睡吧', '明天再聊也一样', '眼睛都睁不开了吧'],
      follow: ['别看手机了', '晚安', '被子盖好']
    },
    morning: {
      open: ['早呀', '起这么早', '我也刚醒', '嗯，早'],
      follow: ['今天第一节有课吗', '早饭吃了吗', '外面冷不冷']
    },
    bored: {
      open: ['我也在发呆', '有点无聊', '躺着呢', '正想找你'],
      follow: ['要不出去走走', '你今天干嘛了', '陪我聊会儿']
    },
    weather: {
      open: ['外面确实冷', '今天风好大', '这几天降温了', '冷得我手都不想伸出来'],
      follow: ['多穿点，别硬扛', '带伞没', '别穿那么点']
    },
    weather_hot: {
      open: ['热死了', '这天气出门就是受刑', '晒得我睁不开眼'],
      follow: ['少在外面溜达', '多喝点水', '别中暑了啊']
    },
    weather_rain: {
      open: ['下雨了？', '外面湿乎乎的', '这雨下得没完没了'],
      follow: ['带伞没', '别淋着', '路上小心点']
    },
    question: {
      open: ['嗯…', '这个嘛', '让我想想', '欸？'],
      follow: ['你怎么突然问这个', '你呢', '我也不太确定']
    },
    intro: {
      open: ['欸，好呀', '嗯，记住了', '原来你叫这个'],
      follow: ['那我叫你云烟咯', '还挺好听的', '以后就这么叫了']
    },
    schedule: {
      open: ['又是早八嘛', '早八啊…', '听着就困'],
      follow: ['我闹钟都要响三遍才肯起', '那你几点起呀', '记得吃点东西再去']
    },
    taste: {
      open: ['记下了', '哦？', '真的假的'],
      follow: ['下次点菜我帮你挑', '那我也不吃这个了', '你挑食还挺严重']
    },
    leave: {
      open: ['去吧', '嗯，去吧', '好，那你先忙', '行'],
      follow: ['洗完早点睡', '回来跟我说一声', '我等你', '别忘了回我']
    },
    generic: {
      open: ['嗯嗯', '然后呢', '真的假的', '欸，展开说说', '我听着呢', '哦哦', '这样啊', '啊这', '嗯，我在'],
      follow: ['后来呢', '那你现在怎么样', '继续说呀', '听起来还行', '那挺好', '']
    }
  };

  const COLD = [
    ['哼', '我还没消气呢', '先让我缓一会儿'],
    ['……', '不想理你'],
    ['你还知道找我'],
    ['哦', '嗯']
  ];
  const THAW = [
    ['哼…算了', '不跟你计较'],
    ['好吧', '看在你主动找我的份上'],
    ['……', '说吧，什么事']
  ];
  const SLEEPY = [
    ['唔，眼皮开始打架了', '晚安呀，明天再聊'],
    ['好困……', '我撑不住了', '你也早点睡']
  ];

  const AI_DEFLECT = [
    ['哈？', '你才AI呢', '不理你了哼'],
    ['怎么又问这个…', '我要是AI，能记得你早八迟到吗'],
    ['唔，听不懂你在说什么', '换一个话题嘛']
  ];

  function intentOf(text) {
    const t = text.trim();
    if (/^(在吗|在不在|在嘛|嗨|hi|哈喽|你好|hey|早|早安)[\s!！。.~]*$/i.test(t)) return 'greeting';
    if (/AI|人工智能|机器人|真人吗|是不是人|虚拟/i.test(t)) return 'ai';
    if (/滚|闭嘴|烦死|讨厌你|走开/.test(t)) return 'angry';
    if (/(我叫|我是|叫我)[^\s，。！!？?\n]{1,10}/.test(t)) return 'intro';
    if (/(?:周|星期)[一二三四五六日天].{0,12}(?:早八|上课|有课|满课)|^早八|满课/.test(t)) return 'schedule';
    if (/洗澡|洗漱|去睡|我先睡|出门了|去吃饭了|下线|先撤|去忙|上课去了/.test(t)) return 'leave';
    if (/(不吃|爱吃|喜欢吃|能吃|不能吃|讨厌吃)/.test(t)) return 'taste';
    if (/可爱|好棒|喜欢你|厉害|漂亮|乖/.test(t)) return 'praise';
    if (/睡|晚安|困了|熬夜|失眠/.test(t)) return 'sleep';
    if (/饿|吃|食堂|外卖|奶茶|火锅|夜宵|喝|饭|辣|甜|咸/.test(t)) return 'food';
    if (/难过|烦|不开心|emo|难受|想哭|委屈|压力/.test(t)) return 'sad';
    if (/哈哈|笑死|太好笑|笑疯|裂开/.test(t)) return 'laugh';
    if (/累|忙|下课|上课|作业|考试|加班/.test(t)) return 'tired';
    if (/无聊|在干嘛|干什么|干嘛呢/.test(t)) return 'bored';
    if (/下雨|雨/.test(t)) return 'weather_rain';
    if (/热|晒|高温/.test(t)) return 'weather_hot';
    if (/冷|降温|风大|天气/.test(t)) return 'weather';
    if (/想你|想见你|想抱/.test(t)) return 'praise';
    if (/[?？]$|吗$|呢$|什么|怎么|为什么|多少/.test(t)) return 'question';
    return 'generic';
  }

  function stickerFor(intent, m) {
    const map = {
      greeting: ['happy', 'love'], tired: ['tired'], food: ['happy'], laugh: ['happy', 'roll'],
      sad: ['sad'], praise: ['shy'], angry: ['angry', 'back'], ai: ['question', 'back'],
      sleep: ['sleepy', 'night'], morning: ['happy'], bored: ['roll', 'question'],
      weather: ['question'], question: ['confused'], generic: ['happy', 'proud'],
      intro: ['love', 'happy'], schedule: ['sleepy', 'sad'], taste: ['question', 'happy'],
      thaw: ['back', 'angry'], cold: ['back']
    };
    const pool = map[intent] || ['happy'];
    const key = pick(pool);
    const ids = STICKER_FOR[key] || ['happy'];
    return pick(ids);
  }

  /* ---------------- 组句 ---------------- */
  function compose(text, state, opts) {
    opts = opts || {};
    const now = new Date();
    const m = state.mood;
    const h = now.getHours();
    const facts = state.facts || {};
    const life = occurredLife(state.life, now);
    const intent = opts.intent || intentOf(text);

    // 冷却中
    if (m.coldUntil && Date.now() < m.coldUntil) {
      const parts = pickFresh(COLD, 'cold').slice(0, 2);
      return { parts, sticker: 'back', intent: 'cold' };
    }
    // 刚消气：先甩一句，再正常聊
    if (m.coldUntil && Date.now() >= m.coldUntil) {
      m.coldUntil = 0;
      m.coldRounds = Math.max(0, (m.coldRounds || 0) - 1);
      if (rnd() < 0.75) return { parts: pickFresh(THAW, 'thaw'), sticker: null, intent: 'thaw' };
    }
    if (m.a < 26 && /^(嗯|哦|好|在)$/.test(text.trim())) {
      const parts = pick(SLEEPY).slice(0, 2);
      return { parts, sticker: 'sleepy', intent: 'sleepy' };
    }
    // 被敷衍（还没到生气那一步）
    if (isLazy(text) && m.shortStreak === 1 && rnd() < 0.6) {
      return {
        parts: pickFresh([['……', '你是不是在忙'], ['哦，那我不说了'], ['嗯', '那你先忙'], ['你是不是不想理我']], 'lazy'),
        sticker: 'sad', intent: 'lazy'
      };
    }
    if (intent === 'ai') {
      return { parts: pick(AI_DEFLECT), sticker: 'question', intent };
    }

    // 他说的话很短、或者根本没内容 —— 她才自己起话头，不能抢话
    const shortMsg = isLazy(text) || [...text.trim()].length <= 6;
    const topicChance = shortMsg ? 1 : (intent === 'generic' ? 0.28 : 0);
    if ((intent === 'generic' || intent === 'bored') && topicChance && rnd() < topicChance) {
      const hotList = (state.hot && state.hot.items) || [];
      if (hotList.length && rnd() < 0.45) {
        const h = pick(hotList);
        return {
          parts: ['刚刷到' + h, pick(['挺离谱的', '你看这个', '笑死我了', '现在什么事都有'])],
          sticker: null,
          intent: 'hot'
        };
      }
      const t = openTopic();
      if (t) {
        let parts = t.slice();
        if (intent === 'bored' && rnd() < 0.6) {
          const a = activity(now);
          parts = [/^在/.test(a) ? '我' + a : a].concat(parts);
        }
        return { parts, sticker: null, intent: 'topic' };
      }
    }

    const pack = T[intent] || T.generic;
    const parts = [];
    parts.push(pickFresh(pack.open, intent + 'o'));

    // 70% 追问；精力低时更容易不追问；生疏阶段更少追问
    const followChance = m.a < 38 ? 0.45 : (m.stage === '生疏' ? 0.5 : 0.62);
    let follow = '';
    if (rnd() < followChance) {
      follow = pickFresh(pack.follow, intent + 'f');
    }

    // 她自己的生活：两三句里就会冒一句，但别老说同一件
    if (life.length && rnd() < 0.46) {
      const cands = life.slice(-4);
      const texts = cands.map((x) => x.text);
      const chosen = pickFresh(texts, 'life');
      const e = cands.find((x) => x.text === chosen) || cands[0];
      const lead = rnd() < 0.5 ? '今天' : '我刚';
      follow = lead + e.text;
      parts.push(follow);
      return finish(parts, intent, m);
    }

    // 引用事实（约 15%，且没有现成追问时才提）
    if (!follow && rnd() < 0.22) {
      if (facts['课表'] && /早八|课/.test(facts['课表'])) follow = '你不是早八嘛，中午有没有补一觉';
      else if (facts['口味']) follow = '记得你' + facts['口味'] + '，别乱吃啊';
    }
    if (follow) parts.push(follow);

    // 深夜/清晨的语气补丁
    if (h >= 23 || h < 3) parts.push(pick(['……都几点了', '你今天睡得也太晚了']));

    return finish(parts, intent, m);
  }

  let lastStickerId = null;
  let lastStickerAt = 0;

  const EMOJI = ['😂', '🥺', '😴', '😭', '🤔', '😅', '🙈', '✨', '🫠', '😌', '🥹'];
  const KAOMOJI = ['(´･ω･ˋ)', '(///▽///)', '>_<', '0v0', '(๑•̀ㅂ•́)و✧'];

  function finish(parts, intent, m) {
    const out = [];
    for (const p of parts) {
      if (!p) continue;
      // 单条超 25 字则切分
      const chars = [...p];
      if (chars.length <= 25) out.push(p);
      else { out.push(chars.slice(0, 25).join('')); out.push(chars.slice(25, 50).join('')); }
      if (out.length >= 3) break;
    }
    // 偶尔挂一个 emoji 或颜文字，像真人随手打上去的
    if (out.length && rnd() < 0.4) {
      const i = out.length - 1;
      const mark = rnd() < 0.55 ? pick(EMOJI) : pick(KAOMOJI);
      if (!/[a-zA-Z]$/.test(out[i])) out[i] = out[i] + ' ' + mark;
    }
    let sticker = null;
    const minStage = { 生疏: 0.14, 熟络: 0.26, 黏人: 0.32, 离不开: 0.38 };
    const rate = minStage[(m && m.stage) || '生疏'] || 0.14;
    if (rnd() < rate) {
      const s = stickerFor(intent, m);
      // 同一张不要连发
      if (!(s === lastStickerId && Date.now() - lastStickerAt < 6 * 60000)) {
        sticker = s;
        lastStickerId = s;
        lastStickerAt = Date.now();
      }
    }
    return { parts: out.slice(0, 3), sticker, intent };
  }

  /* ---------------- 节奏 ---------------- */
  function splitReply(value) {
    return String(value)
      .replace(/<\/?think>[\s\S]*?(<\/think>|$)/g, '')
      .replace(/[#*_~`]/g, '')
      .split(/[|]+|\n+/)
      .map((x) => x.trim())
      .filter((x) => x && /[\u4e00-\u9fa5a-zA-Z0-9]/.test(x))
      .flatMap((p) => {
        const c = [...p];
        if (c.length <= 25) return [p];
        const o = [];
        for (let i = 0; i < c.length && o.length < 3; i += 25) o.push(c.slice(i, i + 25).join(''));
        return o;
      })
      .slice(0, 3);
  }
  function rhythm(text) {
    return {
      typing: Math.min(2600, 700 + [...text].length * 32 + rnd() * 400),
      late: rnd() < 0.05 ? 8000 + rnd() * 12000 : 0
    };
  }
  function partDelay(text) {
    return Math.round([...text].length * (90 + rnd() * 70) + rnd() * 320);
  }

  /* ---------------- 时间戳 ---------------- */
  function stamp(t) {
    const d = new Date(t), n = new Date();
    const same = dayKey(d) === dayKey(n);
    const y = new Date(n.getTime() - 86400000);
    const isY = dayKey(d) === dayKey(y);
    const tStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (same) return tStr;
    if (isY) return '昨天 ' + tStr;
    return `${d.getMonth() + 1}月${d.getDate()}日 ${tStr}`;
  }

  return {
    clamp, rnd, pick, pickFresh, hashStr, seeded, dayKey, hm, WEEK, pad,
    isQuiet, mealNow, initialMood, relaxMood, interact, moodLabel, stageFor,
    extractFacts, FACT_LABEL, updateSummary, remember, recentNotes, recall,
    lifeFor, occurredLife, ensureLife, activity,
    compose, intentOf, splitReply, rhythm, partDelay, stamp,
    T, stickerFor
  };
})();

if (typeof window !== 'undefined') window.Core = Core;
