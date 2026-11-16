# 实况图与敏感词检测（v1.6.1 详细流程）

仅转实况或检测文案时，直接使用下面的工具接口，不要先生成图文大纲。所有调用沿用用户自己的 API Key。以下接口无需先创建图文大纲。

## 图片转 Live 实况

1. `GET /openapi/v1/live-photos/capabilities` 查询可用模式、AI 模型、清晰度和积分报价。`mode=live` 是免费镜头动效；`mode=ai` 是 AI 自然动态，先展示当前报价并取得用户对收费制作的授权。
2. 为每张图生成并保存一个 UUID `request_id`，以 `multipart/form-data` 调 `POST /openapi/v1/live-photos`：必填 `request_id`、图片文件 `image`；选填 `mode`（默认 live）、`effect`（0–12）。AI 再传 `model_code`、`quality`、当前报价 `expected_points`。
3. 默认 `action=natural`。只给有要求的图片设置 `action=custom` 和该图的 `prompt`；其他图保持自然微动。不要加入文章大纲、素材替换说明或商品用途作为动作指令。支持尾帧的 AI 模型可额外上传 `tail_image`。
4. 每 5–10 秒查询 `GET /openapi/v1/live-photos/:request_id`。同一请求重试沿用原 UUID 和参数，参数冲突返回 409；超时、断线、needs_review 时查原请求，不换编号重复提交。
5. 提交结果待核实或服务重启后，可 `POST /openapi/v1/live-photos/:request_id/recover` 恢复原任务；不会重新制作或再次扣视频积分。
6. 完成后 `GET /openapi/v1/live-photos/:request_id/content?format=pvt` 下载，格式还包括 `mp4`、`photo`、`ios`、`android`、`mac`、`windows`。返回的下载路径需要拼接 Base URL 并携带 Key；先保存本地再交付，不能当作匿名公开图片链接。

```bash
# REQUEST_ID 在首次制作前生成并保存，重试复用。
curl --fail --max-time 120 "${REDYA_BASE_URL:-https://hy.ithinkai.cn}/openapi/v1/live-photos" \
  -H "Authorization: Bearer $REDYA_API_KEY" \
  -F "request_id=$REQUEST_ID" -F 'mode=live' -F 'effect=0' -F 'image=@/absolute/path/photo.jpg'
```

批量处理时保存每张图片对应的 UUID。静置物品或场景识别不确定时，服务会使用整幅同步微动保护，不调用收费视频生成；最终费用查看 `video_points`。保存教程：https://hy.ithinkai.cn/tools/live-photo/save 。下载成功不能表述成已导入手机实况相册。

## 敏感词检测与修改

- `GET /openapi/v1/content-review/status` 查看配置及 `points_per_check`。费用与网页一致，先告知用户；失败不收费，缓存结果以 `charged_points` 为准。
- `POST /openapi/v1/content-review`，JSON：`{"fields":[{"id":"title","label":"标题","text":"待检查标题"},{"id":"body","label":"正文","text":"待检查正文"}]}`。每次 1–64 段、共 1–30000 字，中文 JSON 必须 UTF-8。
- 展示 `findings` 中的原词、原因和替换建议，让用户确认修改范围。检测不等于平台审核通过，不自动发布。
- 用户确认后，`POST /openapi/v1/content-review/replace`，携带原样的 `fields`、完整原始检测结果 `review`、选中的 `finding_ids`、`action=replace` 或 `delete`，以及可选 `choices`（finding.id 到替换词）。服务校验签名、原文及账号，不自行拼造检测结果。
- 用户明确要求管理个人词库时才使用：`GET /openapi/v1/sensitive-words`；`PUT` 提交 `{"words":[{"word":"词语","replacement":"替换词","level":"medium","reason":"说明"}]}`；`DELETE` 提交 `{"ids":[词条ID]}`。只操作本人词库，不扣检测积分。
