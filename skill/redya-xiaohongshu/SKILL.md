---
name: redya-xiaohongshu
description: 输入一句话或粘贴小红书图文、公众号文章、抖音快手视频链接，就能生成标题、正文和配图，支持一步出图、批量创作、爆文复刻、Live 实况图文和敏感词检测。成稿可通过插件发布到小红书、抖音、公众号等多平台。
---

# 红鸦AI-skill：小红书图文批量生成与发布

输入一句话或粘贴小红书图文、公众号文章、抖音快手视频链接，就能生成标题、正文和配图，支持一步出图、批量创作、爆文复刻、Live 实况图文和敏感词检测。成稿可通过插件发布到小红书、抖音、公众号等多平台。

**接口细节**：全部接口的 URL、请求/响应字段、curl 示例、完整错误处理表见 [references/api.md](references/api.md)；Live 实况与敏感词检测的详细流程见 [references/live-photo-and-review.md](references/live-photo-and-review.md)。用到哪块读哪块，不要一次性全读。

## 前置条件（必做）

- **API Key**：环境变量 `REDYA_API_KEY`，值以 `rk-` 开头，经 `Authorization: Bearer $REDYA_API_KEY` 传递。
- **Base URL**：默认 `https://hy.ithinkai.cn`，可用 `REDYA_BASE_URL` 覆盖。下文统一写作 `${REDYA_BASE_URL:-https://hy.ithinkai.cn}`。
- **计费**：与网页端同价——大纲 2 积分/次，图片 5 积分/张（默认），生成失败自动退款，消耗绑定账号积分，网页端「我的创作」可见（来源标记 `api`）。
- **第一步必做**：调用任何接口前确认 `REDYA_API_KEY` 存在。没有、或任何接口返回 401，就停下来引导用户自助创建，不要瞎猜、不要反复重试。直接对用户说（可照抄）：

> 你还没配置红鸦 API Key，几步就能拿到：
>
> 1. 打开 **https://hy.ithinkai.cn/developer**，用微信扫码登录
> 2. 点左侧栏「**红鸦 Skills**」（或首页输入框上方的 🦞 红鸦 Skills 入口）
> 3. 点「**生成 API Key**」，复制 `rk-` 开头的 key（明文只显示这一次）
> 4. 回到这里设置环境变量：`export REDYA_API_KEY=rk-你复制的key`
>
> 配好后告诉我，我继续帮你生成。

## 核心流程：图文创作（默认分步模式）

一篇图文 = 一条 record。默认流程：

1. `POST /openapi/v1/outlines`（**不带** `auto`）生成大纲；
2. 把返回的内容按下面的展示模板**完整**呈现给用户，征求意见。硬性要求：`pages[].content` 是一整段多行原文（`[封面]`/`[内容]`/`[总结]` → 页面标题 → 清单条目 → 空行 → `配图建议：…`），必须**逐页整段照录**，尤其“配图建议”那段不许省略、不许缩写、不许压进表格；接口未返回的字段（如整体视觉风格）不要自己编造，说明“接口未提供”即可；
3. 用户提修改意见（如"第 3 页换成对比图"）时，由你自己改好 pages JSON，调 `PUT /openapi/v1/outlines/:record_id` **整组覆盖**更新，再按模板完整展示；
4. 用户明确确认满意后，才调 `POST /openapi/v1/images` 出图。

大纲展示模板（必须遵守，`原文` 处照录接口返回，一字不改、一行不删）：

```markdown
## 📌 标题
（title 原文）

## 📝 正文
（content 原文，逐段保留，含全部 emoji 与话题标签，不合并段落、不删句子）

## 🎨 逐页配图大纲（共 N 页）

**第 1 页 · 封面**
[封面]
（页面标题原文）
（清单条目/说明原文，逐行保留）

配图建议：（该页 content 里“配图建议：”之后的原文，单独成段，完整照录）

**第 2 页 · 内容**
[内容]
（页面标题原文）
（清单条目原文，逐行保留）

配图建议：（原文）

……逐页照录到最后一页，页码、类型、每行内容与接口返回完全一致
```

只有用户**明确说**"直接出"、"一步到位"时，才在 outlines 请求带 `auto: true`。

## 通用规则（必读）

- **出图是异步的**：提交后拿 `task_id`，每 15~30 秒轮询 `GET /records/:record_id`，直到 `completed` / `partial` / `error`；结果用 markdown 图片列表呈现。
- **出图必须确认已提交**：`POST /images` 的响应里必须有 `task_id`。没有 `task_id`、或返回了 `images_error`、或请求失败，就**立即告诉用户失败原因并停止**，禁止静默重试、禁止继续空等轮询；轮询超过 10 分钟仍是 `generating_images` 时，向用户报告当前进度并询问是否继续等待，不要无限轮询。
- **partial 主动兜底**：部分页失败时明确告诉用户是哪几页，询问是否单页重生成（`POST /images/regenerate`），继续轮询同一条 record。
- **用户给了链接先解析再改写**：支持小红书/抖音/公众号/快手/B站（含分享口令）。`POST /sources`（扣 2 积分，失败不扣）→ 每 5~10 秒轮询 → **先把原内容摘要给用户确认** → outlines 带 `source_id`。视频类价值在 `transcript`（口播转写），`content_text` 往往很短；transcript 为空的纯 BGM 视频如实告知，别硬编。解析结果保留 72 小时。
- **知识库先列再选**：用户提到知识库时先 `GET /knowledge-bases` 让他挑，outlines 带 `knowledge_base_ids`（最多 5 个）。**用户没提就别自作主张带上**。
- **商品带货先建档**：有商品图 URL → 先 `POST /products` 拿 `product_id`，outlines 自动用带货风格；没给商品图时提醒带货必须提供 1~30 张 http(s) 直链，或从 `GET /products` 复用已建档商品。
- **中文必须 UTF-8**：请求 JSON 由程序序列化写入 UTF-8 文件后 `--data-binary @request.json` 发送，不要经命令行管道转码。返回 `422 invalid_text_encoding` 表示编码损坏：保留原稿、不扣费、从原文重新构造，不要猜字补回或重复提交乱码。
- **编辑后核对**：大纲编辑后先 `GET /records/:id` 核对与用户确认版本一致，再提交生图。
- **图片 URL 是 COS 直链，建议 7 天内转存**；单篇最多 15 页；大纲接口同步、服务端总超时 5 分钟，curl 带 `--max-time 360`；勿并发对同一 record 出图（有 409 保护）。

## Live 实况图与敏感词检测（入口）

仅转实况或检测文案时直接用工具接口，**不要**先生成图文大纲。详细参数、curl 示例与个人词库操作见 [references/live-photo-and-review.md](references/live-photo-and-review.md)。

- **图片转 Live 实况**：`GET /live-photos/capabilities` 查模式/模型/报价（`mode=live` 免费镜头动效；`mode=ai` AI 自然动态，先展示报价并取得授权）→ 为每张图生成 UUID `request_id`，multipart 上传（重试复用同一 UUID，参数冲突 409）→ 每 5–10 秒轮询 → `GET /live-photos/:request_id/content?format=pvt` 下载（另支持 mp4/photo/ios/android/mac/windows；下载路径需拼 Base URL 且带 Key，先存本地再交付，不能当公开链接，也不能表述成"已导入手机实况相册"）。
- **敏感词检测**：`GET /content-review/status` 先告知费用 → `POST /content-review` 检测（每次 1–64 段、共 1–30000 字，UTF-8）→ 展示 findings 让用户确认范围 → `POST /content-review/replace` 执行修改（携带原样 fields、完整原始 review、选中的 finding_ids）。检测不等于平台审核通过，不自动发布。个人词库仅在用户明确要求时操作，不扣检测积分。

## 错误处理速览

非 2xx 统一返回 `{"error":{"code":"...","message":"..."}}`。最常见的四种：

| 状态码 | 处置                                           |
| --- | -------------------------------------------- |
| 401 | Key 缺失/无效 → 按上方话术引导用户自助创建，不要反复重试             |
| 402 | 积分不足 → `GET /me` 查余额告知用户，引导网页端充值             |
| 409 | 生成中/已完成，不是错误 → 继续轮询；整篇重出已完成记录用 `force: true` |
| 429 | 今日配额用尽 → 告知用户（`GET /me` 可看配额），明天再试或调额        |

完整错误码表（403/404/422/5xx 等）见 [references/api.md](references/api.md)。
