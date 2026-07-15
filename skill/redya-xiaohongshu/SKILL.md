---
name: redya-xiaohongshu
description: 当用户想生成小红书图文、种草笔记或商品带货图文时使用——通过红鸦开放平台 API 完成大纲创作、逐页出图与商品建档的全流程。
---

# 红鸦开放平台:小红书图文生成

通过红鸦(RedYA)开放平台 API,为用户生成完整的小红书图文笔记:标题 + 正文 + 多页配图。支持普通种草笔记与商品带货图文两种模式。

## 前置条件

- **API Key**:需要环境变量 `REDYA_API_KEY`,值以 `rk-` 开头。每个请求通过 `Authorization: Bearer $REDYA_API_KEY` 传递(也可用 `X-API-Key` 头)。
- **Base URL**:默认 `https://hy.ithinkai.cn`,可用环境变量 `REDYA_BASE_URL` 覆盖。下文 curl 统一写作 `${REDYA_BASE_URL:-https://hy.ithinkai.cn}`。
- **计费**:与网页端同价——大纲按次(默认 2 积分),图片按张(默认 5 积分/张),生成失败自动退款。消耗绑定账号的积分,生成记录在网页端「我的创作」可见(来源标记 `api`)。

### ⚠️ 第一步(必做):确认有可用的 API Key

调用任何红鸦接口前,先确认环境里有 `REDYA_API_KEY`(以 `rk-` 开头)。**没有、或任何接口返回 401,就停下来引导用户自助创建,不要瞎猜、不要反复重试。** 直接对用户说(可照抄):

> 你还没配置红鸦 API Key,几步就能拿到:
> 1. 打开 **https://hy.ithinkai.cn**,用微信扫码登录
> 2. 点左侧栏「**红鸦 Skills**」(或首页输入框上方的 🦞 红鸦 Skills 入口)
> 3. 点「**生成 API Key**」,复制 `rk-` 开头的 key(明文只显示这一次)
> 4. 回到这里设置环境变量:`export REDYA_API_KEY=rk-你复制的key`(默认 base url 为 https://hy.ithinkai.cn,私有部署再设 `REDYA_BASE_URL`)
>
> 配好后告诉我,我继续帮你生成。

拿到 key 再进行后续流程;key 消耗的是该用户自己账号的积分。

## 核心交互原则(必读)

这一节决定了你作为 Agent 该怎么用这套 API,比接口细节更重要。

### 1. 默认走「分步模式」,别急着出图

一篇图文 = 一条 record。正确的默认流程:

1. `POST /openapi/v1/outlines`(**不带** `auto`)先生成大纲;
2. 把返回的**标题、正文、每页图片说明**用 markdown 排版展示给用户,征求意见;
3. 用户用自然语言提修改意见(如"第 3 页换成对比图"、"标题再抓人一点")时,**由你自己改好 pages JSON**,调 `PUT /openapi/v1/outlines/:record_id` 整组覆盖更新,再把改后的版本展示给用户;
4. 用户明确确认满意后,才调 `POST /openapi/v1/images` 出图。

只有当用户**明确说**"直接出"、"一步到位"、"不用给我看大纲"之类时,才在 outlines 请求里带 `auto: true`,让大纲完成后立即整篇出图。

### 2. 出图是异步的,靠轮询拿结果

提交出图后拿到 `task_id`,接着**每 15~30 秒**调一次 `GET /openapi/v1/records/:record_id`,直到 `status` 进入终态之一:`completed` / `partial` / `error`。出图通常需要 1~5 分钟,轮询期间可以告知用户进度(已完成几页)。

拿到结果后,把每页图片以 **markdown 图片列表**呈现给用户:

```markdown
1. 封面
   ![第1页](https://cos.../task_x/0.png)
2. 内容页
   ![第2页](https://cos.../task_x/1.png)
```

### 3. `partial` 时主动兜底

`status: partial` 表示部分页失败。查看 `pages` 里哪些页 `status` 为 `failed`,**明确告诉用户是哪几页失败了**,并询问是否要对失败页单页重生成(`POST /openapi/v1/images/regenerate`)。重生成同样是异步的,继续轮询同一条 record。

### 4. 商品带货:先建档,再创作

- 用户给了**商品图 URL** → 先调 `POST /openapi/v1/products` 一键建档,拿到 `product_id`;
- 然后 `POST /openapi/v1/outlines` 时带上 `product_id`(style 会自动用带货风格,无需手动指定);
- 可选:先 `GET /openapi/v1/skills` 列出带货 Skill 让用户挑,outlines 时带 `skill_id`;
- 用户想做商品带货但**没给商品图**时,提醒用户:商品图文必须提供商品图片 URL(http/https 直链,1~30 张),或者用 `GET /openapi/v1/products` 看看账号下是否已有建好档的商品可直接复用。

---

## 接口速查

### POST /openapi/v1/outlines — 生成大纲(同步)

用途:根据主题生成小红书图文大纲(标题 + 正文 + 每页图片说明)。同步接口,秒级~1 分钟返回,服务端超时上限 4 分钟,**curl 必须带 `--max-time 300`**。

```bash
curl -sS --max-time 300 -X POST "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/outlines" \
  -H "Authorization: Bearer $REDYA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "三伏天养生茶推荐",
    "style": "xiaohongshu_2",
    "prompt_length": "short"
  }'
```

请求字段:
- `topic`(必填)创作主题
- `style`(可选)风格。默认:普通=`xiaohongshu_2`,带货=`xiaohongshu_4`
- `prompt_length`(可选)`short`|`long`,默认 `short`
- `product_id`(可选)商品图文模式必传(见 /products)
- `skill_id`(可选)带货 Skill(见 /skills)
- `image_urls`(可选)参考图 URL 数组(普通模式)
- `auto`(可选)`true` = 大纲完成后立即整篇出图
- `callback_url`(可选)auto 时出图完成后 webhook 回调

响应关键字段(auto=false):
- `record_id` 本篇图文唯一标识,后续所有操作都用它
- `title` / `content` 标题与小红书正文
- `pages[]` 每页说明:`index`、`type`(cover/content)、`content`(图片说明);商品模式还有 `matched_image_id`(配图 id)
- `points_cost` 本次扣的积分
- `status` 为 `draft`

auto=true 时额外返回 `task_id`、`pages_submitted`、`images_points_cost`,`status` 为 `generating_images`;若出图提交失败,大纲照常返回并附 `images_error`(此时可稍后手动调 /images)。

### PUT /openapi/v1/outlines/:record_id — 编辑大纲

用途:按用户修改意见更新大纲。`pages` 是**整组覆盖**(1~15 页),要把没改的页也原样带上。

```bash
curl -sS -X PUT "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/outlines/5fb16b40-xxxx" \
  -H "Authorization: Bearer $REDYA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "新标题",
    "content": "新正文",
    "pages": [
      {"index": 0, "type": "cover", "content": "改后的封面说明"},
      {"index": 1, "type": "content", "content": "第二页说明"}
    ]
  }'
```

请求字段:`pages`(必填,整组覆盖)、`title`(可选)、`content`(可选)。

响应:`{"record_id":"...","updated":true,"pages":5}`。图片生成中时返回 409,不可编辑。

### POST /openapi/v1/images — 整篇出图(异步)

用途:对已确认的大纲整篇出图。积分在提交时按页数预扣,提交/生成失败自动退款。

```bash
curl -sS -X POST "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/images" \
  -H "Authorization: Bearer $REDYA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "5fb16b40-xxxx"
  }'
```

请求字段:
- `record_id`(必填)
- `product_id` 商品图文必传(记录若之前出过商品图会自动继承)
- `skill_id`(可选)
- `image_urls`(可选)参考图;缺省沿用大纲阶段的
- `force`(可选)已完成的记录要整篇重出时传 `true`
- `callback_url`(可选)完成后 webhook

响应:`{"record_id":"...","task_id":"task_ab12cd34","pages_submitted":5,"points_cost":25,"status":"generating_images"}`

### GET /openapi/v1/records/:record_id — 状态轮询

用途:查询生成进度与结果。建议轮询间隔 15~30 秒。

```bash
curl -sS "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/records/5fb16b40-xxxx" \
  -H "Authorization: Bearer $REDYA_API_KEY"
```

响应关键字段:
- `status` 整篇状态:`draft` | `generating_outline` | `generating_images` | `completed` | `partial` | `error`
- `pages[]` 每页:`index`、`type`、`content`、`status`(not_generated/completed/generating/failed)、`image_url`(COS 直链,失败/未完成为空串)
- `title` / `content` / `style` / `source`(api)/ `page_count` / `created_at`

`partial` = 部分页失败,失败页可单独重生成。**图片 URL 为 COS 直链,建议 7 天内转存**。

### POST /openapi/v1/images/regenerate — 单页重生成(异步)

用途:对 failed(或用户不满意)的单页重出图。商品图文自动继承原商品信息。

```bash
curl -sS -X POST "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/images/regenerate" \
  -H "Authorization: Bearer $REDYA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "5fb16b40-xxxx",
    "page_index": 2
  }'
```

请求字段:`record_id`、`page_index`,可选 `callback_url`。

响应:`{"record_id":"...","page_index":2,"next_filename":"2_1.png","points_cost":5,"status":"generating"}`。该页生成中时返回 409。完成与否继续轮询 `GET /records/:record_id`。

### POST /openapi/v1/products — 商品建档(带货前置)

用途:用商品图片 URL 一键建立商品档案,拿 `product_id` 供 outlines/images 使用。

```bash
curl -sS -X POST "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/products" \
  -H "Authorization: Bearer $REDYA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "蓝金貔貅摆件",
    "image_urls": ["https://example.com/1.jpg", "https://example.com/2.jpg"],
    "labels": ["完整商品图", "质地细节图"]
  }'
```

请求字段:
- `name`(必填)商品名
- `image_urls`(必填)1~30 张,必须 http(s) 直链
- `labels`(可选)与图片一一对齐;缺省全部按"完整商品图"
- `brand` / `category` / `selling_points`(数组)/ `source_ref` 均可选

标签枚举:完整商品图/包装图/多角度图/套装组合图/质地细节图/其他细节图/工艺做工图/产品颜色图/尺寸规格图/模特上身图/使用对比图/使用步骤图/场景图/买家秀真实图/功能卖点图/成分配料图/资质认证图/其他

响应:`{"product_id":36,"name":"...","material_count":2}`。注意 `product_id` 在 outlines/images 里以字符串传入(如 `"36"`)。

### GET /openapi/v1/products — 我的商品档案

用途:列出账号下已建档商品,用户没给新图时可从中复用。

```bash
curl -sS "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/products" \
  -H "Authorization: Bearer $REDYA_API_KEY"
```

响应:`{"products":[{"product_id":36,"name":"...","cover_image":"...","material_count":2,...}]}`

### GET /openapi/v1/skills — 可用带货 Skill

用途:列出带货文案风格 Skill,可展示给用户挑选后在 outlines 里传 `skill_id`。

```bash
curl -sS "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/skills" \
  -H "Authorization: Bearer $REDYA_API_KEY"
```

响应:`{"skills":[{"skill_id":"real_exp","name":"真实体验种草","one_liner":"像自己用过的分享,不硬推"}]}`

### GET /openapi/v1/me — 账户信息

用途:查积分余额、key 信息与今日配额。402/429 时先调它再向用户说明。

```bash
curl -sS "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/me" \
  -H "Authorization: Bearer $REDYA_API_KEY"
```

响应:`{"user_id":3528,"nickname":"...","points_balance":355,"key_name":"...","key_prefix":"rk-1a2b3c4d","daily_quota":100,"used_today":12}`

---

## 错误处理

非 2xx 统一返回 `{"error":{"code":"...","message":"..."}}`。按状态码处置:

| 状态码 | code | Agent 该怎么做 |
|---|---|---|
| 401 | `missing_key`/`invalid_key`/`key_disabled`/`key_expired`/`user_disabled` | Key 缺失或无效。**引导用户自助创建**(见下方「没有 Key 怎么办」):访问 https://hy.ithinkai.cn 微信登录 → 左栏「红鸦 Skills」→「生成 API Key」→ 复制后 `export REDYA_API_KEY=rk-xxx`。不要反复重试或猜测 key |
| 402 | `insufficient_points` | 积分不足。调 `GET /me` 拿 `points_balance` 告诉用户当前余额,引导用户去红鸦网页端充值后再继续 |
| 403 | `forbidden` | 访问了他人资源,检查 record_id/product_id 是否属于当前 key 的账号 |
| 404 | `not_found` | 资源不存在,检查 id 是否拼错 |
| 409 | `conflict` | 生成中(或已完成)。不是错误——继续轮询 `GET /records/:id` 等终态;整篇重出已完成记录用 `force: true` |
| 422 | `invalid_request` | 参数错误,按 message 修正请求体 |
| 429 | `quota_exceeded` | 今日配额用尽。告诉用户该 key 的日生成配额已用完(可用 `GET /me` 看 `daily_quota`/`used_today`),明天再试或找管理员调额 |
| 5xx | — | 服务端异常,等几秒后重试一次;再失败就向用户如实报告 |

## 注意事项

- 单篇最多 **15 页**;`PUT /outlines/:id` 的 pages 必须 1~15 页。
- 大纲接口是同步的,服务端超时上限 4 分钟——curl 请带 **`--max-time 300`**,别用默认超时。
- 图片 URL 是 COS 直链,**建议 7 天内转存**到用户自己的存储,长期引用别依赖原链接。
- 请勿并发对同一 record 提交出图(有 409 保护)。
- 生成内容的归属与合规责任由调用方承担,平台保留全部生成记录;涉及功效宣称、医疗等敏感品类时提醒用户自行把关文案合规。
