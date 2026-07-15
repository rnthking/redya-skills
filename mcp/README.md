# redya-mcp — 红鸦开放平台 MCP Server

把红鸦开放平台 OpenAPI v1(见 `docs/openapi-v1.md`)包装成 **MCP stdio Server**,让 Claude Code、Cursor 等支持 MCP 的 Agent 直接生成小红书图文:生成大纲 → (可选修改) → 整篇出图 → 轮询取结果,以及商品建档、单页重生成等。

- 计费、记录与网页端完全同源(消耗绑定账号的积分,来源标记 `api`)
- 依赖: Node.js ≥ 18(用全局 `fetch`)、`@modelcontextprotocol/sdk`、`zod`

## 安装

```bash
cd openapi-clients/mcp
npm install
```

启动验证(stdio 模式,启动后等待 MCP 客户端接入,stderr 打印一行启动日志):

```bash
REDYA_API_KEY=rk-xxxx node index.js
```

也可用 npx(在本目录内或 `npm link` 之后):

```bash
REDYA_API_KEY=rk-xxxx npx redya-mcp
```

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `REDYA_API_KEY` | 是 | 后台「API Key 管理」页创建的 Key(`rk-` 开头,明文只显示一次) |
| `REDYA_BASE_URL` | 否 | 默认 `https://hy.ithinkai.cn`,私有化部署时改成自己的域名 |

## Claude Code 配置

命令行一条加好:

```bash
claude mcp add redya -e REDYA_API_KEY=rk-xxx -- node /Volumes/FYSSD/Proj/ithinkai/RedYA/openapi-clients/mcp/index.js
```

或在项目根目录 `.mcp.json` 里加:

```json
{
  "mcpServers": {
    "redya": {
      "command": "node",
      "args": ["/Volumes/FYSSD/Proj/ithinkai/RedYA/openapi-clients/mcp/index.js"],
      "env": {
        "REDYA_API_KEY": "rk-xxx"
      }
    }
  }
}
```

## Cursor / 通用 stdio 配置

Cursor(`~/.cursor/mcp.json` 或项目 `.cursor/mcp.json`)以及其他支持 stdio MCP 的客户端,配置结构相同:

```json
{
  "mcpServers": {
    "redya": {
      "command": "node",
      "args": ["/Volumes/FYSSD/Proj/ithinkai/RedYA/openapi-clients/mcp/index.js"],
      "env": {
        "REDYA_API_KEY": "rk-xxx",
        "REDYA_BASE_URL": "https://hy.ithinkai.cn"
      }
    }
  }
}
```

## 工具清单

| 工具 | 对应接口 | 说明 |
|---|---|---|
| `generate_outline` | `POST /openapi/v1/outlines` | 生成大纲(同步)。`topic` 必填;带货传 `product_id`;`auto=true` 则完成后直接排队出图 |
| `update_outline` | `PUT /openapi/v1/outlines/{record_id}` | 编辑大纲。`pages` 整组覆盖(1~15页);生成中不可编辑(409) |
| `generate_images` | `POST /openapi/v1/images` | 整篇出图(异步)。预扣积分,失败退款;重出已完成记录需 `force=true` |
| `regenerate_page` | `POST /openapi/v1/images/regenerate` | 单页重生成(异步)。适合 `partial` 状态下补失败页 |
| `get_record` | `GET /openapi/v1/records/{record_id}` | 状态轮询。出图异步,每 15~30 秒轮询直到 `status` 不再是 `generating_images` |
| `create_product` | `POST /openapi/v1/products` | 商品建档(带货前置)。`image_urls` 1~30 张 http(s) 直链,`labels` 逐张对齐 |
| `list_products` | `GET /openapi/v1/products` | 我的商品档案列表 |
| `list_skills` | `GET /openapi/v1/skills` | 可用带货 Skill 列表 |
| `get_me` | `GET /openapi/v1/me` | 账户信息:积分余额、日配额、今日已用 |

## 典型流程

```
get_me                        # 确认积分/配额
list_products                 # 带货:找 product_id(没有就 create_product)
generate_outline              # 拿 record_id(带货带 product_id)
update_outline                # 可选:改标题/正文/页说明
generate_images               # 提交出图,预扣积分
get_record  (每15~30秒轮询)    # 直到 completed / partial / error
regenerate_page               # partial 时补失败页,再轮询
```

## 错误处理

非 2xx 响应会被转成可读错误文本返回给 Agent(`isError: true`),格式:`红鸦 API 错误 (HTTP <status>, <code>): <message>`。常见 code:

- 401 `missing_key` / `invalid_key` / `key_disabled` / `key_expired` / `user_disabled`
- 402 `insufficient_points` 积分不足
- 403 `forbidden` 访问他人资源
- 404 `not_found`
- 409 `conflict`(生成中/已完成)
- 422 `invalid_request` 参数错误
- 429 `quota_exceeded` 日配额用尽

## 注意事项

- 单篇最多 15 页;大纲接口同步、超时上限 4 分钟
- 请勿并发对同一 record 提交出图(服务端有 409 保护)
- 图片 URL 为 COS 直链,建议 7 天内转存到自己的存储
