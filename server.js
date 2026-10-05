/* ============================================================
   中野三玖应援页 · 应用服务器
   - 静态托管（H5 / PWA）
   - 自有 API 层：/api/chat /api/search /api/memory /api/health
   - 服务端持有模型 Key；客户端永不直连模型厂商
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data', 'memory');

/* ---------- 配置：优先环境变量，其次 config.json ---------- */
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch (e) {}
const SRV = cfg.server || {};
const PORT = Number(process.env.PORT || SRV.port || 8123);
const MODEL = {
  base: process.env.MODEL_BASE_URL || (cfg.model && cfg.model.base) || '',
  key: process.env.MODEL_API_KEY || (cfg.model && cfg.model.key) || '',
  name: process.env.MODEL_NAME || (cfg.model && cfg.model.name) || 'deepseek-flash',
  temperature: Number(process.env.MODEL_TEMPERATURE || (cfg.model && cfg.model.temperature) || 0.85),
  webSearch: process.env.MODEL_WEB_SEARCH === '1' || !!(cfg.model && cfg.model.webSearch),   // 模型自带联网（如 OpenRouter :online / plugins:[{id:'web'}]）
  onlineSuffix: (cfg.model && cfg.model.onlineSuffix) || ':online'
};
const SEARCH = {
  provider: process.env.SEARCH_PROVIDER || (cfg.search && cfg.search.provider) || '',
  base: process.env.SEARCH_BASE || (cfg.search && cfg.search.base) || '',
  endpoint: process.env.SEARCH_ENDPOINT || (cfg.search && cfg.search.endpoint) || '',
  key: process.env.SEARCH_API_KEY || (cfg.search && cfg.search.key) || '',
  maxResults: Number(process.env.SEARCH_MAX_RESULTS || (cfg.search && cfg.search.maxResults) || 4)
};
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || SRV.allowOrigin || '*';
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || SRV.rateLimitPerMin || 40);

/* ---------- 人设 / 知识库（文档即配置） ---------- */
function readDoc(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return ''; }
}
const PERSONA_DOC = readDoc('ai/persona.md');
const KNOWLEDGE_DOC = readDoc('ai/knowledge.md');
const CONFESSION_RE = /我爱你|我喜欢你|愛してる|爱してる|i\s*love\s*you/i;
function hasConfessionText(text) {
  const s = String(text || '');
  if (/我不爱你|不爱你|不爱你妈|不爱你妹/.test(s)) return false;
  return CONFESSION_RE.test(s);
}
const PERSONA_PROMPT = (PERSONA_DOC || '你是《五等分的新娘》里的中野三玖，沉默、害羞、温柔，是用户的生活助手。') +
  '\n\n【颜文字】偶尔在句尾用轻量颜文字（例如 (・_・;)、(´・ω・)、(๑•̀ㅂ•́)و），每条回复最多一个，不要滥用。' +
  '\n\n【可用工具】当用户要求跳转页面/控制音乐时，在回答末尾追加一行：' +
  '<action>{"type":"go_section","id":"albums"}</action>（id 可选 home/assistant/profile/charm/gallery/albums/quotes/about；' +
  '音乐类：{"type":"music_play"} / {"type":"music_pause"} / {"type":"music_volume","value":40}；' +
  '计时类：{"type":"timer_add","seconds":900,"label":"看消息"}；待办类：{"type":"todo_add","text":"周五交材料"}；目录类：{"type":"nav_toggle","open":true}）。不要解释这段标记。';

/* 轻量 RAG：按关键词重合度挑最相关的知识片段 */
function retrieveKnowledge(query, topN) {
  if (!KNOWLEDGE_DOC || !query) return '';
  const sections = KNOWLEDGE_DOC.split(/\n##\s/).map(s => s.trim()).filter(Boolean);
  const q = String(query);
  const scored = sections.map(s => {
    let score = 0;
    const words = s.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
    for (const w of new Set(words)) if (q.indexOf(w) > -1) score += 1;
    for (const ch of new Set(q.replace(/[^\u4e00-\u9fa5]/g, ''))) if (s.indexOf(ch) > -1) score += 0.15;
    return { s, score };
  }).sort((a, b) => b.score - a.score);
  const picked = scored.filter(x => x.score > 0.8).slice(0, topN || 2).map(x => x.s);
  return picked.length ? '\n\n【相关设定资料】\n' + picked.join('\n---\n') : '';
}

/* ---------- 多学校知识库（RAG，不在页面展示入口） ---------- */
const SCHOOL_KB_ROOT = path.join(ROOT, 'data', 'knowledge', 'schools');
let schoolKbCache = null;

function readJsonl(file) {
  const rows = [];
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch (e) {}
    }
  } catch (e) {}
  return rows;
}
function kbNorm(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').replace(/[《》「」『』【】〔〕（）()\[\]，,。！？!?：:；;、“”"'·\-—_/\\|]/g, ' ').replace(/\s+/g, ' ').trim();
}
function kbGrams(text) {
  const s = kbNorm(text).replace(/\s+/g, '');
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

const SCHOOL_TOPIC_BOOSTS = [
  ['校区', 9], ['虎溪', 9], ['沙坪坝', 9], ['科学城', 9], ['两江', 9],
  ['校车', 7], ['选课', 6], ['绩点', 6], ['转专业', 8], ['培养方案', 8], ['专业培养', 8],
  ['竞赛', 6], ['社团', 6], ['食堂', 6], ['宿舍', 6], ['校园网', 7], ['教务处', 7],
  ['图书馆', 7], ['srtp', 8], ['保研', 8], ['毕业去向', 7], ['新生指南', 8],
  ['入学必看', 8], ['校历', 8], ['课程代码', 8]
];
function kbCount(text, term) {
  let count = 0, pos = 0;
  while ((pos = text.indexOf(term, pos)) > -1) { count++; pos += term.length; }
  return count;
}

function loadSchoolKnowledge() {
  if (schoolKbCache) return schoolKbCache;
  const records = [];
  const schools = [];
  try {
    const dirs = fs.readdirSync(SCHOOL_KB_ROOT, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const d of dirs) {
      const dir = path.join(SCHOOL_KB_ROOT, d.name);
      if (!fs.existsSync(path.join(dir, 'source.json'))) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'source.json'), 'utf8'));
      const catalog = readJsonl(path.join(dir, 'course-catalog.jsonl'));
      const chunks = readJsonl(path.join(dir, 'chunks.jsonl'));
      for (const r of catalog.concat(chunks)) {
        const item = Object.assign({}, r, {
          school_name: r.school_name || meta.school_name || d.name,
          source_name: r.source_name || meta.source_name || d.name,
          source_url: r.url || meta.base_url || '',
          official: !!meta.official,
          license: meta.license || '',
          attribution: meta.attribution || ''
        });
        item._search = [item.school_name, item.source_name, item.title, (item.codes || []).join(' '), item.text || ''].join(' ').toLowerCase();
        item._grams = new Set(kbGrams(item._search));
        records.push(item);
      }
      schools.push({
        school_id: meta.school_id || d.name,
        school_name: meta.school_name || d.name,
        source_name: meta.source_name || d.name,
        documents: chunks.length,
        catalog: catalog.length
      });
    }
  } catch (e) {
    console.log('  [school-kb] load failed:', String(e.message || e).slice(0, 120));
  }
  schoolKbCache = { records, schools, loadedAt: Date.now() };
  console.log('  [school-kb] ' + schools.length + ' schools, ' + records.length + ' searchable records');
  return schoolKbCache;
}
function schoolKnowledgeScore(item, query, qGrams) {
  const flat = kbNorm(query).replace(/\s+/g, '');
  if (!flat) return 0;
  let score = 0;
  for (const g of qGrams) if (item._grams.has(g)) score += 1;
  if (flat.length >= 2 && item._search.indexOf(flat) > -1) score += 5;
  const title = kbNorm(item.title).replace(/\s+/g, '');
  if (title && title.indexOf(flat) > -1) score += 6;
  const codes = (item.codes || []).join(' ').toLowerCase();
  if (codes && codes.indexOf(String(query).toLowerCase().trim()) > -1) score += 12;
  const qLower = String(query).toLowerCase();
  for (const pair of SCHOOL_TOPIC_BOOSTS) {
    if (qLower.indexOf(pair[0]) > -1) score += pair[1] * Math.min(3, kbCount(item._search, pair[0]));
  }
  if (/校区|虎溪|沙坪坝|科学城|两江/.test(query) && /入学必看\/(新生指南|常见问题)/.test(item.path || '')) score += 20;
  if (/新生指南|入学必看/.test(query) && /新生指南|入学必看/.test(item.title + ' ' + item._search)) score += 5;
  return score;
}
function retrieveSchoolKnowledge(query, topN, schoolId) {
  const kb = loadSchoolKnowledge();
  if (!kb.records.length || !query) return '';
  const raw = String(query);
  const qGrams = kbGrams(raw);
  const schoolHint = /重庆大学|cqu|openlib|校区|虎溪|沙坪坝|科学城|两江|校车|选课|绩点|转专业|培养方案|专业培养|竞赛|社团|食堂|宿舍|校园网|教务处|图书馆|srtp|保研|毕业去向|新生|入学|校历|学分|课程代码/i.test(raw);
  const scored = [];
  for (const item of kb.records) {
    if (schoolId && item.school_id !== schoolId) continue;
    const score = schoolKnowledgeScore(item, raw, qGrams);
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const minScore = schoolHint ? 2 : 4;
  const picked = [];
  const seen = new Set();
  for (const row of scored) {
    if (row.score < minScore) continue;
    const key = row.item.school_id + '|' + (row.item.doc_id || row.item.id || row.item.title);
    if (seen.has(key)) continue;
    seen.add(key); picked.push(row.item);
    if (picked.length >= (topN || 3)) break;
  }
  if (!picked.length) return '';
  let out = '\n\n【学校资源知识库】\n';
  out += '以下资料来自学校社区资源库，优先于模型的一般印象。回答具体校区、地址、政策、课程和联系方式时，只能依据资料；资料没有写明的部分要明确说“资源库未覆盖”，不得自行补全。引用时注明来源名称，并保留链接。\n';
  picked.forEach((x, i) => {
    out += '\n' + (i + 1) + '. 【' + x.school_name + '｜' + x.source_name + '】' + x.title + '\n';
    out += '   来源：' + x.source_url + '\n';
    if (x.codes && x.codes.length) out += '   课程代码：' + x.codes.join('、') + '\n';
    out += '   内容：' + String(x.text || '').slice(0, 1200) + '\n';
  });
  return out;
}
/* ---------- 记忆（服务端持久化） ---------- */
function memPath(userId) {
  const safe = String(userId || 'guest').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 48) || 'guest';
  return path.join(DATA_DIR, safe + '.json');
}
function loadMemory(userId) {
  try { return JSON.parse(fs.readFileSync(memPath(userId), 'utf8')); }
  catch (e) { return { userId: userId, name: '', todos: [], notes: [], history: [], updatedAt: 0 }; }
}
function extractName(text) {
  const raw = String(text || "").trim();
  if (!raw || raw.length > 80) return "";
  if (/我叫(?:什么|谁)|你还记得我叫/.test(raw)) return "";
  const patterns = [
    /(?:我叫|我的名字是|我的名字叫)\s*([\u4e00-\u9fa5A-Za-z0-9_·・-]{1,12})/,
    /(?:你可以|可以|请|以后)叫我\s*([\u4e00-\u9fa5A-Za-z0-9_·・-]{1,12})/,
    /^我是\s*([\u4e00-\u9fa5A-Za-z0-9_·・-]{1,6})(?:[，。！!？?]|$)/
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (!m) continue;
    const name = m[1].replace(/(?:啦|呀|啊|哦|喔|哈|呢|吧|嘛)$/u, "").trim();
    if (name && !/^(?:谁|什么|一个|你|我|他|她|助手|三玖)$/.test(name)) return name;
  }
  return "";
}
function saveMemory(userId, mem) {
  mem.updatedAt = Date.now();
  if (mem.history && mem.history.length > 40) mem.history = mem.history.slice(-40);
  try { fs.writeFileSync(memPath(userId), JSON.stringify(mem, null, 2), 'utf8'); } catch (e) {}
  return mem;
}

/* ---------- 搜索增强：抓取网页正文，补齐摘要里没有的关键信息（温度/数值等） ---------- */
async function enrichFromPage(item, timeoutMs) {
  if (!item || !item.url || !/^https?:/i.test(item.url)) return item;
  try {
    const ctl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs || 5000) : undefined;
    const r = await fetch(item.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }, signal: ctl, redirect: 'follow'
    });
    if (!r.ok) return item;
    const buf = await r.arrayBuffer();
    const ct = r.headers.get('content-type') || '';
    const cs = (ct.match(/charset=([\w-]+)/i) || [])[1] || 'utf-8';
    let html = '';
    try { html = new TextDecoder(cs).decode(buf); }
    catch (e) { html = new TextDecoder('utf-8').decode(buf); }
    let extra = '';
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim();
    // 先找"带数值的天气/关键信息"片段（温度、日期预报等）
    const mm = body.match(/[^。；]{0,60}(?:℃|°C|气温|温度)|[^。；]{0,40}\d{1,2}月\d{1,2}日[^。；]{0,60}/g);
    if (mm && mm.length) {
      extra = mm.slice(0, 3).join(' ｜ ');
    } else {
      const md = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,400})["']/i);
      extra = md ? md[1] : body.slice(0, 220);
    }
    extra = stripTags(extra).slice(0, 280);
    if (extra) item.snippet = (item.snippet ? item.snippet + ' ｜ ' : '') + extra;
  } catch (e) { /* 单页失败不影响整体 */ }
  return item;
}

/* ---------- 天气专用通道：wttr.in（免费、无需 Key，直接给准确数值） ---------- */
var WEATHER_ZH = { Sunny:'晴', Clear:'晴朗', 'Partly cloudy':'局部多云', Cloudy:'多云', Overcast:'阴', Mist:'薄雾', Fog:'雾',
  'Smoky haze':'烟霾', Haze:'霾', 'Patchy rain nearby':'周边有零星降雨', 'Patchy rain possible':'可能有零星降雨',
  'Light rain':'小雨', 'Moderate rain':'中雨', 'Heavy rain':'大雨', 'Light drizzle':'毛毛雨',
  'Thundery outbreaks possible':'可能有雷阵雨', 'Light snow':'小雪', Snow:'雪', Sleet:'雨夹雪', Blizzard:'暴风雪',
  Windy:'大风', 'Light freezing rain':'小冻雨' };
function extractCity(q) {
  let text = String(q || '').replace(/\s+/g, '').replace(/[？?。！!，,]/g, '');
  text = text.replace(/^(请问|帮我查|查一下|看看|我想知道|想知道)/, '');
  text = text.replace(/^(今天|明天|后天|现在|实时)/, '');
  const m = text.match(/^([\u4e00-\u9fa5]{2,8}?)(?:今天|明天|后天|现在|实时)?(?:的)?(?:天气|气温|温度|下雨|降雨|降水|预报)/);
  if (!m) return '';
  return m[1].replace(/^(今天|明天|后天|现在|实时)/, '').replace(/的$/, '').trim();
}
async function weatherLookup(q) {
  if (!/天气|气温|温度|下雨|降雨|降水|预报/.test(q)) return null;
  const city = extractCity(q);
  if (!city) return null;
  try {
    const ctl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
    const url = 'https://wttr.in/' + encodeURIComponent(city) + '?format=j1&lang=zh';
    const r = await fetch(url, { headers: { 'User-Agent': 'MikuFanPage/1.0' }, signal: ctl });
    const d = await r.json();
    const c = d.current_condition && d.current_condition[0];
    const t = d.weather && d.weather[0];
    if (!c) return null;
    let raw = (c.weatherDesc && c.weatherDesc[0] && c.weatherDesc[0].value) || (c.lang_zh && c.lang_zh[0] && c.lang_zh[0].value) || '';
    const desc = WEATHER_ZH[raw] || raw;
    const snippet = city + ' 实时天气：' + desc + '，当前气温 ' + c.temp_C + '°C（体感 ' + c.FeelsLikeC + '°C），' +
      '湿度 ' + c.humidity + '%，风速 ' + c.windspeedKmph + 'km/h' + (c.winddir16Point ? '（' + c.winddir16Point + '）' : '') +
      (t ? '；今日 ' + t.mintempC + '~' + t.maxtempC + '°C' : '') + '。';
    return { title: city + ' 实时天气（wttr.in 数据源）', url: 'https://wttr.in/' + encodeURIComponent(city), snippet: snippet };
  } catch (e) { return null; }
}

/* ---------- 搜索质量：查询清洗 + 相关度重排 ---------- */
function cleanQuery(q) {
  let s = String(q || '').replace(/[？?！!。，,、；;：:\"'（）()【】\[\]]/g, ' ')
    .replace(/请问|帮我|麻烦|我想知道|想知道|查一下|搜一下|搜索一下|告诉我|怎么样|怎么|如何|是什么|为什么|可以吗|吗|呢|啊|呀/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return s || String(q || '').trim();
}
function rankByRelevance(items, q) {
  if (!items.length) return items;
  const flat = cleanQuery(q).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
  const grams = [];
  for (let i = 0; i < flat.length - 1; i++) grams.push(flat.slice(i, i + 2));
  const scored = items.map((x) => {
    const hay = (x.title || '') + (x.snippet || '');
    let s = 0;
    for (const g of grams) if (hay.indexOf(g) > -1) s++;
    return { x, s };
  }).sort((a, b) => b.s - a.s);
  const kept = scored.filter((o) => o.s > 0).map((o) => o.x);
  return (kept.length >= 2 ? kept : scored.slice(0, Math.max(2, kept.length)).map((o) => o.x));
}

/* ---------- 免 Key 搜索：抓取 Bing 结果页 ---------- */
function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&ensp;/g, ' ').replace(/&#0183;/g, '·')
    .replace(/\s+/g, ' ').trim();
}
async function bingSearch(q, N) {
  const url = 'https://www.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=zh-CN&ensearch=0';
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    }
  });
  const h = await r.text();
  const blocks = h.split(/<li class="b_algo"/).slice(1, N + 4);
  const items = [];
  for (const b of blocks) {
    const a = b.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const p = b.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    items.push({ title: stripTags(a[2]), url: a[1], snippet: stripTags(p ? p[1] : '') });
    if (items.length >= N) break;
  }
  return items;
}

/* ---------- 新闻搜索：Bing News RSS，优先返回可摘要的实时条目 ---------- */
function xmlText(s) {
  return stripTags(String(s || '').replace(/<!\[CDATA\[|\]\]>/g, ''));
}
async function bingNewsSearch(q, N) {
  const url = 'https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=RSS&setlang=zh-CN&cc=CN';
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    }
  });
  if (!r.ok) return [];
  const xml = await r.text();
  const blocks = xml.split(/<item>/i).slice(1, N + 3);
  const items = [];
  for (const b of blocks) {
    const t = b.match(/<title>([\s\S]*?)<\/title>/i);
    const u = b.match(/<link>([\s\S]*?)<\/link>/i);
    const d = b.match(/<description>([\s\S]*?)<\/description>/i);
    if (!t || !u) continue;
    const title = xmlText(t[1]);
    const urlItem = xmlText(u[1]);
    const snippet = d ? xmlText(d[1]) : '';
    if (title && /^https?:/i.test(urlItem)) items.push({ title, url: urlItem, snippet });
    if (items.length >= N) break;
  }
  return items;
}
/* ---------- 工具函数 ---------- */
function send(res, code, data, extraHeaders) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, Object.assign({
    'Content-Type': typeof data === 'string' ? 'application/json; charset=utf-8' : 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  }, extraHeaders || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
  });
}
async function callModel(messages) {
  const payload = { model: MODEL.name, temperature: MODEL.temperature, messages: messages };
  if (MODEL.webSearch) {
    // OpenRouter 等网关：模型自带联网插件，搜索与模型同一个 Key
    payload.plugins = [{ id: 'web' }];
    if (payload.model.indexOf(':') === -1) payload.model = payload.model + MODEL.onlineSuffix;
  }
  const r = await fetch(MODEL.base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MODEL.key },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  if (!r.ok) throw new Error('model ' + r.status + ': ' + text.slice(0, 200));
  const d = JSON.parse(text);
  const msg = (d.choices && d.choices[0] && d.choices[0].message) || d.message || {};
  let content = msg.content || '';
  // 提取网关返回的联网来源（annotations / citations / urls）
  const cites = [];
  const ann = msg.annotations || d.annotations || [];
  if (Array.isArray(ann)) {
    for (const x of ann) {
      const c = x && (x.url_citation || x.citation || x);
      if (c && c.url) cites.push({ title: c.title || c.url, url: c.url, snippet: '' });
    }
  }
  if (Array.isArray(msg.citations)) for (const u of msg.citations) cites.push({ title: String(u), url: String(u), snippet: '' });
  return { content: content, citations: cites };
}
async function doSearch(rawQuery) {
  const q = cleanQuery(rawQuery);           // 去掉"请问/怎么样/吗"等口语词，结果更准
  const p = (SEARCH.provider || '').toLowerCase();
  const N = Math.max(1, Math.min(8, SEARCH.maxResults || 4));
  const wantsNews = /(?:最近|今日|今天|最新).{0,8}(?:新闻|大事)|新闻(?:头条|热点)|有什么新闻/.test(String(rawQuery || ''));
  const norm = (x) => ({ title: x.title || x.name || '结果', url: x.url || x.link || '#', snippet: x.snippet || x.content || x.summary || '' });

  try {
    const w = await weatherLookup(q);          // 天气类问题：直接用天气数据源
    if (w) return { items: [w], live: true, provider: 'wttr' };

    if (p === 'bing') {
      let rawItems = wantsNews ? await bingNewsSearch('今日热点新闻', N + 3) : [];
      if (!rawItems.length) rawItems = await bingSearch(wantsNews ? '今日热点新闻' : q, N + 3);
      const items = (wantsNews ? rawItems.slice(0, N) : rankByRelevance(rawItems, q).slice(0, N));
      if (items.length) {
        const top = items.slice(0, 2);
        await Promise.all(top.map((x) => enrichFromPage(x, 5000)));   // 抓正文补关键数据
        return { items, live: true, provider: 'bing' };
      }
    }
    if (p === 'searxng' && SEARCH.base) {
      const u = SEARCH.base.replace(/\/+$/, '') + '/search?q=' + encodeURIComponent(q) + '&format=json&language=zh-CN&safesearch=1';
      const r = await fetch(u, { headers: { 'Accept': 'application/json', 'User-Agent': 'MikuFanPage/1.0' } });
      const d = await r.json();
      const items = rankByRelevance((d.results || []).map(norm), q).slice(0, N);
      if (items.length) { await Promise.all(items.slice(0, 2).map((x) => enrichFromPage(x, 4500))); return { items, live: true, provider: 'searxng' }; }
    }
    if (p === 'tavily' && SEARCH.key) {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: SEARCH.key, query: q, max_results: N, search_depth: 'basic' })
      });
      const d = await r.json();
      const items = rankByRelevance((d.results || []).map(norm), q).slice(0, N);
      if (items.length) { await Promise.all(items.slice(0, 2).map((x) => enrichFromPage(x, 4500))); return { items, live: true, provider: 'tavily' }; }
    }
    if (p === 'bocha' && SEARCH.key) {
      const r = await fetch('https://api.bochaai.com/v1/web-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SEARCH.key },
        body: JSON.stringify({ query: q, summary: true, count: N })
      });
      const d = await r.json();
      const pages = (d.data && d.data.webPages && d.data.webPages.value) || [];
      const items = rankByRelevance(pages.map(norm), q).slice(0, N);
      if (items.length) { await Promise.all(items.slice(0, 2).map((x) => enrichFromPage(x, 4500))); return { items, live: true, provider: 'bocha' }; }
    }
    if (p === 'serper' && SEARCH.key) {
      const r = await fetch('https://google.serper.dev/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': SEARCH.key },
        body: JSON.stringify({ q: q, num: N, hl: 'zh-cn' })
      });
      const d = await r.json();
      const items = rankByRelevance((d.organic || []).map(norm), q).slice(0, N);
      if (items.length) { await Promise.all(items.slice(0, 2).map((x) => enrichFromPage(x, 4500))); return { items, live: true, provider: 'serper' }; }
    }
    if (SEARCH.endpoint) {
      const url = SEARCH.endpoint.indexOf('%s') > -1 ? SEARCH.endpoint.replace('%s', encodeURIComponent(q)) : SEARCH.endpoint + encodeURIComponent(q);
      const r = await fetch(url, { headers: SEARCH.key ? { Authorization: 'Bearer ' + SEARCH.key } : {} });
      const d = await r.json();
      const items = rankByRelevance((d.results || d.items || (d.data && d.data.results) || []).map(norm), q).slice(0, N);
      if (items.length) { await Promise.all(items.slice(0, 2).map((x) => enrichFromPage(x, 4500))); return { items, live: true, provider: 'custom' }; }
    }
  } catch (e) {
    console.log('  [search] 失败:', String(e.message || e).slice(0, 120));
  }

  const e2 = encodeURIComponent(q);
  return { items: [
    { title: 'Bing 搜索：' + q, url: 'https://www.bing.com/search?q=' + e2, snippet: '' },
    { title: '百度搜索：' + q, url: 'https://www.baidu.com/s?wd=' + e2, snippet: '' }
  ], live: false, provider: 'links' };
}

/* ---------- 速率限制（按 IP 每分钟） ---------- */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60000) { rec.n = 0; rec.t = now; }
  rec.n++; hits.set(ip, rec);
  return rec.n > RATE_LIMIT;
}

/* ---------- API 路由 ---------- */
async function api(req, res, pathname, query) {
  const ip = (req.socket.remoteAddress || 'x');
  if (rateLimited(ip)) return send(res, 429, { error: '请求太频繁，请稍后再试' });

  if (pathname === '/api/health') {
    return send(res, 200, {
      ok: true,
      model: { configured: !!(MODEL.base && MODEL.key), name: MODEL.name },
      search: { configured: !!(SEARCH.provider || SEARCH.endpoint), provider: SEARCH.provider || (SEARCH.endpoint ? 'custom' : ''), base: SEARCH.base || SEARCH.endpoint || '' },
      persona: PERSONA_DOC ? 'ai/persona.md' : 'builtin',
      knowledge: (function () { const kb = loadSchoolKnowledge(); return { schools: kb.schools.length, records: kb.records.length }; })()
    });
  }

  if (pathname === '/api/memory') {
    if (req.method === 'GET') return send(res, 200, loadMemory(query.userId));
    if (req.method === 'POST') {
      const body = await readBody(req);
      const mem = loadMemory(body.userId);
      if (body.patch) Object.assign(mem, body.patch);
      if (body.todos) mem.todos = body.todos;
      return send(res, 200, saveMemory(body.userId, mem));
    }
  }

  if (pathname === '/api/search' && req.method === 'POST') {
    const body = await readBody(req);
    const r = await doSearch(body.q || '');
    return send(res, 200, r);
  }

  if (pathname === '/api/chat' && req.method === 'POST') {
    const body = await readBody(req);
    const userId = body.userId || 'guest';
    const mem = loadMemory(userId);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const userText = lastUser ? String(lastUser.content) : '';
    const specialConfession = !!(body.options && body.options.confession);
    const recentText = messages.slice(-10).map(m => String(m.content || '')).join('\n');
    const confessionAfterglow = specialConfession || hasConfessionText(recentText);
    const explicitName = extractName(userText);
    if (explicitName) mem.name = explicitName;

    // 未配置模型 → 告诉前端回退到本地人格引擎
    if (!MODEL.base || !MODEL.key) return send(res, 200, { mode: 'local', reason: 'model-not-configured' });

    let sources = [];
    let searchBlock = '';
    let usedSearch = false;
    const weatherQuery = /天气|气温|温度|下雨|降雨|降水|预报/.test(userText);
    if ((body.options && body.options.search) || weatherQuery) {
      const s = await doSearch(userText);
      if (s.live) {                       // 只有真搜到结果才注入上下文 / 展示来源
        sources = s.items; usedSearch = true;
        var today = new Date().toLocaleDateString('zh-CN');
        searchBlock = '\n\n【联网搜索结果 · 今天是 ' + today + '】\n' +
          '请【直接依据下面的资料】回答用户的问题：先看摘要里的关键信息（时间、地点、数值、结论），再用三玖的语气简洁作答；' +
          '如果资料里确实没有答案，就明确说没查到，绝对不要编造。\n' +
          sources.map((x, i) => (i + 1) + '. 标题：' + x.title + '\n   摘要：' + (x.snippet || '（无摘要）') + '\n   链接：' + x.url).join('\n');
      } else {
        sources = []; usedSearch = false;  // 兜底链接不给前端（避免正常对话冒出 Bing 词条）
      }
    }

    const nowCn = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const confessionPrompt = specialConfession
      ? '\n\n【特别回应】用户刚刚再次向三玖表达了喜欢或爱意。请生成一段全新的回应，不要重复“又来了”“我收到了”等固定句；2-3 句，短句为主，害羞但比平时更坦率，可以结合最近聊天里出现的名字或话题。'
      : (confessionAfterglow ? '\n\n【告白余韵】最近用户向三玖表达过喜欢或爱意。三玖可以比平时更坦率、更有温度，但不要每句都提告白，不要机械重复“我也爱你”；先回应用户眼前的事情，再给一句有记忆点、有新鲜感的陪伴。' : '');
    const sys = PERSONA_PROMPT
      + confessionPrompt
      + '\n\n【当前时间】现在是 ' + nowCn + '（北京时间）。'
      + (mem.name ? '\n\n【你记得这个人】他的名字是「' + mem.name + '」。' : '')
      + (mem.todos && mem.todos.length ? '\n【他的待办】' + mem.todos.filter(t => !t.done).map(t => t.t).join('；') : '')
      + retrieveKnowledge(userText, 2)
      + retrieveSchoolKnowledge(userText, 4, (body.options && body.options.schoolId) || '')
      + searchBlock;

    let reply = '', actions = [];
    try {
      const out = await callModel([{ role: 'system', content: sys }].concat(messages.slice(-12)));
      const content = out.content;
      if (out.citations && out.citations.length) { sources = sources.concat(out.citations); usedSearch = true; }
      const m = content.match(/<action>([\s\S]*?)<\/action>/);
      if (m) {
        try { const a = JSON.parse(m[1]); if (a && a.type) actions.push(a); } catch (e) {}
        reply = content.replace(/<action>[\s\S]*?<\/action>/g, '').trim();
      } else reply = content.trim();
    } catch (e) {
      return send(res, 200, { mode: 'error', error: String(e.message || e).slice(0, 200) });
    }

    mem.history = (mem.history || []).concat([{ role: 'user', content: userText }, { role: 'assistant', content: reply }]);
    saveMemory(userId, mem);

    return send(res, 200, { mode: 'api', reply, actions, sources, usedSearch, user: { name: mem.name } });
  }

  return send(res, 404, { error: 'not found' });
}

/* ---------- 静态资源 ---------- */
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.woff2':'font/woff2', '.ttf':'font/ttf', '.md':'text/markdown; charset=utf-8' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(url.pathname);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': ALLOW_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
    return res.end();
  }
  if (pathname.indexOf('/api/') === 0) {
    try { return await api(req, res, pathname, Object.fromEntries(url.searchParams)); }
    catch (e) { return send(res, 500, { error: String(e.message || e) }); }
  }
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/index.html' && url.searchParams.get('v')) rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    const ext = path.extname(file).toLowerCase();
    const cache = ['.html', '.css', '.js', '.svg', '.webmanifest'].indexOf(ext) > -1 ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Miku app server: http://localhost:' + PORT);
  var modelMsg = (MODEL.base && MODEL.key) ? (MODEL.name + ' 已配置 ✓')
    : (MODEL.base ? '未配置 ✗ —— config.json 里 "model.key" 为空（请填 sk- 开头的 Key 后重启）'
                  : '未配置 ✗ —— 未填写模型接口地址');
  console.log('  model :', modelMsg);
  console.log('  search:', (SEARCH.provider || SEARCH.endpoint) ? ('已配置 ✓ (' + (SEARCH.provider || 'custom') + ')') : '未配置（联网时返回 Bing/百度 链接）');
  if (MODEL.base && MODEL.key) console.log('  提示  : 已有大模型，页面将自动走服务端对话');
});
