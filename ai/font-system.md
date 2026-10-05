# MikuAI 字体系统说明

## 为什么要分层

静态页面文案在发布前是确定的，可以子集化；AI 回复是运行时生成的，不能预先知道会出现哪些字。  
如果把同一份静态子集字体用于聊天，模型一旦输出子集外字符，浏览器就会回退到系统字体，于是出现“有的字字体不对”。

## 当前方案

| 层级 | 字体文件 | 使用范围 | 特点 |
| --- | --- | --- | --- |
| 静态子集 | `assets/fonts/miku-hand.woff2` | 标题以外的固定长文本 | 体积最小，页面启动快 |
| AI 常用字 | `assets/fonts/miku-hand-chat.woff2` | AI 回复、跟随气泡、计时标签 | 覆盖 GB2312 常用汉字与日文假名，约 1.9MB |
| AI 完整兜底 | `assets/fonts/miku-hand-full.woff2` | 聊天子集缺字时自动使用 | 22,086 个字形，仅按需加载 |
| 系统近似兜底 | `KaiTi / STKaiti / Kaiti SC` | 极端缺字、字体加载失败 | 视觉上仍接近手写楷体 |

AI 字体栈：

```css
--font-ai: 'MikuHandAi', 'MikuHandAiFull', 'KaiXinJiuXiaoLinYuJiuZou-2',
  'PingFang SC', 'Hiragino Sans GB', 'KaiTi', 'STKaiti', sans-serif;
```

## 维护规则

1. 不要根据当前回复内容临时压缩 AI 字体子集。
2. 修改固定文案后，运行 `python tools/optimize_assets.py` 或 `tools/build_single.py`，静态子集会自动同步。
3. 替换完整字体后，重新运行优化脚本，聊天子集和完整字体都会重建。
4. 字体 URL 会自动写入内容哈希，避免浏览器缓存旧字体。
5. 单文件版内嵌约 2MB 聊天字体；7MB 完整字体保留在网页版按需加载。

## 排查方法

- 缺字检查：用 `fontTools` 读取 WOFF2 的 `cmap`，确认字符是否在字体覆盖范围内。
- 加载检查：浏览器 Network 面板搜索 `miku-hand-chat.woff2`，应返回 200 且类型为 `font/woff2`。
- 样式检查：AI 回复气泡的 `font-family` 应包含 `MikuHandAi`。
- 缓存检查：若仍显示旧字体，强制刷新并确认 `style.css` 与 `ai.css` 的版本号已更新。
## 说明

Emoji 与部分特殊符号不由手写字体提供，会按系统彩色 Emoji 字体渲染；这是正常回退，不属于汉字缺字。
