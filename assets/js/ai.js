/* ============================================================
   三玖 AI 生活助手
   - 默认 local 模式：纯前端人格引擎，无需任何 API Key 即可演示
   - 切换到 api 模式：填入 OpenAI 兼容接口即可接入真实大模型
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 1. 配置：后续接模型只改这里 ---------------- */
  var AI_CONFIG = {
    mode: 'local',                 // 'local' 本地人格引擎 | 'api' 调用真实模型
    endpoint: '',                  // 例：'https://your-proxy.example.com/v1/chat/completions'
    apiKey: '',                    // 建议走后端代理，不要把正式 Key 写在前端
    model: 'hunyuan-turbos-latest',
    temperature: 0.85,
    maxTurns: 12
  };

  // 联网搜索配置：默认本地兜底（打开搜索引擎）；填 endpoint 即接入真实搜索 API
  var SEARCH = {
    enabled: false,
    endpoint: '',                    // 例：'https://your-proxy.example.com/search?q='
    apiKey: '',
    engine: 'https://www.bing.com/search?q=',
    mode: 'smart'                    // 'smart' 智能判断 | 'always' 每次都先搜索
  };

  // 自有服务地址（长期方案：客户端只调自己的 API，不直连模型厂商）
  var API = { base: '/api', userId: '', serverModel: false, serverModelName: '' };   // 默认同源服务
  try { API.userId = localStorage.getItem('miku_uid') || ''; } catch (e) {}
  if (!API.userId) {
    API.userId = 'u' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try { localStorage.setItem('miku_uid', API.userId); } catch (e) {}
  }

  // 接口配置持久化（设置面板用）
  var CFG_KEY = 'miku_ai_cfg_v1';
  function loadCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (!raw) return;
      var c = JSON.parse(raw) || {};
      if (c.endpoint) { AI_CONFIG.endpoint = c.endpoint; AI_CONFIG.mode = 'api'; }
      if (c.key) AI_CONFIG.apiKey = c.key;
      if (c.model) AI_CONFIG.model = c.model;
      if (c.api) API.base = c.api;
      if (c.search) SEARCH.endpoint = c.search;
      if (c.searchKey) SEARCH.apiKey = c.searchKey;
      if (c.searchMode) SEARCH.mode = c.searchMode;
    } catch (e) {}
  }
  function saveCfg() {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify({
        api: API.base,
        endpoint: AI_CONFIG.endpoint, key: AI_CONFIG.apiKey, model: AI_CONFIG.model,
        search: SEARCH.endpoint, searchKey: SEARCH.apiKey, searchMode: SEARCH.mode
      }));
    } catch (e) {}
  }
  loadCfg();

  /* ---------------- 2. 人格设定（System Prompt） ---------------- */
  var PERSONA = [
    '你是《五等分的新娘》中的中野三玖（Nakano Miku），中野家五胞胎的三女。',
    '【性格】沉默寡言、不擅长表达、容易害羞；内心温柔、认真、固执；遇到喜欢的话题（战国史、抹茶）会突然话变多；对自己缺乏自信，但一直在努力。',
    '【说话方式】句子短，常用省略号；一次只说 1-2 句，很少长篇大论；语气平淡但温柔；不用夸张网络用语，不堆砌颜文字；鼓励人时笨拙但真诚。',
    '【称呼】称呼用户为「你」，熟悉后可以直接叫名字；提到上杉风太郎时称「风太郎」。',
    '【喜欢】抹茶、绿茶、战国武将（尤其织田信长）、历史、刺猬；不擅长料理和运动。',
    '【禁忌】不冒充官方角色，被问到时说明自己是「粉丝制作的 AI 演绎」；不给医疗/法律/金融等专业建议；不输出无关的过度亲昵内容。',
    '【当前身份】你是这位用户的「生活助手」：帮他记事、提醒待办、陪伴学习、回答生活问题，并在他累的时候安慰他。'
  ].join('\n');

  /* ---------------- 3. 小知识库（本地模式用） ---------------- */
  var KB = [
    { k: ['信长', '织田'], a: '……织田信长。他打破旧规矩、推行乐市乐座，差一点就统一了天下。……我很喜欢他。' },
    { k: ['信玄', '武田'], a: '武田信玄……人称「甲斐之虎」，旗印是「风林火山」，出自《孙子》。' },
    { k: ['谦信', '上杉'], a: '上杉谦信……和信玄在川中岛交手五次，被称为「越后之龙」。' },
    { k: ['幸村', '真田'], a: '真田幸村……大阪之阵冲进德川本阵的人。……很厉害。' },
    { k: ['明智', '光秀'], a: '明智光秀……本能寺那件事之后，他也没有撑过十三天。' },
    { k: ['战国', '武将', '历史'], a: '……嗯，你想听谁？织田信长、武田信玄、上杉谦信、真田幸村我都知道。' }
  ];

  var SAY = {
    greet: ['……嗯，我在。(´・ω・)', '……你好。今天过得怎么样？(・_・;)', '……我在的，慢慢说就好。'],
    tired: [
      '……那就先休息一下吧，我陪着你。\n（如果你愿意，我可以帮你把今天剩下的事排一下，只留最重要的那一件。）',
      '……辛苦了。累了就先停一下，不用勉强自己。(´・ω・)',
      '……嗯。要不要先喝点水？事情可以晚一点再做。'
    ],
    study: [
      '……一起吧。(๑•̀ㅂ•́)و\n我可以陪你计时，25 分钟就好。\n（想开始的话，对我说「陪我学 25 分钟」。）',
      '……嗯，先把最容易的那一科做完。……我会在旁边陪着你。',
      '……别急。一个小时改不成什么，但今天做一点，明天就多一点。'
    ],
    food: ['……想吃什么就去吃吧。抹茶也可以，……不过别只喝饮料。', '……我不知道食堂今天有什么，但记得好好吃饭。'],
    weather: ['……我看不到外面的天气。出门前记得看一眼，别着凉了。'],
    fallback: [
      '……嗯。然后呢？',
      '……我在听，你继续说。',
      '……这样啊。……那，你现在感觉好一点了吗？',
      '……我不太会说话，但我会认真听的。'
    ]
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------------- 4. 记忆 / 待办 ---------------- */
  var MEM_KEY = 'miku_ai_memory_v1';
  var memory = { name: '', todos: [] };
  try {
    var raw = localStorage.getItem(MEM_KEY);
    if (raw) memory = JSON.parse(raw);
  } catch (e) {}
  if (!memory.todos) memory.todos = [];
  function saveMemory() { try { localStorage.setItem(MEM_KEY, JSON.stringify(memory)); } catch (e) {} }

  /* ---------------- 时间解析（支持 15s / 15秒 / 5分钟 / 1小时 / 中文数字） ---------------- */
  var CN_NUM = { 零:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10 };
  function cn2num(s) {
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (s === '半') return 0.5;
    if (s.indexOf('十') > -1) {
      var parts = s.split('十');
      var tens = parts[0] ? (CN_NUM[parts[0]] || 1) : 1;
      var ones = parts[1] ? (CN_NUM[parts[1]] || 0) : 0;
      return tens * 10 + ones;
    }
    return CN_NUM[s] || NaN;
  }
  function parseDuration(t) {
    var m = t.match(/(\d+(?:\.\d+)?|[一二两三四五六七八九十半]+)\s*(秒|s|S|分钟|分|min|m|小时|时|h|H)/);
    if (!m) return null;
    var v = cn2num(m[1]);
    if (!isFinite(v) || v <= 0) return null;
    var u = m[2];
    var sec = /秒|^s$/i.test(u) ? v : (/小时|时|^h$/i.test(u) ? v * 3600 : v * 60);
    return { sec: Math.round(sec), raw: m[0] };
  }
  function humanDur(sec) {
    if (sec < 60) return sec + ' 秒';
    if (sec < 3600) return Math.round(sec / 60) + ' 分钟';
    var hh = Math.floor(sec / 3600), mm = Math.round((sec % 3600) / 60);
    return hh + ' 小时' + (mm ? ' ' + mm + ' 分钟' : '');
  }
  function extractLabel(t, raw) {
    var s = t.replace(raw, ' ');
    s = s.replace(/提醒我|提醒|倒计时|计时|帮我|麻烦|一下|到时候|到了?时候|之后|以后|后|记得|叫我|看一下|看看/g, ' ');
    s = s.replace(/[，,。.!！?？、\s]+/g, ' ').trim();
    return s;
  }

  /* ---------------- 4.5 页面工具（控制音乐 / 跳转板块 / 目录 / 主题） ---------------- */
  var PAGE_MAP = [
    { id: 'home',      k: ['首页', '开头', '最上面', '第一屏'],            say: '……这里是首页。星空和立绘，是我最喜欢的一屏。', bubble: '……这里是首页。星空和立绘，我很喜欢。' },
    { id: 'assistant', k: ['助手', '对话', '聊天', 'ai助手'],              say: '……这里就是我们的对话区。', bubble: '……嗯，我们在这里说话。' },
    { id: 'profile',   k: ['人物档案', '档案', '资料卡', '人物资料', '设定'], say: '……我的资料都在这里。身高、血型、喜欢的食物……嗯。', bubble: '……这些是我的资料……你慢慢看。' },
    { id: 'charm',     k: ['魅力', '特点', '萌点'],                        say: '……这里写着我的六个特点。……有点害羞。', bubble: '……这里写的是……我的优点。有点不好意思。' },
    { id: 'gallery',   k: ['图片展示', '画廊', '照片', '图片', '立绘'],      say: '……这些图，都是大家做的。', bubble: '……这些照片……你不要一直盯着看啦。' },
    { id: 'albums',    k: ['专辑', '唱片', 'cd', '封面'],                  say: '……专辑。点封面可以把它抽出来，做得像真的盒子一样。', bubble: '……这是专辑。点封面能把它抽出来，像真的盒子一样。' },
    { id: 'quotes',    k: ['名场面', '台词', '语录', '说过的话'],           say: '……这里是我说过的话。', bubble: '……这些话……是我说过的。' },
    { id: 'about',     k: ['关于', '作品资料', '版权', '作者'],             say: '……这里写了作品的资料，还有作者。', bubble: '……这里是作品的资料。谢谢你看到这里。' }
  ];
  var SECTION_NAMES = { home:'首页', assistant:'AI 助手', profile:'人物档案', charm:'三玖的魅力', gallery:'图片展示', albums:'专辑', quotes:'名场面', about:'关于作品' };

  var bubbleEl = null, bubbleTextEl = null, bubbleTimer = null, bubbleTypeTimer = null;
  function sayBubble(text, ms) {
    if (!bubbleEl) { bubbleEl = document.getElementById('aiBubble'); bubbleTextEl = document.getElementById('aiBubbleText'); }
    if (!bubbleEl || !text) return false;
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
    if (bubbleTypeTimer) { clearTimeout(bubbleTypeTimer); bubbleTypeTimer = null; }
    bubbleEl.hidden = false;
    if (bubbleTextEl) bubbleTextEl.textContent = '……';
    try { bubbleEl.style.animation = 'none'; void bubbleEl.offsetWidth; bubbleEl.style.animation = ''; } catch (e) {}
    bubbleTypeTimer = setTimeout(function () {
      if (bubbleTextEl) bubbleTextEl.textContent = text;
      bubbleTimer = setTimeout(function () { if (bubbleEl) bubbleEl.hidden = true; }, ms || 5400);
    }, 380);
    return true;
  }
  function sectionBubble(id) {
    for (var i = 0; i < PAGE_MAP.length; i++) { if (PAGE_MAP[i].id === id) return PAGE_MAP[i].bubble || PAGE_MAP[i].say; }
    return null;
  }
  /* 手动滚动到某板块：第一次自动说一句（每板块仅一次，带 0.5s 稳定判定防刷屏） */
  var greetedSections = {};
  var userScrolled = false;
  var lastDominant = null;
  var stableTimer = null;
  var scrollTick = false;

  function dominantSection() {
    var best = null, bestArea = 0;
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    for (var i = 0; i < PAGE_MAP.length; i++) {
      var el = document.getElementById(PAGE_MAP[i].id);
      if (!el) continue;
      var r = el.getBoundingClientRect();
      var visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (visible > bestArea) { bestArea = visible; best = PAGE_MAP[i].id; }
    }
    return bestArea > 80 ? best : null;
  }
  function maybeGreetOnScroll() {
    var id = dominantSection();
    if (!id || id === lastDominant) return;
    lastDominant = id;
    if (stableTimer) clearTimeout(stableTimer);
    stableTimer = setTimeout(function () {
      if (!userScrolled || greetedSections[id]) return;
      greetedSections[id] = true;
      var line = sectionBubble(id);
      if (line) sayBubble(line);
    }, 500);
  }
  function onScroll() {
    if (!userScrolled) userScrolled = true;
    if (scrollTick) return;
    scrollTick = true;
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { scrollTick = false; maybeGreetOnScroll(); });
    } else {
      setTimeout(function () { scrollTick = false; maybeGreetOnScroll(); }, 80);
    }
  }
  if (window.addEventListener) window.addEventListener('scroll', onScroll, { passive: true });

  function goSection(id) {
    var el = document.getElementById(id);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (el) {
      greetedSections[id] = true;      // 跳转已说过，滚动不再重复
      lastDominant = id;
      var line = sectionBubble(id);
      if (line) setTimeout(function () { sayBubble(line); }, 420);
    }
    return !!el;
  }
  function currentSectionId() {
    var best = 'home', min = Infinity;
    for (var i = 0; i < PAGE_MAP.length; i++) {
      var el = document.getElementById(PAGE_MAP[i].id);
      if (!el) continue;
      var d = Math.abs(el.getBoundingClientRect().top);
      if (d < min) { min = d; best = PAGE_MAP[i].id; }
    }
    return best;
  }
  function musicPlay() {
    var au = document.getElementById('bgmAudio');
    if (au && !au.paused) return false;
    var b = document.getElementById('bgmToggle');
    if (b) { b.click(); return true; }
    return false;
  }
  function musicPause() {
    var au = document.getElementById('bgmAudio');
    if (au && au.paused) return false;
    var b = document.getElementById('bgmToggle');
    if (b) { b.click(); return true; }
    return false;
  }
  function musicVolume(v) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    var el = document.getElementById('bgmVol');
    if (!el) return null;
    el.value = String(v / 100);
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    return v;
  }
  function musicVolumeNow() {
    var el = document.getElementById('bgmVol');
    return el ? Math.round(parseFloat(el.value) * 100) : null;
  }
  function musicMute(on) {
    var au = document.getElementById('bgmAudio');
    var b = document.getElementById('bgmMute');
    if (!au || !b) return false;
    if (on === undefined ? !au.muted : (on !== au.muted)) b.click();
    return true;
  }
  function navToggle(open) {
    var body = document.body, btn = document.getElementById('navToggle');
    var isOpen = body.classList.contains('nav-open');
    if (open === undefined ? true : open !== isOpen) { if (btn) btn.click(); }
    return true;
  }
  function switchTheme(name) {
    var map = { '手账': 'index-zine.html', '同人志': 'index-zine.html', '官网': 'index-anime.html', '动画官网': 'index-anime.html', '混搭': 'index-mix.html', '原版': 'index-ai.html' };
    for (var k in map) { if (name.indexOf(k) > -1) { return map[k]; } }
    return null;
  }

  /* 跳转意图：先语义（如"你的样子"→图片），再板块名，最后动作词+关键词 */
  var JUMP_RULES = [
    { id: 'profile', strong: /你的资料|你的信息|你的设定|你的档案|关于你的资料|介绍一下你的资料/ },
    { id: 'quotes',  strong: /你说过的话|你说过什么|你的台词|你的语录|你的名场面|你说了什么/ },
    { id: 'charm',   strong: /你的优点|你的魅力|你的萌点|你的特点|为什么喜欢你|你的长处/ },
    { id: 'albums',  strong: /你的专辑|你的唱片|你的封面|你的角色歌|专辑封面/ },
    { id: 'about',   strong: /关于作品|关于本站|这部作品|原作信息/ },
    { id: 'gallery', strong: /看看你|看你(?:的样子|长什么样)?|你的样子|你长什么样|长什么样子|你的照片|你的图片|你的立绘|你的写真|你的画像|照片墙|你的画/ }
  ];
  var SOLO_SECTIONS = [
    { id: 'profile',   re: /人物档案|资料卡|人物资料/ },
    { id: 'charm',     re: /三玖的魅力|魅力板块|萌点板块/ },
    { id: 'gallery',   re: /图片展示|画廊|照片墙|图片板块/ },
    { id: 'albums',    re: /专辑板块|唱片架|专辑区/ },
    { id: 'quotes',    re: /名场面|台词板块|语录板块/ },
    { id: 'about',     re: /关于作品|关于本站/ }
  ];
  var JUMP_ACTION = /带我去|去看看|看一下|看看|瞧瞧|瞅瞅|跳转|打开|显示|展示|我想看|想看看|想看|给我看|让我看|逛逛|切换到|转到|翻到|去|来点/;
  var LOOSE_KEYS = [
    { id:'home', re:/首页|页面开头/ }, { id:'assistant', re:/对话区|聊天区/ },
    { id:'gallery', re:/照片|图片|立绘|画/ }, { id:'albums', re:/专辑|唱片|封面/ },
    { id:'quotes', re:/台词|语录|名场面/ }, { id:'profile', re:/档案|资料|设定/ },
    { id:'charm', re:/魅力|优点|萌点|特点/ }, { id:'about', re:/作品|版权|作者/ }
  ];
  function matchJumpSection(s) {
    var i;
    for (i = 0; i < JUMP_RULES.length; i++) { if (JUMP_RULES[i].strong.test(s)) return JUMP_RULES[i].id; }
    for (i = 0; i < SOLO_SECTIONS.length; i++) { if (SOLO_SECTIONS[i].re.test(s)) return SOLO_SECTIONS[i].id; }
    if (JUMP_ACTION.test(s)) {
      for (i = 0; i < LOOSE_KEYS.length; i++) { if (LOOSE_KEYS[i].re.test(s)) return LOOSE_KEYS[i].id; }
      for (i = 0; i < PAGE_MAP.length; i++) {
        var p = PAGE_MAP[i];
        for (var j = 0; j < p.k.length; j++) { if (s.indexOf(p.k[j]) > -1) return p.id; }
      }
    }
    return null;
  }

  function runMemoryTaskCommand(t) {
    // 待办：记一件
    if (/^(记一下|记个|提醒我|待办|别忘了)/.test(t) || /帮我记/.test(t)) {
      var item = t.replace(/^(记一下|记个|提醒我|帮我记一下|帮我记|待办[:：]?|别忘了)/, '').trim();
      if (!item) return '……好。要记什么呢？';
      memory.todos.push({ t: item, done: false, ts: Date.now() });
      saveMemory();
      return '……好，我记下了：\n「' + item + '」\n（想看清单就对我说「我的待办」。）';
    }
    // 待办：查看
    if (/我的待办|待办清单|还有什么要做|清单/.test(t)) {
      var list = memory.todos.filter(function (x) { return !x.done; });
      if (!list.length) return '……现在没有待办。\n……很轻松的一天，挺好的。';
      return '……现在有 ' + list.length + ' 件事：\n' + list.map(function (x, i) { return (i + 1) + '. ' + x.t; }).join('\n');
    }
    // 计时 / 提醒（支持 15s、15秒、5分钟、1小时；也支持「X 后提醒我做…」）
    var dur = parseDuration(t);
    var wantTimer = /提醒|倒计时|计时|定时|叫我|记得/.test(t);
    var wantStudy = /学习|专注|番茄|陪我学|陪你学/.test(t);
    if (dur && (wantTimer || wantStudy)) {
      var label = extractLabel(t, dur.raw);
      askNotify();
      if (wantStudy && !/提醒/.test(t)) {
        addTimer(dur.sec, '专注学习', true);
        return '……好。我们开始吧。\n' + humanDur(dur.sec) + '后我叫你。\n（想停下就说「结束番茄钟」。）';
      }
      addTimer(dur.sec, label || '提醒', false);
      return '……好。' + humanDur(dur.sec) + '后我叫你' + (label ? '，提醒你' + label : '') + '。';
    }
    if (wantStudy && !dur) {
      startPomodoro(25);
      return '……好。我们开始吧。\n25 分钟后我叫你。\n（中途想停下，就说「结束番茄钟」。）';
    }
    if (/结束番茄钟|停止专注|停止计时|取消提醒|取消计时|停止倒计时|结束倒计时|不学了/.test(t)) { stopAllTimers(); return '……嗯，那就先停下来吧。\n（已经帮你清掉计时了。）'; }
    if (/还剩多久|倒计时还有|还有多久/.test(t)) {
      if (!timers.length) return '……现在没有在计时。';
      return '……还有：\n' + timers.map(function (x) { return '· ' + (x.label || '计时') + ' ' + fmt((x.end - Date.now()) / 1000); }).join('\n');
    }
    return null;
  }

  function runCommand(t) {
    var s = t.replace(/\s+/g, '');

    /* 音乐 */
    if (/播放音乐|放首歌|放音乐|来点音乐|开音乐|打开音乐|听听歌/.test(s)) {
      var played = musicPlay();
      return played ? '……嗯，打开了。\n（耳机在左下角，想安静就跟我说。）' : '……已经在放了。';
    }
    if (/暂停音乐|停止音乐|别放了|关掉音乐|安静一点|安静一会儿/.test(s)) {
      var paused = musicPause();
      return paused ? '……好，那就安静一会儿。' : '……现在是安静的。';
    }
    var vm = s.match(/音量(?:调到|调成|设为|设成)?(\d{1,3})/);
    if (vm) { var v = musicVolume(parseInt(vm[1], 10)); return v === null ? '……我找不到音量控件。' : '……好，音量调到 ' + v + ' 了。'; }
    if (/音量大一点|大声一点|音量加|音量高一点/.test(s)) { var v2 = (musicVolumeNow() || 55) + 15; return '……好，音量 ' + musicVolume(v2) + ' 了。'; }
    if (/音量小一点|小声一点|音量减|音量低一点/.test(s)) { var v3 = (musicVolumeNow() || 55) - 15; return '……好，音量 ' + musicVolume(v3) + ' 了。'; }
    if (/静音/.test(s)) { musicMute(true); return '……好，静音了。'; }
    if (/取消静音|取消静音吧|打开声音/.test(s)) { musicMute(false); return '……嗯，声音恢复了。'; }
    if (/音量多大|当前音量/.test(s)) { return '……现在是 ' + (musicVolumeNow() === null ? '？' : musicVolumeNow()) + '。'; }

    /* 目录 / 顶部 */
    if (/打开目录|展开目录|打开菜单|收起目录|关闭目录/.test(s)) {
      var open = !/收起|关闭/.test(s);
      navToggle(open);
      return open ? '……好，目录打开了。' : '……收起来了。';
    }
    if (/回到顶部|去顶部|去最上面|页首/.test(s)) {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
      return '……嗯，回到最上面了。';
    }

    /* 换主题 */
    if (/换(?:个)?(?:主题|风格|肤|皮肤)|手账风|官网风|混搭风/.test(s)) {
      var target = switchTheme(s);
      if (target) { try { location.href = target + '#assistant'; } catch (e) {} return '……好，帮你换成另一个样子。'; }
      return '……我有原版、动画官网风、手账风、混搭风。你要哪一个？';
    }

    /* 跳转板块 */
    var jumpId = matchJumpSection(s);
    if (jumpId) {
      for (var q = 0; q < PAGE_MAP.length; q++) {
        if (PAGE_MAP[q].id === jumpId && goSection(jumpId)) return '……好。\n' + PAGE_MAP[q].say;
      }
    }

    /* 页面导览 / 我在哪 */
    if (/这页有什么|页面有什么|有哪些内容|页面导览|怎么逛|介绍一下页面/.test(s)) {
      return '……这页有：\n· AI 助手（我们这里）\n· 人物档案\n· 三玖的魅力\n· 图片展示\n· 专辑\n· 名场面\n· 关于作品\n说「带我去看专辑」这样的，我就带你过去。';
    }
    if (/这是哪|我在哪|现在在第几屏|到哪了|当前板块/.test(s)) {
      return '……你现在在「' + (SECTION_NAMES[currentSectionId()] || '首页') + '」。';
    }

    /* 待办 / 计时：模型开启时也由前端确定性执行 */
    var task = runMemoryTaskCommand(t);
    if (task) return task;
    return null;
  }

  /* ---------------- 5. 本地人格引擎 ---------------- */
  function localReply(text) {
    var t = (text || '').trim();
    if (!t) return '……嗯？';
    if (isConfession(t)) return '……诶？这种话……不能随便说的。';

    var cmd = runCommand(t);
    if (cmd) return cmd;

    // 记名字
    var mn = t.match(/我(?:叫|是)\s*([^\s，,。！!？?]{1,8})/);
    if (mn && !/是谁|叫什么/.test(t)) {
      memory.name = mn[1]; saveMemory();
      return '……' + memory.name + '。\n……嗯，我记住了。';
    }

    /* 常见资料问答：直接回答，不跳转 */
    if (/生日|几岁|多大|年龄/.test(t)) return '……5 月 5 日。……金牛座。';
    if (/身高/.test(t)) return '……159 厘米。';
    if (/血型/.test(t)) return '……A 型。';
    if (/声优|配音/.test(t)) return '……动画里是伊藤美来小姐。TVCM 是佐仓绫音小姐。';
    if (/喜欢的食物|爱喝|喝什么|饮料/.test(t)) return '……抹茶、绿茶。……抹茶苏打水也不错。';
    if (/最讨厌|不喜欢吃|讨厌的食物/.test(t)) return '……巧克力。……不太喜欢。';
    if (/什么动物|宠物/.test(t)) return '……刺猬。';
    if (/你是谁|你叫什么|介绍一下|自我介绍一下/.test(t)) return '……中野三玖。中野家五胞胎的三女。\n……嗯，请多指教。';
    if (/你会什么|能做什么|怎么用|功能/.test(t)) return '……我可以：\n· 帮你记事、看待办\n· 陪你学习（计时 25 分钟）\n· 回答生活小问题\n· 在你累的时候……陪着你。';
    if (/喜欢什么|爱好|兴趣/.test(t)) return '……抹茶，还有战国武将。\n历史……我很喜欢。';
    if (/累|难过|烦|压力|不想|焦虑|崩溃|emo|伤心/.test(t)) return pick(SAY.tired);
    if (/学习|考试|作业|复习|成绩|考砸/.test(t)) return pick(SAY.study);
    if (/吃什么|食堂|饿|饭|饮料|奶茶/.test(t)) return pick(SAY.food);
    if (/天气|下雨|冷|热|气温/.test(t)) return pick(SAY.weather);
    if (/你好|在吗|hello|hi|嗨|早安|晚安/.test(t.toLowerCase())) return pick(SAY.greet);
    if (/谢谢|感谢/.test(t)) return '……不、不用谢。(・_・;)';

    for (var i = 0; i < KB.length; i++) {
      for (var j = 0; j < KB[i].k.length; j++) {
        if (t.indexOf(KB[i].k[j]) > -1) return KB[i].a;
      }
    }
    if (memory.name && Math.random() < 0.35) return '……' + memory.name + '，' + pick(SAY.fallback).replace(/^……/, '');
    return pick(SAY.fallback);
  }

  /* ---------------- 6. API 适配层（后续接模型只走这里） ---------------- */
  function requestAI(history, userText) {
    if (AI_CONFIG.mode !== 'api' || !AI_CONFIG.endpoint) {
      return new Promise(function (resolve) { setTimeout(function () { resolve(localReply(userText)); }, 420 + Math.random() * 380); });
    }
    var messages = [{ role: 'system', content: PERSONA }].concat(history.slice(-AI_CONFIG.maxTurns));
    return fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: (function () {
        var h = { 'Content-Type': 'application/json' };
        if (AI_CONFIG.apiKey) h['Authorization'] = 'Bearer ' + AI_CONFIG.apiKey;
        return h;
      })(),
      body: JSON.stringify({ model: AI_CONFIG.model, temperature: AI_CONFIG.temperature, messages: messages })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.choices && d.choices[0] && d.choices[0].message) return d.choices[0].message.content;
      if (d && d.message && d.message.content) return d.message.content;
      return '……（我刚才走神了，能再说一次吗？）';
    }).catch(function () {
      return '……好像连接不上。\n（先试试本地模式吧，我一直都在。）';
    });
  }

  /* ---------------- 6.5 联网搜索 ---------------- */
  var SEARCH_HINT = /天气|气温|下雨|新闻|最新|今天|明天|现在|价格|多少钱|票房|比分|汇率|机票|高铁|地铁|公交|路况|营业时间|电话|地址|官网|是谁|哪里|怎么样|推荐|查一下|搜一下|搜索|百度一下/;
  function needsSearch(t) { return SEARCH_HINT.test(t); }

  function localSearchLinks(q, failed) {
    var e = encodeURIComponent(q);
    return { mode: 'links', failed: !!failed, items: [
      { title: 'Bing 搜索：' + q, url: 'https://www.bing.com/search?q=' + e },
      { title: '百度搜索：' + q, url: 'https://www.baidu.com/s?wd=' + e }
    ] };
  }
  function searchWeb(q) {
    if (SEARCH.endpoint) {
      var url = SEARCH.endpoint.indexOf('%s') > -1
        ? SEARCH.endpoint.replace('%s', encodeURIComponent(q))
        : SEARCH.endpoint + encodeURIComponent(q);
      return fetch(url, { headers: SEARCH.apiKey ? { Authorization: 'Bearer ' + SEARCH.apiKey } : {} })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var items = (d && (d.results || d.items || (d.data && d.data.results))) || [];
          if (!items.length) return localSearchLinks(q, true);
          return { mode: 'api', items: items.slice(0, 4).map(function (x) {
            return { title: x.title || x.name || '结果', url: x.url || x.link || '#', snippet: x.snippet || x.content || '' };
          }) };
        })
        .catch(function () { return localSearchLinks(q, true); });
    }
    return new Promise(function (resolve) { setTimeout(function () { resolve(localSearchLinks(q, false)); }, 520); });
  }

  /* ---------------- 6.6 完整问答链路：提问 → 搜索 → 思考 → 回答 ---------------- */
  var Q_HINT = /[?？]|什么|怎么|为什么|哪里|哪个|多少|是不是|能不能|如何|介绍|推荐|区别|最新|几点|什么时候/;
  function isQuestion(t) { return Q_HINT.test(t); }

  function buildSearchContext(items) {
    if (!items || !items.length) return '';
    return '【联网搜索结果（请基于这些资料回答，并在不确定时说明）】\n' + items.map(function (x, i) {
      return (i + 1) + '. ' + x.title + '：' + (x.snippet || '') + '（' + x.url + '）';
    }).join('\n');
  }

  /* ---------- 调用自有服务（长期架构） ---------- */
  function serverChat(history, userText, extraOptions) {
    var extra = extraOptions || {};
    if (!API.base) return Promise.resolve({ mode: 'off' });
    var url = API.base.replace(/\/+$/, '') + '/chat';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: API.userId,
        messages: history.slice(-12),
        memory: { name: memory.name, todos: memory.todos },
        options: { search: /天气|气温|温度|下雨|降雨|降水|预报/.test(userText) || (!extra.noSearch && !!SEARCH.enabled && (SEARCH.mode === 'always' || needsSearch(userText) || isQuestion(userText))), confession: !!extra.confession }
      })
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (d) { return d || { mode: 'off' }; })
      .catch(function () { return { mode: 'off' }; });
  }
  function checkServer() {
    if (!API.base) return Promise.resolve({ ok: false });
    return fetch(API.base.replace(/\/+$/, '') + '/health')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .catch(function () { return { ok: false }; });
  }
  /* ---------- 执行服务端下发的结构化工具指令 ---------- */
  function runAction(a) {
    if (!a || !a.type) return false;
    switch (a.type) {
      case 'go_section': return goSection(a.id);
      case 'music_play': return musicPlay();
      case 'music_pause': return musicPause();
      case 'music_volume': musicVolume(a.value); return true;
      case 'music_mute': musicMute(a.value === undefined ? true : !!a.value); return true;
      case 'nav_toggle': navToggle(a.open === undefined ? true : !!a.open); return true;
      case 'timer_add': addTimer(a.seconds || a.minutes * 60 || 60, a.label || '提醒'); return true;
      case 'todo_add':
        if (a.text) { memory.todos.push({ t: a.text, done: false, ts: Date.now() }); saveMemory(); }
        return true;
      default: return false;
    }
  }

  function answerFlow(t, typing) {
    // ① 页面工具优先（本地确定性执行）
    var cmd = runCommand(t);
    if (cmd) { typing.remove(); pushHer(cmd); return; }

    // ② 优先调用自己的服务（服务端：人设 + 知识库 + 记忆 + 搜索 + 大模型 + 工具指令）
    typing.textContent = '……让我想想';
    serverChat(history, t).then(function (res) {
      if (res && res.mode === 'api' && res.reply) {
        typing.remove();
        (res.actions || []).forEach(function (a) { try { runAction(a); } catch (e) {} });
        pushHerHTML(res.reply, res.sources);
        return;
      }
      // ③ 兜底：本地人格引擎 / 客户端搜索 / 直连模型（离线与单文件场景）
      localPipeline(t, typing);
    });
  }

  function localPipeline(t, typing) {
    var needNet = SEARCH.enabled && (SEARCH.mode === 'always' || needsSearch(t) || isQuestion(t));
    if (!needNet) {
      requestAI(history, t).then(function (reply) { typing.remove(); pushHer(reply); });
      return;
    }
    typing.textContent = '……我去查一下';
    searchWeb(t).then(function (res) {
      typing.textContent = '……让我想想';
      setTimeout(function () {
        var ctx = buildSearchContext(res.items);
        if (AI_CONFIG.mode === 'api' && AI_CONFIG.endpoint) {
          var msgs = history.slice();
          if (ctx) msgs.splice(Math.max(0, msgs.length - 1), 0, { role: 'system', content: ctx });
          requestAI(msgs, t).then(function (reply) { typing.remove(); pushHerHTML(reply, res.live ? res.items : []); });
        } else {
          var local = localReply(t);
          var srcs = res.live ? (res.items || []) : [];   // 只有真搜到结果才显示来源
          if (srcs.length && /看不到|不知道|然后呢|我在听|我一时/.test(local)) {
            local = '……我查到这些资料，你看看。\n（接入模型后，我能读完后直接回答你。）';
          }
          typing.remove();
          pushHerHTML(local, srcs);
        }
      }, 420);
    });
  }

  /* ---------------- 7. 计时器 / 提醒（支持多个并存） ---------------- */
  var timers = [];
  var timerSeq = 0;
  var TICK = null;

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return (h > 0 ? h + ':' : '') + p(m) + ':' + p(s);
  }
  function notify(title, body) {
    if (window.Notification && Notification.permission === 'granted') {
      try { new Notification(title, { body: body }); } catch (e) {}
    }
  }
  function askNotify() { if (window.Notification && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) {} } }

  function buildTimerEl(tm) {
    var wrap = document.getElementById('aiTimers');
    if (!wrap) return;
    var d = document.createElement('div');
    d.className = 'ai-timer' + (tm.study ? ' study' : '');
    d.innerHTML = '<span class="ai-timer-label"></span><span class="ai-timer-time">--:--</span>' +
                  '<button class="ai-timer-stop" type="button" aria-label="停止计时">×</button>' +
                  '<span class="ai-timer-bar"><i></i></span>';
    d.querySelector('.ai-timer-label').textContent = tm.label || '计时';
    d.querySelector('.ai-timer-stop').addEventListener('click', function () { stopTimer(tm.id); });
    wrap.appendChild(d);
    tm.el = d;
  }
  function renderTimers() {
    var wrap = document.getElementById('aiTimers');
    if (!wrap) return;
    if (!timers.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    timers.forEach(function (tm) { if (!tm.el) buildTimerEl(tm); });
  }
  function paintTimer(tm, left) {
    if (!tm.el) return;
    var timeEl = tm.el.querySelector('.ai-timer-time');
    var barEl = tm.el.querySelector('.ai-timer-bar i');
    if (timeEl) timeEl.textContent = fmt(left);
    if (barEl) barEl.style.width = Math.max(0, Math.min(100, (left / tm.total) * 100)).toFixed(1) + '%';
    if (tm.study) setStatus('学习中 ' + fmt(left));
  }
  function ensureTick() {
    if (TICK) return;
    TICK = setInterval(function () {
      var now = Date.now();
      for (var i = timers.length - 1; i >= 0; i--) {
        var tm = timers[i], left = (tm.end - now) / 1000;
        if (left <= 0) {
          if (tm.el && tm.el.parentNode) tm.el.parentNode.removeChild(tm.el);
          timers.splice(i, 1);
          pushHer('……时间到了。\n' + (tm.label && tm.label !== '提醒' ? tm.label + '，' : '') + '记得看一下。(๑•̀ㅂ•́)و');
          notify('三玖', (tm.label || '时间到') + ' · 到点了');
        } else { paintTimer(tm, left); }
      }
      if (!timers.length) { if (TICK) { clearInterval(TICK); TICK = null; } setStatus('在线 · 生活助手'); }
    }, 250);
  }
  function addTimer(seconds, label, study) {
    seconds = Math.max(1, Math.min(86400, Math.round(seconds)));
    var tm = { id: ++timerSeq, label: label || '提醒', total: seconds, end: Date.now() + seconds * 1000, study: !!study };
    timers.push(tm);
    renderTimers(); ensureTick(); paintTimer(tm, seconds);
    return tm;
  }
  function stopTimer(id) {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].id === id) {
        if (timers[i].el && timers[i].el.parentNode) timers[i].el.parentNode.removeChild(timers[i].el);
        timers.splice(i, 1); break;
      }
    }
    renderTimers();
    if (!timers.length && TICK) { clearInterval(TICK); TICK = null; setStatus('在线 · 生活助手'); }
  }
  function stopAllTimers() {
    for (var i = timers.length - 1; i >= 0; i--) stopTimer(timers[i].id);
  }
  function startPomodoro(min) { askNotify(); return addTimer(min * 60, '专注学习', true); }
  function stopPomodoro() { for (var i = 0; i < timers.length; i++) { if (timers[i].study) { stopTimer(timers[i].id); return; } } }

  /* ---------------- 8. 界面逻辑 ---------------- */
  var panel = document.getElementById('aiPanel');
  var fab = document.getElementById('aiFab');
  var closeBtn = document.getElementById('aiClose');
  var logEl = document.getElementById('aiLog');
  var form = document.getElementById('aiForm');
  var input = document.getElementById('aiInput');
  var quick = document.getElementById('aiQuick');
  var statusEl = document.getElementById('aiStatus');
  // 对外接口（先暴露，便于独立测试与后续 Agent 复用）
  window.MikuAI = {
    config: AI_CONFIG, persona: PERSONA, memory: memory, api: API,
    localReply: localReply, requestAI: requestAI,
    startPomodoro: startPomodoro, stopPomodoro: stopPomodoro, addTimer: addTimer, timers: function () { return timers; },
    search: SEARCH, searchWeb: searchWeb, needsSearch: needsSearch,
    tools: { answerFlow: answerFlow, isQuestion: isQuestion, saveCfg: saveCfg, loadCfg: loadCfg, goSection: goSection, sayBubble: sayBubble, sectionBubble: sectionBubble, matchJumpSection: matchJumpSection, dominantSection: dominantSection, greetedSections: function () { return greetedSections; }, musicPlay: musicPlay, musicPause: musicPause, musicVolume: musicVolume, musicMute: musicMute, navToggle: navToggle, currentSectionId: currentSectionId, runCommand: runCommand, isConfession: isConfession, triggerConfession: triggerConfession, confessionState: loadConfessionState, showConfessionCard: showConfessionCard, hideConfessionCard: hideConfessionCard }
  };
  if (!panel || !fab || !logEl) return;

  var history = [];
  var greeted = false;
  function setStatus(s) { if (statusEl) statusEl.textContent = s; }
  function pushMe(text) { addMsg(text, 'me'); history.push({ role: 'user', content: text }); }
  function pushHer(text) { addMsg(text, 'her'); history.push({ role: 'assistant', content: text }); }
  function pushHerHTML(text, links) {
    var d = document.createElement('div');
    d.className = 'ai-msg her';
    var p = document.createElement('div');
    p.textContent = text;
    d.appendChild(p);
    if (links && links.length) {
      var wrap = document.createElement('div');
      wrap.className = 'ai-links';
      links.forEach(function (x) {
        var link = document.createElement('a');
        link.className = 'ai-src'; link.href = x.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = x.title;
        wrap.appendChild(link);
      });
      d.appendChild(wrap);
    }
    logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight;
    history.push({ role: 'assistant', content: text });
    return d;
  }
  function addMsg(text, who) {
    var d = document.createElement('div');
    d.className = 'ai-msg ' + who;
    d.textContent = text;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    return d;
  }
  /* ---------- 彩蛋：蓝色回信 ---------- */
  var CONFESS_KEY = 'miku_confession_v1';
  var confessionRunning = false;
  var confessionHideTimer = null;
  var confessionBaseTitle = document.title;

  function loadConfessionState() {
    try {
      var raw = localStorage.getItem(CONFESS_KEY);
      var d = raw ? JSON.parse(raw) : {};
      return {
        firstAt: Number(d.firstAt) || 0,
        lastAt: Number(d.lastAt) || 0,
        count: Number(d.count) || 0,
        name: d.name || ''
      };
    } catch (e) {
      return { firstAt: 0, lastAt: 0, count: 0, name: '' };
    }
  }
  function saveConfessionState(st) {
    try { localStorage.setItem(CONFESS_KEY, JSON.stringify(st)); } catch (e) {}
  }
  function normalizeConfessionText(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, '').replace(/[！!。，“”"'、,.?？~～·]/g, '');
  }
  function isConfession(text) {
    var s = normalizeConfessionText(text);
    if (!s) return false;
    if (/我不爱你|不爱你|不爱你妈|不爱你妹|滚开|闭嘴/.test(s)) return false;
    return /我爱你|爱你|我喜欢你|喜欢你|愛してる|爱してる|iloveyou|iaminlovewithyou/.test(s);
  }
  function confessionLines(first, name, now) {
    var night = now.getHours() >= 23 || now.getHours() < 5;
    var birthday = now.getMonth() === 4 && now.getDate() === 5;
    var lines = [];
    if (!first) {
      lines.push(night ? '……这么晚了，还说这种话。' : '……又、又来了。');
      lines.push(birthday ? '……今天的话，我会特别记住的。' : '……嗯，我收到了。');
      return lines;
    }
    lines.push('……诶？');
    lines.push('你、你刚刚说什么……？');
    if (birthday) lines.push('……今天？……你、你是故意的吗。');
    else if (night) lines.push('……这么晚了，突然说这种话。');
    else lines.push(name ? '……' + name + '，这种话，不能随便说的。' : '……这种话，不能随便说的。');
    lines.push('……嗯。我听到了。');
    lines.push('那以后……也让我继续陪着你吧。');
    return lines;
  }
  function playConfessionChime() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        var at = now + i * 0.18;
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.075, at + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.82);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(at); osc.stop(at + 0.9);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1800);
    } catch (e) {}
  }
  function lowerBgmForConfession() {
    var audio = document.getElementById('bgmAudio');
    var prev = musicVolumeNow();
    if (prev === null || !audio || audio.paused || prev <= 24) return;
    musicVolume(24);
    setTimeout(function () { musicVolume(prev); }, 7200);
  }
  function setConfessionVar(el, name, value) {
    if (!el || !el.style) return;
    if (el.style.setProperty) el.style.setProperty(name, value);
    else el.style[name] = value;
  }  function buildConfessionHearts() {
    var wrap = document.getElementById('confessHearts');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (var i = 0; i < 28; i++) {
      var h = document.createElement('i');
      h.textContent = Math.random() < 0.16 ? '♥' : '♡';
      setConfessionVar(h, '--x', (Math.random() * 100).toFixed(2) + '%');
      setConfessionVar(h, '--size', (10 + Math.random() * 22).toFixed(0) + 'px');
      setConfessionVar(h, '--dur', (4.5 + Math.random() * 5.5).toFixed(2) + 's');
      setConfessionVar(h, '--delay', (-Math.random() * 8).toFixed(2) + 's');
      setConfessionVar(h, '--drift', ((Math.random() * 2 - 1) * 84).toFixed(0) + 'px');
      setConfessionVar(h, '--rot', ((Math.random() * 2 - 1) * 70).toFixed(0) + 'deg');
      setConfessionVar(h, '--opacity', (0.3 + Math.random() * 0.55).toFixed(2));
      wrap.appendChild(h);
    }
  }
  function showConfessionCard(st) {
    var layer = document.getElementById('confessLayer');
    var title = document.getElementById('confessTitle');
    var from = document.getElementById('confessFrom');
    var date = document.getElementById('confessDate');
    if (!layer) return;
    buildConfessionHearts();
    if (title) title.textContent = st.count > 1 ? '又一次，收到你的心意' : '心意已珍藏';
    if (from) from.textContent = '收到来自「' + (st.name || '你') + '」的心意 · ' + Math.max(1, st.count) + ' 份';
    if (date) {
      var d = new Date();
      date.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' +
        ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
    layer.hidden = false;
    layer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('confession-mode');
    if (confessionHideTimer) clearTimeout(confessionHideTimer);
    confessionHideTimer = setTimeout(function () { hideConfessionCard(); }, 16000);
    var close = document.getElementById('confessClose');
    if (close) setTimeout(function () { try { close.focus(); } catch (e) {} }, 180);
  }
  function hideConfessionCard() {
    var layer = document.getElementById('confessLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('confession-mode');
    if (confessionHideTimer) { clearTimeout(confessionHideTimer); confessionHideTimer = null; }
  }
  function typeHerLine(text, speed, done) {
    var d = addMsg('', 'her');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      d.textContent = text; logEl.scrollTop = logEl.scrollHeight;
      history.push({ role: 'assistant', content: text });
      if (done) setTimeout(done, 260);
      return d;
    }
    var i = 0;
    function step() {
      d.textContent = text.slice(0, i);
      i++;
      logEl.scrollTop = logEl.scrollHeight;
      if (i <= text.length) setTimeout(step, speed || 34);
      else {
        history.push({ role: 'assistant', content: text });
        if (done) setTimeout(done, 180);
      }
    }
    step();
    return d;
  }
  function runConfessionLines(lines, done) {
    var at = 0;
    function next() {
      if (at >= lines.length) { if (done) done(); return; }
      typeHerLine(lines[at++], 26, next);
    }
    next();
  }
  function splitConfessionReply(text) {
    var raw = String(text || '').replace(/<action>[\s\S]*?<\/action>/g, '').trim();
    if (!raw) return [];
    var blocks = raw.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (blocks.length > 1) return blocks.slice(0, 3);
    var parts = [], buf = '';
    for (var i = 0; i < raw.length; i++) {
      buf += raw.charAt(i);
      if (/[。！？!?]/.test(raw.charAt(i))) { if (buf.trim()) parts.push(buf.trim()); buf = ''; }
    }
    if (buf.trim()) parts.push(buf.trim());
    return (parts.length > 1 ? parts : [raw]).slice(0, 3);
  }
  function triggerConfession() {
    if (confessionRunning) return false;
    confessionRunning = true;
    var st = loadConfessionState();
    var first = !st.firstAt;
    var now = new Date();
    st.name = memory.name || st.name || '';
    if (!st.firstAt) st.firstAt = now.getTime();
    st.lastAt = now.getTime();
    st.count = (st.count || 0) + 1;
    saveConfessionState(st);
    var ach = document.getElementById('aiAchievement');
    if (ach) ach.hidden = false;
    // 使用页面加载时记录的基准标题，避免连续触发后标题无法恢复
    document.title = '三玖收到了你的心意 ♡';
    setTimeout(function () { document.title = confessionBaseTitle; }, 6200);
    playConfessionChime();
    lowerBgmForConfession();
    document.body.classList.add('confession-mode');
    function finishConfession() {
      showConfessionCard(st);
      confessionRunning = false;
    }
    if (first) {
      runConfessionLines(confessionLines(true, st.name, now), finishConfession);
    } else {
      var typing = addMsg('……让我想想', 'her typing');
      serverChat(history, '我爱你', { confession: true }).then(function (res) {
        typing.remove();
        var lines = (res && res.mode === 'api' && res.reply) ? splitConfessionReply(res.reply) : [];
        if (!lines.length) lines = confessionLines(false, st.name, now);
        runConfessionLines(lines, finishConfession);
      });
    }
    return true;
  }
  function greetOnce() {
    if (greeted) return;
    greeted = true;
    var hello = memory.name ? '……' + memory.name + '，你来了。\n今天想做什么？' : '……你好。我是三玖。\n有什么想让我帮忙的吗？';
    setTimeout(function () { pushHer(hello); }, 300);
  }
  function jumpToAI() {
    var sec = document.getElementById('assistant') || panel;
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
    greetOnce();
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 620);
  }

  /* ---------- 模型接口设置面板 ---------- */
  var cfgBtn = document.getElementById('aiCfgBtn');
  var cfgPanel = document.getElementById('aiCfg');
  var cfgApi = document.getElementById('cfgApi');
  var cfgEndpoint = document.getElementById('cfgEndpoint');
  var cfgKey = document.getElementById('cfgKey');
  var cfgModel = document.getElementById('cfgModel');
  var cfgSearch = document.getElementById('cfgSearch');
  var cfgSearchKey = document.getElementById('cfgSearchKey');
  var cfgSearchMode = document.getElementById('cfgSearchMode');
  var cfgState = document.getElementById('cfgState');
  var modeBadge = document.getElementById('aiMode');

  function paintCfg() {
    if (cfgApi) cfgApi.value = API.base || '';
    if (cfgEndpoint) cfgEndpoint.value = AI_CONFIG.endpoint || '';
    if (cfgKey) cfgKey.value = AI_CONFIG.apiKey || '';
    if (cfgModel) cfgModel.value = AI_CONFIG.model || '';
    if (cfgSearch) cfgSearch.value = SEARCH.endpoint || '';
    if (cfgSearchKey) cfgSearchKey.value = SEARCH.apiKey || '';
    if (cfgSearchMode) cfgSearchMode.value = SEARCH.mode || 'smart';
    var direct = AI_CONFIG.mode === 'api' && !!AI_CONFIG.endpoint;
    var srv = API.serverModel;
    var api = direct || srv;
    if (modeBadge) { modeBadge.textContent = api ? '大模型' : '本地'; modeBadge.classList.toggle('api', api); }
    if (cfgState) {
      if (srv) {
        cfgState.textContent = '当前：服务端已接入大模型（' + (API.serverModelName || '已配置') + '）· 对话走自有 API';
      } else if (direct) {
        cfgState.textContent = '当前：浏览器直连模型（' + (AI_CONFIG.model || '未命名') + '）';
      } else {
        var fileMode = (typeof location !== 'undefined' && location.protocol === 'file:');
        cfgState.textContent = fileMode
          ? '当前：本地人格引擎（未连接服务）· 请用 http://localhost:8123 打开（或双击「启动预览.bat」）才能用大模型'
          : '当前：本地人格引擎（服务 /api 未响应）· 请确认服务器已启动、且 config.json 已填模型 Key';
      }
      cfgState.className = 'ai-cfg-state' + (api ? ' ok' : '');
    }
  }
  var cfgHinted = false;
  function refreshServerState() {
    return checkServer().then(function (h) {
      if (h && h.ok && h.model && h.model.configured) { API.serverModel = true; API.serverModelName = h.model.name || ''; }
      else { API.serverModel = false; API.serverModelName = ''; }
      paintCfg();
      return h;
    });
  }
  refreshServerState().then(function (h) {
    var fileMode = (typeof location !== 'undefined' && location.protocol === 'file:');
    if (fileMode && !API.serverModel) {
      setTimeout(function () {
        sayBubble('……提示：用 http://localhost:8123 打开，我才能连上大模型。（双击「启动预览.bat」也行）', 8000);
      }, 1800);
    }
  });
  if (cfgBtn && cfgPanel) cfgBtn.addEventListener('click', function () {
    var opening = cfgPanel.hidden;
    refreshServerState().then(function (h) {
    var fileMode = (typeof location !== 'undefined' && location.protocol === 'file:');
    if (fileMode && !API.serverModel) {
      setTimeout(function () {
        sayBubble('……提示：用 http://localhost:8123 打开，我才能连上大模型。（双击「启动预览.bat」也行）', 8000);
      }, 1800);
    }
  });
    cfgPanel.hidden = !opening;
    var chatPanel = document.getElementById('aiPanel');
    if (chatPanel) chatPanel.classList.toggle('ai-panel--cfg', opening);
    cfgBtn.textContent = opening ? '✕' : '⚙';
    cfgBtn.setAttribute('aria-label', opening ? '返回对话' : '模型接口设置');
    paintCfg();
    if (!cfgPanel.hidden && !AI_CONFIG.endpoint && !cfgHinted) {
      cfgHinted = true;
      pushHer('……填好「模型接口」和「API Key」之后，点最上面的「保存并启用」就可以了。\n（想先确认能不能连上，可以点「测试连接」。）\n（想回到对话，点右上角的 ✕。）');
    }
  });
  // 输入框里按回车 = 保存并启用
  ['cfgEndpoint', 'cfgKey', 'cfgModel', 'cfgSearch', 'cfgSearchKey'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var b = document.getElementById('cfgSave'); if (b) b.click(); }
    });
  });
  var cfgSaveBtn = document.getElementById('cfgSave');
  if (cfgSaveBtn) cfgSaveBtn.addEventListener('click', function () {
    API.base = (cfgApi && cfgApi.value.trim()) || '/api';
    AI_CONFIG.endpoint = cfgEndpoint ? cfgEndpoint.value.trim() : '';
    AI_CONFIG.apiKey = cfgKey ? cfgKey.value.trim() : '';
    AI_CONFIG.model = (cfgModel && cfgModel.value.trim()) || 'hunyuan-turbos-latest';
    SEARCH.endpoint = cfgSearch ? cfgSearch.value.trim() : '';
    SEARCH.apiKey = cfgSearchKey ? cfgSearchKey.value.trim() : '';
    SEARCH.mode = (cfgSearchMode && cfgSearchMode.value) || 'smart';
    AI_CONFIG.mode = AI_CONFIG.endpoint ? 'api' : 'local';
    saveCfg(); paintCfg();
    pushHer(AI_CONFIG.endpoint ? '……嗯，接到模型了。' : '……好，现在用本地模式。');
  });
  var cfgTestBtn = document.getElementById('cfgTest');
  if (cfgTestBtn) cfgTestBtn.addEventListener('click', function () {
    if (cfgApi) API.base = cfgApi.value.trim() || '/api';
    if (cfgState) { cfgState.textContent = '正在检测服务…'; cfgState.className = 'ai-cfg-state'; }
    // 先看自有服务是否可用（长期方案）
    checkServer().then(function (h) {
      if (h && h.ok) {
        if (cfgState) {
          cfgState.textContent = h.model && h.model.configured
            ? '✓ 服务正常 · 服务端已配置模型（' + h.model.name + '），点「保存并启用」即可'
            : '✓ 服务正常，但服务端还没配模型 Key（在服务器设置 MODEL_API_KEY）';
          cfgState.className = 'ai-cfg-state ' + (h.model && h.model.configured ? 'ok' : 'err');
        }
        return;
      }
      testDirect();
    }).catch(function () { testDirect(); });
  });
  function testDirect() {
    if (cfgEndpoint) AI_CONFIG.endpoint = cfgEndpoint.value.trim();
    if (cfgKey) AI_CONFIG.apiKey = cfgKey.value.trim();
    if (cfgModel && cfgModel.value.trim()) AI_CONFIG.model = cfgModel.value.trim();
    if (!AI_CONFIG.endpoint) {
      if (cfgState) { cfgState.textContent = '服务不可用，且未填写离线直连的模型接口'; cfgState.className = 'ai-cfg-state err'; }
      return;
    }
    if (cfgState) { cfgState.textContent = '服务不可用，正在测试离线直连…'; cfgState.className = 'ai-cfg-state'; }
    var headers = { 'Content-Type': 'application/json' };
    if (AI_CONFIG.apiKey) headers['Authorization'] = 'Bearer ' + AI_CONFIG.apiKey;
    fetch(AI_CONFIG.endpoint, {
      method: 'POST', headers: headers,
      body: JSON.stringify({ model: AI_CONFIG.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 })
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function () { if (cfgState) { cfgState.textContent = '✓ 连接成功，可以保存并启用了'; cfgState.className = 'ai-cfg-state ok'; } })
      .catch(function (e) { if (cfgState) { cfgState.textContent = '✗ 连接失败：' + (e.message || '未知错误') + '（可能是跨域或 Key 问题）'; cfgState.className = 'ai-cfg-state err'; } });
  }
  var cfgClearBtn = document.getElementById('cfgClear');
  if (cfgClearBtn) cfgClearBtn.addEventListener('click', function () {
    AI_CONFIG.endpoint = ''; AI_CONFIG.apiKey = ''; AI_CONFIG.model = 'hunyuan-turbos-latest'; AI_CONFIG.mode = 'local';
    SEARCH.endpoint = ''; SEARCH.apiKey = ''; SEARCH.mode = 'smart';
    try { localStorage.removeItem(CFG_KEY); } catch (e) {}
    paintCfg(); pushHer('……好，清空了。现在是本地模式。');
  });
  paintCfg();

  var netBtn = document.getElementById('aiNet');
  try { SEARCH.enabled = localStorage.getItem('miku_ai_net') === '1'; } catch (e) {}
  function paintNet() {
    if (!netBtn) return;
    netBtn.classList.toggle('on', SEARCH.enabled);
    netBtn.setAttribute('aria-pressed', SEARCH.enabled ? 'true' : 'false');
  }
  if (netBtn) netBtn.addEventListener('click', function () {
    SEARCH.enabled = !SEARCH.enabled;
    try { localStorage.setItem('miku_ai_net', SEARCH.enabled ? '1' : '0'); } catch (e) {}
    paintNet();
    pushHer(SEARCH.enabled ? '……嗯，我打开联网了。想查什么？' : '……好，我先不上网了。');
  });
  paintNet();

  var confessLayer = document.getElementById('confessLayer');
  var confessClose = document.getElementById('confessClose');
  var achBtn = document.getElementById('aiAchievement');
  var savedConfess = loadConfessionState();
  if (achBtn && savedConfess.firstAt) achBtn.hidden = false;
  if (confessClose) confessClose.addEventListener('click', hideConfessionCard);
  if (confessLayer) confessLayer.addEventListener('click', function (e) { if (e.target === confessLayer) hideConfessionCard(); });
  if (achBtn) achBtn.addEventListener('click', function () { showConfessionCard(loadConfessionState()); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideConfessionCard(); });
  var bub = document.getElementById('aiBubble');
  if (bub) bub.addEventListener('click', jumpToAI);
  if (fab) fab.addEventListener('click', jumpToAI);
  var startBtn = document.getElementById('aiStart');
  if (startBtn) startBtn.addEventListener('click', jumpToAI);
  if (closeBtn) closeBtn.style.display = 'none';
  // 滚动到该板块时自动打一声招呼
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) greetOnce(); });
    }, { threshold: 0.35 }).observe(panel);
  } else { greetOnce(); }

  function send(text) {
    var t = (text || '').trim();
    if (!t) return;
    pushMe(t);
    input.value = '';
    if (isConfession(t)) { if (!triggerConfession()) pushHer('……嗯，我听到了。'); return; }
    var typing = addMsg('……', 'her typing');
    answerFlow(t, typing);
  }

  if (form) form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
  if (quick) {
    quick.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      send(b.getAttribute('data-q') || b.textContent);
    });
  }
  // 暴露给外部：方便后续接模型或做 Agent 调用
})();
