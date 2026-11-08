import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export function registerLiveReviewTools(server, { callApi, run, API_KEY, BASE_URL }) {
  const field = z.object({ id: z.string(), label: z.string(), text: z.string() });
  server.tool('live_photo_capabilities', '查询免费镜头动效、AI 实况模型、清晰度和当前报价。收费制作前先向用户确认本次报价。', {}, async () => run(() => callApi('GET', '/openapi/v1/live-photos/capabilities')));
  server.tool('create_live_photo', '把本地图片转成实况。默认免费镜头动效。AI 模式先确认报价；每张图保存独立 UUID，所有重试沿用同一 request_id，断线后查询原请求。未自定义的图使用自然微动。', {
    request_id: z.string().uuid(), image_path: z.string(), mode: z.enum(['live', 'ai']).optional(),
    effect: z.number().int().min(0).max(12).optional(), model_code: z.string().optional(),
    quality: z.enum(['480p', '720p', '768p', '1080p']).optional(), expected_points: z.number().int().min(0).optional(),
    action: z.enum(['natural', 'custom']).optional(), prompt: z.string().optional(), tail_image_path: z.string().optional(),
  }, async args => run(async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(args)) if (value !== undefined && !['image_path', 'tail_image_path'].includes(key)) form.set(key, String(value));
    for (const [name, file] of [['image', args.image_path], ['tail_image', args.tail_image_path]]) {
      if (!file) continue;
      if (!path.isAbsolute(file)) throw new Error('图片路径必须是本地绝对路径');
      const stat = await fs.stat(file); if (!stat.isFile() || stat.size > 24 * 1024 * 1024) throw new Error('请选择 24MB 以内的图片文件');
      const ext = path.extname(file).toLowerCase(), mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif', '.avif': 'image/avif' }[ext];
      if (!mime) throw new Error('不支持的图片格式');
      form.set(name, new Blob([await fs.readFile(file)], { type: mime }), path.basename(file));
    }
    const response = await fetch(`${BASE_URL}/openapi/v1/live-photos`, { method: 'POST', headers: { Authorization: `Bearer ${API_KEY}` }, body: form });
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`); return data;
  }));
  server.tool('get_live_photo', '查询原 request_id 的实况进度和下载地址。needs_review 时等待核实，不换编号重新制作。', { request_id: z.string().uuid() }, async args => run(() => callApi('GET', `/openapi/v1/live-photos/${args.request_id}`)));
  server.tool('recover_live_photo', '只恢复原上游结果，不重新制作或扣视频积分。不存在的请求不能恢复。', { request_id: z.string().uuid() }, async args => run(() => callApi('POST', `/openapi/v1/live-photos/${args.request_id}/recover`, {})));
  server.tool('download_live_photo', '把已完成的实况保存到用户指定的本地绝对路径。下载仍需 Key，不能把鉴权地址当公开链接；下载成功不等于已导入手机相册。', {
    request_id: z.string().uuid(), format: z.enum(['mp4', 'photo', 'pvt', 'ios', 'android', 'mac', 'windows']), output_path: z.string(),
  }, async args => run(async () => {
    if (!path.isAbsolute(args.output_path)) throw new Error('输出路径必须是绝对路径');
    const response = await fetch(`${BASE_URL}/openapi/v1/live-photos/${args.request_id}/content?format=${args.format}`, { headers: { Authorization: `Bearer ${API_KEY}` } });
    if (!response.ok) { const data = await response.json(); throw new Error(data.error?.message || `HTTP ${response.status}`); }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 256 * 1024 * 1024) { await reader.cancel(); throw new Error('文件超过 256MB'); } chunks.push(value); }
    await fs.mkdir(path.dirname(args.output_path), { recursive: true });
    await fs.writeFile(args.output_path, Buffer.concat(chunks), { flag: 'wx', mode: 0o600 });
    return { path: args.output_path, bytes: size, save_guide: `${BASE_URL}/tools/live-photo/save` };
  }));
  server.tool('content_review_status', '查询文案敏感词检测是否可用及当前检测积分。', {}, async () => run(() => callApi('GET', '/openapi/v1/content-review/status')));
  server.tool('review_content', '检测用户确认的标题、正文等文案风险表达。先确认检测费用，不自动改文或发布；返回完整签名结果供确认后替换。', { fields: z.array(field), recheck_of: z.string().optional() }, async args => run(() => callApi('POST', '/openapi/v1/content-review', args)));
  server.tool('replace_review_findings', '按用户确认范围替换或删除。fields 必须仍为被检测原文，review 必须是上一检测完整结果，不伪造签名或 findings。', {
    fields: z.array(field), review: z.record(z.any()), finding_ids: z.array(z.string()), action: z.enum(['replace', 'delete']), choices: z.record(z.string()).optional(),
  }, async args => run(() => callApi('POST', '/openapi/v1/content-review/replace', args)));
  server.tool('list_sensitive_words', '列出当前用户的个人敏感词，不扣检测积分。', {}, async () => run(() => callApi('GET', '/openapi/v1/sensitive-words')));
  server.tool('save_sensitive_words', '仅在用户明确要求维护个人词库时新增或更新本人词条，不改其他账号。', {
    words: z.array(z.object({ id: z.number().int().optional(), word: z.string(), replacement: z.string().optional(), level: z.enum(['high', 'medium']).optional(), reason: z.string().optional() })),
  }, async args => run(() => callApi('PUT', '/openapi/v1/sensitive-words', args)));
  server.tool('delete_sensitive_words', '仅删除用户明确指定的本人个人词条。', { ids: z.array(z.number().int()) }, async args => run(() => callApi('DELETE', '/openapi/v1/sensitive-words', args)));
}
