# 架构说明（长期发展策略）

> 目标：从「一个粉丝应援 H5」演进为「可安装的多端 AI Agent」。
> 核心原则：**客户端只调用自己的 API，永不直连模型厂商**；Key、人设、记忆、搜索、工具全部收敛到服务端。

## 一、三层架构

```
┌───────────────────────────────────────────────┐
│ 客户端层（同一套前端，多种壳）                  │
│  H5 → PWA（已支持安装）→ 小程序 → 桌面/移动 App │
│  职责：渲染、交互、执行服务端下发的界面指令      │
└──────────────────┬────────────────────────────┘
                   │ HTTPS（只调 /api/*）
┌──────────────────▼────────────────────────────┐
│ 你的 API 层（server.js，可部署为云函数/容器）   │
│  /api/chat   对话：人设 + RAG + 记忆 + 搜索 + 模型│
│  /api/search 联网检索                          │
│  /api/memory 长期记忆读写                      │
│  /api/health 健康检查（模型/搜索是否就绪）      │
└──────────────────┬────────────────────────────┘
                   │
┌──────────────────▼────────────────────────────┐
│ 能力与数据层                                   │
│  大模型（DeepSeek / 混元 / …）                  │
│  搜索服务 · 知识库（ai/knowledge.md → 向量库）   │
│  记忆存储（data/memory/*.json → 云数据库/Redis） │
└───────────────────────────────────────────────┘
```

## 二、接口契约

### 1) POST /api/chat
请求：
```json
{
  "userId": "u7f3a91b",
  "messages": [{ "role": "user", "content": "带我去看专辑" }],
  "memory": { "name": "小明", "todos": [{ "t": "交作业", "done": false }] },
  "options": { "search": true }
}
```
响应（已接入模型）：
```json
{
  "mode": "api",
  "reply": "……好。专辑在那边，我陪你一起看。",
  "actions": [{ "type": "go_section", "id": "albums" }],
  "sources": [{ "title": "…", "url": "…", "snippet": "…" }],
  "usedSearch": true,
  "user": { "name": "小明" }
}
```
响应（未配置模型，前端自动回退本地人格引擎）：
```json
{ "mode": "local", "reason": "model-not-configured" }
```

### 2) POST /api/search
`{ "q": "重庆天气" }` → `{ "items": [{ "title", "url", "snippet" }], "live": true|false }`

### 3) GET /api/memory?userId=… / POST /api/memory
POST `{ "userId": "u7f3a91b", "patch": { "name": "小明" } }` → 返回完整记忆对象。

### 4) GET /api/health
`{ "ok": true, "model": { "configured": false, "name": "deepseek-flash" }, "search": { "configured": false } }`

## 三、工具指令协议（Agent 的关键）
模型可以在回答里追加一行结构化指令（服务端解析后下发，前端执行）：
```
<action>{"type":"go_section","id":"albums"}</action>
<action>{"type":"music_play"}</action>
<action>{"type":"music_volume","value":40}</action>
<action>{"type":"timer_add","seconds":15,"label":"看消息"}</action>
<action>{"type":"todo_add","text":"周五交材料"}</action>
```
好处：**换客户端（小程序 / App / 桌面）同一套指令直接复用**，前端只做「渲染 + 执行」。

## 四、配置（服务端）
`config.json`（或同名环境变量，环境变量优先）：
```json
{
  "model":  { "base": "https://api.deepseek.com/chat/completions", "key": "sk-…", "name": "deepseek-flash", "temperature": 0.85 },
  "search": { "endpoint": "https://your-proxy/search?q=", "key": "" }
}
```
也支持 `MODEL_BASE_URL / MODEL_API_KEY / MODEL_NAME / SEARCH_ENDPOINT / PORT / ALLOW_ORIGIN / RATE_LIMIT_PER_MIN` 环境变量（见 `config.example.env`）。

## 五、数据模型（记忆）
```json
{
  "userId": "u7f3a91b",
  "name": "小明",
  "todos": [{ "t": "周五交材料", "done": false, "ts": 1791032005451 }],
  "notes": [],
  "history": [{ "role": "user", "content": "…" }, { "role": "assistant", "content": "…" }],
  "updatedAt": 1791032005451
}
```
存储位置：`data/memory/<userId>.json`。上云时替换为云数据库/Redis 即可，接口不变。

## 六、安全
- 模型 Key **只存在服务端**（`config.json` / 环境变量），前端拿不到
- 简单限流：默认 40 次/分钟/IP（`RATE_LIMIT_PER_MIN`）
- CORS 可收紧：`ALLOW_ORIGIN=https://你的域名`
- 上云建议再加：API 网关密钥、JWT 鉴权、日志（CLS）

## 七、演进路线
| 阶段 | 形态 | 需要做的事 |
| --- | --- | --- |
| 现在 | H5 + 自有 API + PWA | 已完成：`server.js`、`manifest.webmanifest`、`sw.js`、安装按钮 |
| 下一步 | 微信小程序 | 复用 `/api/*`；WebView 指向 H5 或重写对话页 |
| 再下一步 | 桌面/移动 App | Tauri / Capacitor 包壳，仍调同一套 API |
| 终态 | Agent / Skill | 把「人设 + 工具定义 + 知识库」封装为 Skill，可被其它 Agent 调用；记忆与工具走服务端 |

> 比赛设计说明可写：「采用前后端分层 + 服务端持有模型凭证 + 结构化工具调用 + 服务端记忆，具备从 H5 演进为多端 Agent 的完整路径。」
