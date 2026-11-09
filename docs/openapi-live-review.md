# 实况图与敏感词检测 API（1.6.1）

沿用红鸦 API Key：`Authorization: Bearer rk-...` 或 `X-API-Key`。默认地址 `https://hy.ithinkai.cn`。返回 JSON 数据；失败为 `{"error":{"code":"...","message":"..."}}` 和对应 HTTP 状态。Key、下载地址和任务归属均按账号校验。

## 图片转 Live 实况

### 查询能力与报价

`GET /openapi/v1/live-photos/capabilities?model_code=...&quality=480p`

返回 `live.configured` 与 `ai`：`configured`、`models`、`modelCode`、`qualities`、`quality`、`points`、`generationDuration` 等。免费镜头动效使用 `mode=live`；AI 自然动态使用 `mode=ai`，先选择返回的模型与清晰度，并确认本次报价。报价随后台配置变化，不硬编码积分。

### 创建任务

`POST /openapi/v1/live-photos`，使用 `multipart/form-data`：

| 字段 | 说明 |
| --- | --- |
| `request_id` | 必填 UUID。每张图片独立编号，提交前保存，所有网络重试沿用同一编号 |
| `image` | 必填图片文件，单张不超过 24MB |
| `mode` | `live` 免费镜头动效（默认），或 `ai` |
| `effect` | 免费动效编号 0–12，默认 0 |
| `model_code`、`quality` | AI 使用能力接口返回的值；默认清晰度 480p |
| `expected_points` | AI 必须确认能力接口返回的当前 `ai.points` 报价后填写 |
| `action` | `natural`（默认）或 `custom` |
| `prompt` | 仅 `custom` 时必填；只描述这一张图片的动作 |
| `tail_image` | 可选尾帧文件，仅适用于支持首尾帧的 AI 模型 |

```bash
# request_id 创建一次后持久保存；重试不要重新执行 UUID 生成。
curl --max-time 120 "$REDYA_BASE_URL/openapi/v1/live-photos" \
  -H "Authorization: Bearer $REDYA_API_KEY" \
  -F "request_id=$REQUEST_ID" -F 'mode=live' -F 'effect=0' \
  -F 'image=@/absolute/path/photo.jpg'
```

返回 HTTP 202，包含 `request_id`、`job_id`、`status`、`phase`、`mode`、`quality`、`replayed`。同账号同编号同参数恢复原任务；改参数复用编号返回 409。跨 Key 轮换仍按账号隔离，其他账号查询不到。

批量时逐张提交并保存编号与图片对应关系；只给需要的图片填 `action=custom` 和 `prompt`，其余保持 `natural`。接口不接收文章大纲作为动作上下文。

自然微动会按实际图片识别场景：确认静物或识别不确定时，使用整幅画面同步微动保护，不调用收费视频生成；人物、穿戴、流动等明确场景使用所选 AI 模型。显式自定义动作与尾帧按用户选择处理。

### 查询与下载

`GET /openapi/v1/live-photos/:request_id`，建议每 5–10 秒查询。状态为 `queued`、`processing`、`completed`、`failed`；`needs_review=true` 表示上游结果仍待核实，继续查原编号，不换编号重新制作。服务中断后也用原编号查询。

完成时返回 `downloads`、`save_guide` 和 `video_points`。下载路径带鉴权，拼接 Base URL 后继续传 Key，不能把它们当作匿名公开图片链接。

服务重启或提交结果待核实后，可 `POST /openapi/v1/live-photos/:request_id/recover` 获取原上游任务结果。此接口只恢复已有任务，不重新制作或扣视频积分；不存在的请求返回 404。

`GET /openapi/v1/live-photos/:request_id/content?format=...`：

| format | 文件 |
| --- | --- |
| `mp4` | 原视频，支持 Range |
| `photo` | 静态 JPEG |
| `pvt` | `.pvt.zip` 原始实况包 |
| `ios` | iPhone 原始 JPEG + MOV 与保存说明 |
| `android` | Motion Photo JPEG |
| `mac` | Mac 实况导入包与说明 |
| `windows` | Windows 保存包与说明 |

```bash
curl --fail --max-time 120 \
  "$REDYA_BASE_URL/openapi/v1/live-photos/$REQUEST_ID/content?format=pvt" \
  -H "Authorization: Bearer $REDYA_API_KEY" -o live-photo.pvt.zip
```

下载文件不等于已导入手机相册。按 `/tools/live-photo/save` 中对应设备教程保存。API 实况是工具任务，直接查询下载，不创建图文大纲。

## 敏感词检测

`GET /openapi/v1/content-review/status` 返回是否配置及 `points_per_check`。检测费用与网页一致；相同文本命中缓存时查看返回的 `charged_points`，失败不收费。检测不代表平台审核或法律结论。

`POST /openapi/v1/content-review`：

```json
{"fields":[{"id":"title","label":"标题","text":"待检查标题"},{"id":"body","label":"正文","text":"待检查正文"}]}
```

每次 1–64 个字段，总计 1–30000 字。返回 `findings[]`、`input_hash`、`signature`、`charged_points` 等。逐条说明发现的问题和修改选项；未获授权不替用户改文案。

`POST /openapi/v1/content-review/replace`：

```json
{"fields":[{"id":"title","label":"标题","text":"原文"}],"review":{"完整原始检测结果":"此处传完整结果对象"},"finding_ids":["要修改的 finding.id"],"action":"replace","choices":{"finding-id":"用户确认的替换词"}}
```

`review` 必须是上一响应的完整对象，`fields` 必须仍是被检测的原文；支持 `replace` 或 `delete`。服务端校验签名、原文和账号，不接受伪造或跨账号的检测结果。返回修改后的文案供用户核对，不自动发布。

## 个人词库

- `GET /openapi/v1/sensitive-words`：列出本人词条。
- `PUT /openapi/v1/sensitive-words`：`{"words":[{"word":"词语","replacement":"替换词","level":"medium","reason":"说明"}]}`。未填 ID 新增；已有 ID 更新本人词条。
- `DELETE /openapi/v1/sensitive-words`：`{"ids":[1,2]}`，只能删除本人词条。

词库操作不扣检测积分，仅在用户明确要求维护个人词库时调用。不同账号相互隔离。
