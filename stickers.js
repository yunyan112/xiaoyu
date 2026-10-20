/* 余小渔 · 贴纸目录
 * 11 张：正面立绘差分 8 张 + 背影 1 张 + 动态 2 张
 */
const STICKERS = [
  { id: '01_happy',  file: 'stickers/01_happy.png',  emo: 'happy',   label: '开心' },
  { id: '02_shy',    file: 'stickers/02_shy.png',    emo: 'shy',     label: '害羞' },
  { id: '03_angry',  file: 'stickers/03_angry.png',  emo: 'angry',   label: '生气' },
  { id: '04_sad',    file: 'stickers/04_sad.png',    emo: 'sad',     label: '委屈' },
  { id: '05_sleepy', file: 'stickers/05_sleepy.png', emo: 'sleepy',  label: '好困' },
  { id: '06_proud',  file: 'stickers/06_proud.png',  emo: 'proud',   label: '得意' },
  { id: '07_question', file: 'stickers/07_question.png', emo: 'question', label: '问号' },
  { id: '08_night',  file: 'stickers/08_night.png',  emo: 'night',   label: '睡了' },
  { id: '10_turnback', file: 'stickers/10_turnback.png', emo: 'back', label: '不理你' },
  { id: '11_roll',   file: 'stickers/11_roll.png',   emo: 'roll',    label: '打滚' },
  { id: '12_love',   file: 'stickers/12_love.png',   emo: 'love',    label: '比心' },
  { id: '13_side',   file: 'stickers/13_side.png',   emo: 'side',    label: '在看你' },
  { id: '14_peek',   file: 'stickers/14_peek.png',   emo: 'peek',    label: '盯' }
];

const STICKER_BY_EMO = STICKERS.reduce((m, s) => (m[s.emo] = s, m), {});

/* 情绪 → 可用贴纸（一个情绪配 1~2 张，避免每次都是同一张） */
const STICKER_FOR = {
  happy:   ['happy', 'love'],
  shy:     ['shy', 'love'],
  angry:   ['angry'],
  sad:     ['sad'],
  sleepy:  ['sleepy', 'night'],
  proud:   ['proud', 'happy'],
  confused: ['question', 'peek', 'roll'],
  missing: ['back', 'side', 'roll'],
  love:    ['love', 'shy'],
  tired:   ['sleepy'],
  sorry:   ['sad']
};
