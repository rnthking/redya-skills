# 红鸦 Skills · RedYA Open Platform

把 **红鸦(RedYA)** 的小红书图文生成能力接入你的 AI Agent（Claude Code / Codex / Cursor 等）：一句话让 AI 生成小红书标题 + 正文 + 多页配图，支持普通种草与商品带货两种模式。

> 官网：**https://hy.ithinkai.cn** ｜ 生成的内容消耗你自己账号的积分，记录在网页端「我的创作」可见。

## 快速开始（3 步）

### 1. 拿一把 API Key（自助，30 秒）
1. 打开 **https://hy.ithinkai.cn**，微信扫码登录
2. 左栏点「**红鸦 Skills**」（或首页输入框上方的 🦞 入口）
3. 点「**生成 API Key**」，复制 `rk-` 开头的 key（明文只显示一次）

### 2. 二选一安装

**方式 A · Skill（推荐，零依赖，任何能读写文件的 Agent 都适用）**

把 [`skill/redya-xiaohongshu/SKILL.md`](skill/redya-xiaohongshu/SKILL.md) 放到你的 Agent 技能目录，例如 Claude Code：

```bash
mkdir -p ~/.claude/skills/redya-xiaohongshu
curl -fsSL https://raw.githubusercontent.com/rnthking/redya-skills/main/skill/redya-xiaohongshu/SKILL.md \
  -o ~/.claude/skills/redya-xiaohongshu/SKILL.md
export REDYA_API_KEY=rk-你的key
export REDYA_BASE_URL=https://hy.ithinkai.cn
```

**方式 B · MCP（Claude Code / Cursor 等支持 MCP 的客户端，需 Node ≥ 18）**

```bash
cd mcp && npm install
claude mcp add redya \
  -e REDYA_API_KEY=rk-你的key \
  -e REDYA_BASE_URL=https://hy.ithinkai.cn \
  -- node "$(pwd)/index.js"
```

### 3. 直接对你的 AI 说人话
- 「帮我写一篇**三伏天养生茶**的小红书，先给我看大纲」→ AI 生成大纲 → 你可以让它改 → 满意后出图
- 「直接出图，主题是**办公室绿植推荐**」→ 一步到位
- 「用这张商品图 [URL] 生成一篇带货笔记」→ AI 自动建商品档案再出图

## 目录

| 路径 | 说明 |
|---|---|
| [`skill/redya-xiaohongshu/SKILL.md`](skill/redya-xiaohongshu/SKILL.md) | 给 AI Agent 的技能说明书（交互流程 + 接口速查 + 错误处理） |
| [`mcp/`](mcp/) | MCP Server（Node stdio，9 个工具） |
| [`docs/openapi-v1.md`](docs/openapi-v1.md) | OpenAPI v1 字段级接口文档 |

## 说明
- 计费与网页端同价：大纲默认 2 积分/次，图片默认 5 积分/张，生成失败自动退款。
- 图片为对象存储直链，建议 7 天内转存。
- 生成内容的合规责任由调用方承担。

---
Made for [红鸦 RedYA](https://hy.ithinkai.cn) · 广州灵境之城科技有限公司
