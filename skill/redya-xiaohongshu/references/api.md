# 红鸦 OpenAPI 接口速查与错误处理

Base URL：`${REDYA_BASE_URL:-https://hy.ithinkai.cn}`，认证头 `Authorization: Bearer $REDYA_API_KEY`。

## POST /openapi/v1/outlines — 生成大纲(同步)

用途:根据主题生成小红书图文大纲(标题 + 正文 + 每页图片说明)。同步接口,通常秒级~1 分钟返回,复杂内容可能更久。服务端总超时上限 **5 分钟**(包含渠道切换),**curl 请带 `--max-time 360`**,为返回和保存结果留出余量。

文本渠道按网页后台对应创作模式的当前配置调用。普通图文与商品图文分别使用各自的渠道列表,按配置顺序选择;遇到 503、额度不足等明确的渠道失败时切换下一项,单次大纲最多调用 3 个渠道。不会因格式检查失败反复重写或自动补全。旧版 Skill 传入的 `xiaohongshu_2`、`xiaohongshu_3`、`xiaohongshu_4` 继续兼容,无需为了渠道修复重新安装。`style` 不用于指定文本渠道,默认输出上限为 16000 tokens(可由管理员按渠道配置覆盖)。

```bash
curl -sS --max-time 360 -X POST "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/outlines" \
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
- `source_id`(可选)先用 `POST /sources` 解析链接拿到的 ID,原内容会作为参考资料进入生成
- `knowledge_base_ids`(可选)知识库 ID 数组,最多 5 个(见 /knowledge-bases)。用户没提就别带
- `auto`(可选)`true` = 大纲完成后立即整篇出图
- `callback_url`(可选)auto 时出图完成后 webhook 回调

响应关键字段(auto=false):
- `record_id` 本篇图文唯一标识,后续所有操作都用它
- `title` / `content` 标题与小红书正文
- `pages[]` 每页说明:`index`、`type`(cover/content)、`content`(图片说明);商品模式还有 `matched_image_id`(配图 id)
- `points_cost` 本次扣的积分
- `status` 为 `draft`

auto=true 时额外返回 `task_id`、`pages_submitted`、`images_points_cost`,`status` 为 `generating_images`;若出图提交失败,大纲照常返回并附 `images_error`(此时可稍后手动调 /images)。

## PUT /openapi/v1/outlines/:record_id — 编辑大纲

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

## POST /openapi/v1/images — 整篇出图(异步)

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

## GET /openapi/v1/records/:record_id — 状态轮询

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

## POST /openapi/v1/images/regenerate — 单页重生成(异步)

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

## POST /openapi/v1/products — 商品建档(带货前置)

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

## GET /openapi/v1/products — 我的商品档案

用途:列出账号下已建档商品,用户没给新图时可从中复用。

```bash
curl -sS "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/products" \
  -H "Authorization: Bearer $REDYA_API_KEY"
```

响应:`{"products":[{"product_id":36,"name":"...","cover_image":"...","material_count":2,...}]}`

## GET /openapi/v1/skills — 可用带货 Skill

用途:列出带货文案风格 Skill,可展示给用户挑选后在 outlines 里传 `skill_id`。

```bash
curl -sS "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/skills" \
  -H "Authorization: Bearer $REDYA_API_KEY"
```

响应:`{"skills":[{"skill_id":"real_exp","name":"真实体验种草","one_liner":"像自己用过的分享,不硬推"}]}`

## POST /openapi/v1/sources — 链接解析(异步)

把一条平台链接解析成可复用的文案素材。**每次成功解析扣 2 积分,失败不扣。**

请求:

```json
{ "url": "https://v.douyin.com/xxxxx/" }
```

`url` 可以是纯链接,也可以直接把整段分享口令粘进来(如 `7.41 复制打开抖音,看看【...】 https://v.douyin.com/xxx/`),服务端会自己提取。

支持的平台:小红书(`xiaohongshu.com` / `xhslink.com` / `xhslink.cn`)、抖音(`douyin.com`)、公众号(`mp.weixin.qq.com`)、快手(`kuaishou.com`)、B站(`bilibili.com` / `b23.tv`)。

响应:`{"source_id":"src_...","platform":"douyin","content_type":"video","status":"pending","points_cost":2}`

## GET /openapi/v1/sources/:source_id — 解析结果轮询

`status`:`pending` → `processing` → `ready` / `failed`。**每 5~10 秒轮一次**,通常 20~60 秒完成(视频要下载+转写,可能到 2 分钟)。

`ready` 时的响应:

```json
{
  "source_id": "src_...",
  "platform": "douyin",
  "content_type": "video",
  "status": "ready",
  "title": "...",
  "author": "...",
  "content_text": "原文案(图文类是正文,视频类常常很短或为空)",
  "transcript": "口播文案:视频人声的逐句转写",
  "images": ["https://.../content-sources/src_x/media/0"],
  "video_url": "https://.../content-sources/src_x/video",
  "original_url": "https://v.douyin.com/xxxxx/"
}
```

`failed` 时看 `error` 字段,原样转述给用户。常见原因:链接失效、平台风控、视频没有人声。

`images` 和 `video_url` 是**带鉴权的代理地址**,直接展示给用户即可;平台原始 CDN 地址带签名且校验来源,拿到也用不了。

## GET /openapi/v1/knowledge-bases — 我的知识库

响应:`{"list":[{"knowledge_base_id":"folder_xxx","name":"护肤材料"}]}`

拿到的 `knowledge_base_id` 用于 `POST /outlines` 的 `knowledge_base_ids`。

## GET /openapi/v1/me — 账户信息

用途:查积分余额、key 信息与今日配额。402/429 时先调它再向用户说明。

```bash
curl -sS "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/me" \
  -H "Authorization: Bearer $REDYA_API_KEY"
```

响应:`{"user_id":3528,"nickname":"...","points_balance":355,"key_name":"...","key_prefix":"rk-1a2b3c4d","daily_quota":100,"used_today":12}`

## 错误处理完整表

非 2xx 统一返回 `{"error":{"code":"...","message":"..."}}`。按状态码处置:

| 状态码 | code | Agent 该怎么做 |
|---|---|---|
| 401 | `missing_key`/`invalid_key`/`key_disabled`/`key_expired`/`user_disabled` | Key 缺失或无效。**引导用户自助创建**:访问 https://hy.ithinkai.cn/developer 微信登录 → 左栏「红鸦 Skills」→「生成 API Key」→ 复制后 `export REDYA_API_KEY=rk-xxx`。不要反复重试或猜测 key |
| 402 | `insufficient_points` | 积分不足。调 `GET /me` 拿 `points_balance` 告诉用户当前余额,引导用户去红鸦网页端充值后再继续 |
| 403 | `forbidden` | 访问了他人资源,检查 record_id/product_id 是否属于当前 key 的账号 |
| 404 | `not_found` | 资源不存在,检查 id 是否拼错 |
| 409 | `conflict` | 生成中(或已完成)。不是错误——继续轮询 `GET /records/:id` 等终态;整篇重出已完成记录用 `force: true` |
| 422 | `invalid_request` | 参数错误,按 message 修正请求体 |
| 422 | `invalid_text_encoding` | 中文编码疑似损坏。原稿不覆盖、不扣费;按 UTF-8 说明从正常原文重新发送,不要继续生图 |
| 429 | `quota_exceeded` | 今日配额用尽。告诉用户该 key 的日生成配额已用完(可用 `GET /me` 看 `daily_quota`/`used_today`),明天再试或找管理员调额 |
| 5xx | — | 大纲服务已按配置尝试渠道切换。仍失败时报告具体原因,不要自动连续重提;已有 `record_id` 的请求先查记录状态,避免结果未确认就重复出图 |

## 注意事项

- **响应 JSON 可能含未转义控制字符**（如字符串里的原文换行），严格解析会报 `Invalid control character`。解析请用宽松模式：Python `json.loads(s, strict=False)`，Node 可先 `s.replace(/\r?\n/g,'\\n')`。解析报错时不要当成接口失败反复重试，改用宽松解析再判读。
- 单篇最多 **15 页**；`PUT /outlines/:id` 的 pages 必须 1~15 页。
- 大纲接口是同步的,服务端总超时上限 **5 分钟**,包含渠道切换;curl 请带 **`--max-time 360`**。5 分钟是最长等待时间,不是每次都要等满。
- 图片 URL 是 COS 直链,**建议 7 天内转存**到用户自己的存储,长期引用别依赖原链接。
- 请勿并发对同一 record 提交出图(有 409 保护)。
- 生成内容的归属与合规责任由调用方承担,平台保留全部生成记录;涉及功效宣称、医疗等敏感品类时提醒用户自行把关文案合规。
