# 红鸦开放平台 API v1

面向 Agent / 第三方程序的机器接口。生成能力、计费、记录与网页端完全同源:消耗绑定账号的积分,生成记录可在「我的创作」与后台管理中看到(来源标记为 `api`)。

- **Base URL**: `https://<你的红鸦域名>`(路径前缀 `/openapi/v1`)
- **鉴权**: 每个请求带 `Authorization: Bearer rk-xxxx...` 或 `X-API-Key: rk-xxxx...`
- **Key 获取**: 由管理员在后台「API Key 管理」页创建,明文只显示一次
- **计费**: 与网页端同价——大纲按次(默认 2 积分,可按风格自定义),图片按张(默认 5 积分/张,风格可自定义)。生成失败自动退款
- **配额**: Key 可设每日生成类调用上限,超出返回 429
- **错误格式**: 非 2xx 返回 `{"error":{"code":"...","message":"..."}}`
  - 401 `missing_key`/`invalid_key`/`key_disabled`/`key_expired`/`user_disabled`
  - 402 `insufficient_points` 积分不足
  - 403 `forbidden` 访问他人资源
  - 404 `not_found`
  - 409 `conflict`(生成中/已完成)
  - 422 `invalid_request` 参数错误
  - 429 `quota_exceeded` 日配额用尽
  - 500 `internal_error` 服务端错误,可稍后重试一次

## 核心概念与流程

一篇小红书图文 = 一条 **record**(record_id 标识)。两步生成:
1. **大纲**(同步,秒级~1分钟): 标题 + 正文 + 每页图片说明
2. **出图**(异步,1~5分钟): 按大纲逐页生成图片,轮询状态或用 webhook 回调

两种用法:
- **一步到位**: `POST /outlines` 带 `auto: true` → 直接排队出图 → 轮询 `GET /records/:id`
- **分步可改**: `POST /outlines` → 展示给用户/由 Agent 修改 → `PUT /outlines/:id` → `POST /images` → 轮询

商品图文(带货)需先有商品档案: `POST /products` 用图片 URL 一键建档,拿到 `product_id` 后在 outlines/images 里传入。

---

## POST /openapi/v1/outlines — 生成大纲

```jsonc
{
  "topic": "三伏天养生茶推荐",        // 必填,创作主题
  "style": "xiaohongshu_2",          // 可选,风格。默认: 普通=xiaohongshu_2,带货=xiaohongshu_4
  "prompt_length": "short",          // 可选 short|long,默认 short
  "product_id": "36",                // 可选,商品图文模式必传(见 /products)
  "skill_id": "real_exp",            // 可选,带货 Skill(见 /skills)
  "image_urls": ["https://..."],     // 可选,参考图 URL(普通模式)
  "auto": true,                      // 可选,true=大纲完成后立即整篇出图
  "callback_url": "https://..."      // 可选,auto 时出图完成后 webhook 回调
}
```

响应(auto=false):
```jsonc
{
  "record_id": "5fb16b40-...",
  "title": "三伏天喝对茶,湿气悄悄溜走✨",
  "content": "小红书正文...",
  "pages": [
    {"index":0, "type":"cover",   "content":"封面:..."},
    {"index":1, "type":"content", "content":"...", "matched_image_id":"img_2"}  // 商品模式含配图id
  ],
  "style": "xiaohongshu_2",
  "points_cost": 2,
  "status": "draft"
}
```
auto=true 时额外返回 `task_id` / `pages_submitted` / `images_points_cost`,`status` 为 `generating_images`;若出图提交失败,大纲照常返回并附 `images_error`。

## PUT /openapi/v1/outlines/:record_id — 编辑大纲

```jsonc
{
  "pages": [ {"index":0,"type":"cover","content":"改后的封面说明"}, ... ],  // 必填,整组覆盖(1~15页)
  "title": "新标题",      // 可选
  "content": "新正文"     // 可选
}
```
响应: `{"record_id":"...","updated":true,"pages":5}`。图片生成中(409)不可编辑。

## POST /openapi/v1/images — 整篇出图(异步)

```jsonc
{
  "record_id": "5fb16b40-...",   // 必填
  "product_id": "36",            // 商品图文必传(记录若之前出过商品图会自动继承)
  "skill_id": "real_exp",
  "image_urls": ["https://..."], // 可选参考图;缺省沿用大纲阶段的
  "force": false,                // 已完成的记录要整篇重出时传 true
  "callback_url": "https://..."  // 可选,完成后 webhook
}
```
响应: `{"record_id":"...","task_id":"task_ab12cd34","pages_submitted":5,"points_cost":25,"status":"generating_images"}`
积分在提交时预扣,提交/生成失败自动退款。

## GET /openapi/v1/records/:record_id — 状态轮询

响应:
```jsonc
{
  "record_id": "...", "status": "generating_images",  // draft|generating_outline|generating_images|completed|partial|error
  "title": "...", "content": "...", "style": "...", "source": "api",
  "page_count": 5,
  "pages": [
    {"index":0, "type":"cover", "content":"...", "status":"completed",  "image_url":"https://cos.../task_x/0.png"},
    {"index":1, "type":"content", "content":"...", "status":"generating", "image_url":""},   // not_generated|generating|completed|failed
    {"index":2, "type":"content", "content":"...", "status":"failed",     "image_url":""}
  ],
  "created_at": "..."
}
```
建议轮询间隔 15~30 秒。`partial` = 部分页失败(失败页可单独重生成)。
图片 URL 为 COS 直链,**建议 7 天内转存**到自己的存储。

## POST /openapi/v1/images/regenerate — 单页重生成(异步)

```jsonc
{ "record_id": "...", "page_index": 2, "callback_url": "https://..." }
```
响应: `{"record_id":"...","page_index":2,"next_filename":"2_1.png","points_cost":5,"status":"generating"}`
商品图文自动继承原商品信息。该页生成中时返回 409。

## POST /openapi/v1/products — 商品建档(带货前置)

```jsonc
{
  "name": "蓝金貔貅摆件",                       // 必填
  "image_urls": ["https://...1.jpg", "..."],    // 必填,1~30张,必须 http(s)
  "labels": ["完整商品图","质地细节图"],          // 可选,与图片对齐;缺省全部按"完整商品图"
  "brand": "", "category": "", "selling_points": ["..."], "source_ref": ""
}
```
响应: `{"product_id":36,"name":"...","material_count":2}`

标签枚举: 完整商品图/包装图/多角度图/套装组合图/质地细节图/其他细节图/工艺做工图/产品颜色图/尺寸规格图/模特/上身图/使用对比图/使用步骤图/场景图/买家秀/真实图/功能卖点图/成分配料图/资质认证图/其他

## GET /openapi/v1/products — 我的商品档案
响应: `{"products":[{"product_id":36,"name":"...","cover_image":"...","material_count":2,...}]}`

## GET /openapi/v1/skills — 可用带货 Skill
响应: `{"skills":[{"skill_id":"real_exp","name":"真实体验种草","one_liner":"像自己用过的分享,不硬推"}]}`

## GET /openapi/v1/me — 账户信息
响应: `{"user_id":3528,"nickname":"...","points_balance":355,"key_name":"...","key_prefix":"rk-1a2b3c4d","daily_quota":100,"used_today":12}`

---

## Webhook 回调

在 images/regenerate/auto-outlines 传 `callback_url` 后,记录到达终态(completed/partial/error)时 POST:

```jsonc
{
  "event": "record.finished",
  "record_id": "...",
  "status": "completed",
  "timestamp": 1783600000,
  "record": { /* 与 GET /records/:id 相同结构 */ }
}
```

请求头:
- `X-RedYA-Event: record.finished`
- `X-RedYA-Signature: <hex>` —— `HMAC-SHA256(body, key)`,其中 key = 你的明文 API Key 的 SHA-256 十六进制小写字符串(即 `hex(sha256(明文key))`,64字符),用于验签

2xx 视为成功;失败重试 2 次(5s/15s)。回调不保证顺序,请以 `record_id`+`status` 幂等处理。

## 限制与约定

- 单篇最多 15 页
- 大纲接口为同步调用,超时上限 4 分钟,客户端请设 ≥5 分钟超时
- 生成内容归属与合规责任由调用方承担,平台保留全部生成记录
- 请勿并发对同一 record 提交出图(409 保护)

## 已知限制(V0)

- **单实例假设**:并发防护(记录锁)是进程内锁,与网页端一致假定单实例部署;多实例横向扩展需改为分布式锁或 DB 行锁。
- **日配额为软限制**:配额在生成前按已落库调用数检查,高并发瞬时可能轻微越过(每次生成仍扣积分,自限)。
- **积分余额检查非行锁**:极端并发下余额可能被短暂越过(与网页端同一既有行为),正常调用量下不受影响。
- 大纲为同步接口;若需完全无阻塞可用 `auto:true` + `callback_url` 走异步回调。
