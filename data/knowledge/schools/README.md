# 多学校知识库目录规范

每个学校一个独立目录：

```text
data/knowledge/schools/<school-id>/
  source.json              # 抓取配置
  documents.jsonl          # 正文文档
  chunks.jsonl             # RAG 知识块
  course-catalog.jsonl     # 课程/资源目录元数据
  index.json               # 导入统计
  NOTICE.md                # 来源与许可说明
  raw/                     # 原始 sitemap、robots、Markdown
```

## 新增学校

1. 复制 `_template/source.example.json` 到新学校目录。
2. 填写学校名称、资源站、sitemap 和正文路径模板。
3. 检查对方 `robots.txt`，只抓允许的公开内容。
4. 运行：

```powershell
python tools/ingest_school_resources.py --config data/knowledge/schools/<school-id>/source.json
```

5. 重启 `server.js`。服务端会自动加载该学校，无需修改前端页面。

## 接入原则

- 社区资源必须标记为“非官方”，保留来源链接和许可信息。
- 不抓 `/admin`、登录页、隐私数据、付费资料或 robots 禁止路径。
- 课程空壳页只保留标题和课程代码，不把“暂无数据”当知识。
- 后续 Agent 可以复用同一份 RAG 数据，也可通过 `/api/health` 查看已加载学校数量。
## 重新清洗已有正文

不需要重新抓取时，可运行：python tools/ingest_school_resources.py --config <source.json> --rebuild-index。
