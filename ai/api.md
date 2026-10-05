# API 接口说明（接入大模型 / 联网搜索）

> 页面默认运行在**本地人格引擎**（无需任何 Key）。在聊天面板点右上角 ⚙ 填写接口即可切换为大模型驱动。

## 1. 模型接口（必填即可用大模型）
- 地址：`https://你的服务/v1/chat/completions`
- 格式：**OpenAI 兼容**（`POST` + JSON）
- 鉴权：`Authorization: Bearer <API_KEY>`

### 请求体（页面会自动拼接，无需你手动传）
```json
{
  "model": "hunyuan-turbos-latest",
  "temperature": 0.85,
  "messages": [
    { "role": "system", "content": "（三玖人设卡 PERSONA，自动注入）" },
    { "role": "user", "content": "用户说的话" }
  ]
}
```
> 联网模式下，页面会在用户消息**之前**插入一条 system 消息：
> `【联网搜索结果（请基于这些资料回答，并在不确定时说明）】1. 标题：摘要（链接）…`

### 期望响应
```json
{ "choices": [ { "message": { "role": "assistant", "content": "……嗯，我看看。" } } ] }
```
兼容 `{ "message": { "content": "…" } }` 形式。

## 2. 搜索接口（可选，用于真·联网）
- 地址：`https://你的服务/search?q=`（支持 `%s` 占位符，或用追加查询串的形式）
- 鉴权（可选）：`Authorization: Bearer <SEARCH_KEY>`

### 期望响应
```json
{
  "results": [
    { "title": "标题", "url": "https://…", "snippet": "摘要文本" }
  ]
}
```
兼容 `{ "items": [...] }` 与 `{ "data": { "results": [...] } }`。
未配置搜索接口时，页面会退化为"给出 Bing / 百度 搜索链接"。

## 3. 问答链路（搜索 → 思考 → 回答）
```
用户提问
  → ① 页面工具优先（音乐控制 / 板块跳转 / 目录 / 主题）
  → ② 判断是否需要联网（联网开关 + 智能判断 / 每次搜索）
  → ③ 搜索（显示「……我去查一下」）
  → ④ 思考（显示「……让我想想」，把结果注入上下文）
  → ⑤ 回答（带来源链接卡片）
```

## 4. 安全建议（重要）
前端直接填写 API Key **仅适合本地演示**。正式发布请用你自己的后端代理，例如腾讯云函数：

```js
// 云函数示例（Node.js）：转发到你的模型服务，Key 只保存在服务端
exports.main_handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const r = await fetch('https://api.your-provider.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.MODEL_KEY },
    body: JSON.stringify(body)
  });
  return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: await r.text() };
};
```

## 5. 在页面里配置
1. 打开右下角「三玖」对话框
2. 点右上角 ⚙
3. 填 **模型接口 / API Key / 模型名**（搜索接口可选）
4. 点「测试连接」→ 成功后点「保存并启用」
5. 标题旁的徽标会从「本地」变成「**大模型**」，之后所有回答都由模型生成

## 6. 搜索源配置（与模型共用同一个代理）
`server.js` 同一个服务同时提供模型转发与搜索转发，页面只跟它打交道。搜索源支持四种：

| provider | 是否需要 Key | 配置 | 说明 |
| --- | --- | --- | --- |
| `bocha` | 需要 | `provider:"bocha"`, `key:"sk-…"` | 博查 AI 搜索，**中文结果好**，有免费额度（推荐国内使用）|
| `tavily` | 需要 | `provider:"tavily"`, `key:"tvly-…"` | 专为 LLM 设计，1000 次/月免费 |
| `serper` | 需要 | `provider:"serper"`, `key:"…"` | Google 结果，2500 次免费 |
| `searxng` | 不需要 | `provider:"searxng"`, `base:"https://你的实例"` | 需**自建**实例（公共实例多已禁用 JSON API，实测 8 个全部超时）|
| `custom` | 视情况 | `endpoint:"https://…/search?q="` | 你自己的搜索服务，返回 `{results:[…]}` |

`config.json` 示例（搜博查）：
```json
"search": {
  "provider": "bocha",
  "key": "sk-你的博查Key",
  "maxResults": 4
}
```
未配置或搜索失败时，会自动退化为「Bing / 百度 搜索链接」，并如实告诉用户。

## 7. 免 Key 搜索：内置 Bing 抓取（当前默认）
`search.provider = "bing"` 时，服务器会抓取 Bing 结果页并解析为结构化结果，**不需要任何 Key**：

- 查询清洗：自动去掉「请问 / 怎么样 / 吗 / 帮我查一下」等口语词
- 相关度重排：按 2-gram 重合度打分，过滤掉答非所问的结果
- 实测：「重庆今天天气怎么样？」→ 正确返回天气站结果，模型据此答出温度/风力/湿度

若某天 Bing 反爬变严，可切到自建 SearXNG（见下）。

## 8. 自建 SearXNG（完全免费、无 Key、无次数限制）
项目里已生成：
```
searxng/docker-compose.yml        # 容器编排
searxng/config/settings.yml       # 已启用 JSON API（formats: html, json）
启动搜索服务.bat                   # 一键启动
```
步骤：
1. 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（本机检测到尚未安装）
2. 双击 **`启动搜索服务.bat`**（首次拉镜像约 1–3 分钟）
3. 浏览器访问 `http://localhost:8080/search?q=test&format=json` 能看到 JSON 即成功
4. 修改 `config.json`：
```json
"search": { "provider": "searxng", "base": "http://localhost:8080", "maxResults": 4 }
```
5. 双击 **`重启服务器.bat`**，启动日志会显示 `search: 已配置 ✓ (searxng)`

## 9. 天气专用通道（无需 Key）
天气类问题（含「天气/气温/温度/下雨/降雨/预报」且能识别城市）会走 **wttr.in** 免费数据源，直接拿到准确数值：

```
用户：成都今天天气怎么样？
数据：成都 实时天气：烟霾，当前气温 23°C（体感 24°C），湿度 67%，风速 6km/h（W）；今日 17~26°C。
三玖：……成都今天有烟霾，现在 23°C，体感 24°C，湿度 67%，风不大 6km/h。
      ……今天最高 26°C、最低 17°C。出门的话，戴口罩会好一点 (´・ω・)
```
- 英文天气描述会映射成中文（Smoky haze → 烟霾、Partly cloudy → 局部多云…）
- 其他问题仍走 Bing 抓取 + 正文增强（优先提取含温度/日期的数据片段）

## 10. 搜索质量链路
```
提问 → 查询清洗（去掉"请问/怎么样/吗"）→ 数据源（天气通道 / Bing / SearXNG / 付费源）
     → 相关度重排（2-gram 打分过滤答非所问）
     → 正文增强（抓前 2 条网页，优先提取含数值的片段）
     → 注入模型上下文 → 三玖依据资料回答 + 来源卡片
```
