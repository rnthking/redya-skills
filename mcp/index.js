#!/usr/bin/env node
/**
 * 红鸦开放平台 MCP Server (stdio)
 *
 * 把红鸦 OpenAPI v1 (docs/openapi-v1.md) 包装成 MCP 工具,供 Claude Code / Cursor
 * 等支持 MCP 的 Agent 直接调用。
 *
 * 环境变量:
 *   REDYA_API_KEY   必填,后台「API Key 管理」页创建的 rk- 开头的 Key
 *   REDYA_BASE_URL  可选,默认 https://hy.ithinkai.cn
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_KEY = process.env.REDYA_API_KEY;
const BASE_URL = (process.env.REDYA_BASE_URL || 'https://hy.ithinkai.cn').replace(/\/+$/, '');

if (!API_KEY) {
  console.error('[redya-mcp] 缺少环境变量 REDYA_API_KEY(rk- 开头的红鸦开放平台 Key)。');
  console.error('[redya-mcp] 示例: REDYA_API_KEY=rk-xxxx node index.js');
  process.exit(1);
}

/**
 * 调用红鸦 OpenAPI。非 2xx 时把 {"error":{code,message}} 转成可读错误抛出。
 */
async function callApi(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new Error(`请求红鸦 API 失败(网络错误): ${method} ${url} — ${err.message}`);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const code = data?.error?.code || `http_${res.status}`;
    const message = data?.error?.message || (text ? text.slice(0, 500) : res.statusText);
    throw new Error(`红鸦 API 错误 (HTTP ${res.status}, ${code}): ${message}`);
  }

  return data ?? {};
}

function textResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** 包一层统一的成功/失败处理 */
async function run(fn) {
  try {
    return textResult(await fn());
  } catch (err) {
    return errorResult(err);
  }
}

const server = new McpServer({
  name: 'redya',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// 大纲
// ---------------------------------------------------------------------------

server.tool(
  'generate_outline',
  '生成一篇小红书图文的大纲(标题+正文+每页图片说明)。同步接口,通常几秒到1分钟返回(上限4分钟),消耗积分(默认2积分/次,失败自动退款)。返回的 record_id 是这篇图文的唯一标识,后续编辑/出图/查询都用它。普通模式只需 topic;商品图文(带货)模式必须传 product_id(先用 create_product 建档或用 list_products 查已有商品)。auto=true 表示大纲完成后立即整篇出图(异步),之后用 get_record 轮询;缺省 auto=false,可先用 update_outline 修改大纲,再调 generate_images 出图。',
  {
    topic: z.string().describe('创作主题,必填。例如"三伏天养生茶推荐"'),
    style: z.string().optional().describe('风格代码,可选。缺省: 普通模式=xiaohongshu_2,带货模式=xiaohongshu_4'),
    prompt_length: z.enum(['short', 'long']).optional().describe('图片说明长短,short|long,默认 short'),
    product_id: z.string().optional().describe('商品档案 ID,商品图文(带货)模式必传。来自 create_product 或 list_products'),
    skill_id: z.string().optional().describe('带货 Skill ID,可选。来自 list_skills,决定带货文案的写法'),
    image_urls: z.array(z.string()).optional().describe('参考图 URL 数组,可选(普通模式用)'),
    auto: z.boolean().optional().describe('true=大纲完成后立即整篇出图(异步,之后用 get_record 轮询);默认 false'),
  },
  async (args) =>
    run(() =>
      callApi('POST', '/openapi/v1/outlines', {
        topic: args.topic,
        style: args.style,
        prompt_length: args.prompt_length,
        product_id: args.product_id,
        skill_id: args.skill_id,
        image_urls: args.image_urls,
        auto: args.auto,
      })
    )
);

server.tool(
  'update_outline',
  '编辑指定记录的大纲(出图前修改标题/正文/每页图片说明)。pages 是整组覆盖:必须传完整的页数组(1~15页,每页含 index/type/content),不能只传要改的那几页。图片生成中的记录不可编辑(返回409)。改完后调 generate_images 出图。',
  {
    record_id: z.string().describe('记录 ID,来自 generate_outline 的返回'),
    pages: z
      .array(
        z.object({
          index: z.number().int().describe('页序号,从0开始,0通常是封面'),
          type: z.string().describe('页类型,如 cover / content'),
          content: z.string().describe('该页的图片说明文字'),
        })
      )
      .describe('整组覆盖的页数组(1~15页),必填'),
    title: z.string().optional().describe('新标题,可选'),
    content: z.string().optional().describe('新正文,可选'),
  },
  async (args) =>
    run(() =>
      callApi('PUT', `/openapi/v1/outlines/${encodeURIComponent(args.record_id)}`, {
        pages: args.pages,
        title: args.title,
        content: args.content,
      })
    )
);

// ---------------------------------------------------------------------------
// 出图
// ---------------------------------------------------------------------------

server.tool(
  'generate_images',
  '对已有大纲的记录整篇出图。异步接口:提交后立即返回 task_id,实际生成需1~5分钟,请用 get_record 每15~30秒轮询直到终态。积分在提交时预扣(默认5积分/张),提交或生成失败自动退款。商品图文必传 product_id(记录若之前出过商品图会自动继承)。对已完成(status=completed)的记录要整篇重出时传 force=true,否则返回409;partial(部分失败)可直接重出无需 force,或用 regenerate_page 补单页。请勿并发对同一 record 提交出图。',
  {
    record_id: z.string().describe('记录 ID,必填'),
    product_id: z.string().optional().describe('商品档案 ID,商品图文必传;之前出过商品图的记录会自动继承'),
    skill_id: z.string().optional().describe('带货 Skill ID,可选'),
    image_urls: z.array(z.string()).optional().describe('参考图 URL 数组,可选;缺省沿用大纲阶段的'),
    force: z.boolean().optional().describe('已完成的记录要整篇重出时传 true,默认 false'),
  },
  async (args) =>
    run(() =>
      callApi('POST', '/openapi/v1/images', {
        record_id: args.record_id,
        product_id: args.product_id,
        skill_id: args.skill_id,
        image_urls: args.image_urls,
        force: args.force,
      })
    )
);

server.tool(
  'regenerate_page',
  '单页重生成图片(异步)。适用于 get_record 返回 status=partial(部分页失败)时,对失败页单独重出;也可对不满意的单页重画。消耗该页积分(默认5积分),失败自动退款。该页正在生成中时返回409。商品图文自动继承原商品信息。提交后用 get_record 轮询该页状态。',
  {
    record_id: z.string().describe('记录 ID,必填'),
    page_index: z.number().int().min(0).describe('要重生成的页序号(从0开始),必填'),
  },
  async (args) =>
    run(() =>
      callApi('POST', '/openapi/v1/images/regenerate', {
        record_id: args.record_id,
        page_index: args.page_index,
      })
    )
);

// ---------------------------------------------------------------------------
// 记录查询
// ---------------------------------------------------------------------------

server.tool(
  'get_record',
  '查询一篇图文记录的状态与结果(标题/正文/每页的生成状态与图片URL)。重要:出图是异步的——调用 generate_images、regenerate_page 或带 auto=true 的 generate_outline 之后,请每15~30秒调用本工具轮询,直到 status 不再是 generating_images。终态含义: completed=全部页完成; partial=部分页失败(失败页可用 regenerate_page 单独重出); error=失败(积分已退)。图片 URL 为 COS 直链,建议7天内转存到自己的存储。',
  {
    record_id: z.string().describe('记录 ID,必填'),
  },
  async (args) => run(() => callApi('GET', `/openapi/v1/records/${encodeURIComponent(args.record_id)}`))
);

// ---------------------------------------------------------------------------
// 商品 / Skill / 账户
// ---------------------------------------------------------------------------

server.tool(
  'create_product',
  '创建商品档案——商品图文(带货)模式的前置步骤。用商品图片 URL 一键建档,返回 product_id,之后在 generate_outline / generate_images 中传入。image_urls 必须是 1~30 张 http(s) 直链。labels 与图片一一对应,缺省全部按"完整商品图";可用枚举: 完整商品图/包装图/多角度图/套装组合图/质地细节图/其他细节图/工艺做工图/产品颜色图/尺寸规格图/模特/上身图/使用对比图/使用步骤图/场景图/买家秀/真实图/功能卖点图/成分配料图/资质认证图/其他。',
  {
    name: z.string().describe('商品名称,必填'),
    image_urls: z.array(z.string()).min(1).max(30).describe('商品图片 URL 数组,必填,1~30张,必须 http(s)'),
    labels: z.array(z.string()).optional().describe('图集标签数组,与 image_urls 逐张对齐,可选;缺省全部按"完整商品图"'),
    brand: z.string().optional().describe('品牌,可选'),
    category: z.string().optional().describe('品类,可选'),
    selling_points: z.array(z.string()).optional().describe('卖点列表,可选'),
  },
  async (args) =>
    run(() =>
      callApi('POST', '/openapi/v1/products', {
        name: args.name,
        image_urls: args.image_urls,
        labels: args.labels,
        brand: args.brand,
        category: args.category,
        selling_points: args.selling_points,
      })
    )
);

server.tool(
  'list_products',
  '列出当前账号的商品档案(product_id/名称/封面图/素材数等)。做商品图文前先查这里:已有档案直接取 product_id,没有再用 create_product 建档。',
  {},
  async () => run(() => callApi('GET', '/openapi/v1/products'))
);

server.tool(
  'list_skills',
  '列出可用的带货 Skill(skill_id/名称/一句话说明)。Skill 决定带货文案的表达方式(如"真实体验种草"),可在 generate_outline / generate_images 中通过 skill_id 指定。',
  {},
  async () => run(() => callApi('GET', '/openapi/v1/skills'))
);

server.tool(
  'get_me',
  '查询当前 API Key 绑定的账户信息: user_id、昵称、积分余额(points_balance)、Key 名称/前缀、日配额(daily_quota)与今日已用次数(used_today)。生成前可先调用确认积分与配额是否充足。',
  {},
  async () => run(() => callApi('GET', '/openapi/v1/me'))
);

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[redya-mcp] 已启动 (stdio), base_url=${BASE_URL}`);
