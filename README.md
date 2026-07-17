<div align="center">

# 🦞 红鸦 Skills · 让你的 AI 一句话写出小红书爆款图文

**给 Claude Code / Codex / Cursor 装上这个 Skill，对着 AI 说一句话，
自动产出小红书「标题 + 正文 + 9 张配图」——文案有「人味儿」、配图风格统一、直接能发。**

[![官网](https://img.shields.io/badge/官网-hy.ithinkai.cn-ff2442?style=for-the-badge)](https://hy.ithinkai.cn)
[![免费试用](https://img.shields.io/badge/🎁_注册即领-免费试用积分-brightgreen?style=for-the-badge)](https://hy.ithinkai.cn)

### 👉 [**打开 hy.ithinkai.cn，注册即领免费试用积分，先免费生成几篇试试**](https://hy.ithinkai.cn) 👈

</div>

---

## 为什么值得一试？

小红书运营最累的是什么？**不是没灵感，是「一篇要配 6-9 张风格统一的图」这件事，手工做太慢。**

红鸦把这件事自动化了，而且是**深耕小红书**打磨出来的，不是通用 AI 套壳：

- 🎯 **文案有「人味儿」** —— 贴合小红书社区语气，不像 AI 写的干巴文案，有效规避 AI 检测，评论区更愿意互动。
- 🖼️ **一套图风格统一** —— 自研视觉一致性算法，一次出 6-9 张图，背景色、排版、调性统一，不用一张张对齐。
- 🛍️ **商品带货专用模式** —— 关联商品图 + 带货 Skill，逐页匹配你的真实商品图出图，保真、不乱编包装。
- ✍️ **大纲先给你看，能改** —— AI 先出标题/正文/每页图片说明，你用大白话让它改（「第 3 页换成对比图」），满意再出图，不浪费。
- ⚡ **一句话到成品** —— 从主题到「文案 + 9 图」全自动；一人抵一个内容团队，规模化撬动公域流量。

> 📈 已有 **20 万+ 创作者**在用，**每日生成 1000+** 篇图文。—— 数据来自 [hy.ithinkai.cn](https://hy.ithinkai.cn)

### 📖 真实案例（公众号）
- [案例一 · 红鸦生成小红书图文实测](https://mp.weixin.qq.com/s/yr8dFcwgrbf5a-z-g4Z35g)
- [案例二 · 红鸦带货图文玩法](https://mp.weixin.qq.com/s/OfYNwi_t_ql7aq4KgN6tjw)

---

## 🎁 先领免费试用积分，再动手

这个 Skill 调用的是红鸦线上能力，**消耗的是你红鸦账号里的积分**（大纲默认 2 分/次，图片默认 5 分/张，失败自动退款）。

**新用户注册即送免费试用积分**，够你先免费生成几篇看看效果：

### 👉 [**立即去 hy.ithinkai.cn 注册领积分**](https://hy.ithinkai.cn) 👈

---

## 快速开始（3 步，5 分钟）

### 1️⃣ 拿一把 API Key（自助，30 秒）
1. 打开 **[hy.ithinkai.cn](https://hy.ithinkai.cn)**，微信扫码登录（**注册即领免费试用积分**）
2. 左栏点「**红鸦 Skills**」（或首页输入框上方的 🦞 入口）
3. 点「**生成 API Key**」，复制 `rk-` 开头的 key（明文只显示一次，请立即保存）

### 2️⃣ 二选一安装

**方式 A · Skill（推荐，零依赖，任何能读写文件的 Agent 都适用）**

把 `SKILL.md` 放到你的 Agent 技能目录，例如 Claude Code：

```bash
mkdir -p ~/.claude/skills/redya-xiaohongshu
curl -fsSL https://raw.githubusercontent.com/rnthking/redya-skills/main/skill/redya-xiaohongshu/SKILL.md \
  -o ~/.claude/skills/redya-xiaohongshu/SKILL.md
export REDYA_API_KEY=rk-你的key
export REDYA_BASE_URL=https://hy.ithinkai.cn
```

> 💡 更省事：把上面这段连同你的 key 直接丢给 Claude Code / Codex，让它「帮我安装这个 skill」，它会自己下载装好。

**方式 B · MCP（Claude Code / Cursor 等支持 MCP 的客户端，需 Node ≥ 18）**

```bash
cd mcp && npm install
claude mcp add redya \
  -e REDYA_API_KEY=rk-你的key \
  -e REDYA_BASE_URL=https://hy.ithinkai.cn \
  -- node "$(pwd)/index.js"
```

### 3️⃣ 直接对你的 AI 说人话
- 「帮我写一篇**三伏天养生茶**的小红书，先给我看大纲」→ AI 生成大纲 → 你让它改 → 满意后出图
- 「直接出图，主题是**办公室绿植推荐**」→ 一步到位
- 「用这张商品图 `[URL]` 生成一篇带货笔记」→ AI 自动建商品档案再出图

生成的每一篇都会同步到网页端 **[hy.ithinkai.cn](https://hy.ithinkai.cn) →「我的创作」**，可预览、下载、一键发布小红书。

---

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

## 没有 key / 提示未授权？

说明你还没登录红鸦拿 key，或积分用完了 —— 去官网自助解决：

### 👉 [**打开 hy.ithinkai.cn 注册领免费试用积分 / 生成 API Key**](https://hy.ithinkai.cn)

---

<div align="center">

**红鸦 RedYA** · 深耕小红书 & 公众号图文的专业级 AI 营销工具
一句话生成爆款图文，一键发布 · 一人抵一个团队

### 🌐 [hy.ithinkai.cn](https://hy.ithinkai.cn) —— 注册即领免费试用积分

广州灵境之城科技有限公司

</div>
