# ONMI Chatbox

[![Verify](https://github.com/YspritanHyzygy/ONMI-CHATBOX/actions/workflows/verify.yml/badge.svg)](https://github.com/YspritanHyzygy/ONMI-CHATBOX/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

ONMI Chatbox 是一个本地优先、自备密钥（BYOK）的多 Provider AI 聊天工作台，支持 OpenAI、Anthropic Claude、Google Gemini、xAI 和 Ollama。React/Vite 前端通过 Express API 工作，账号、会话、Provider 配置、对话与消息保存在本地 JSON 数据库中。

[English](README.md)

> 项目状态：本地开发预览版。ONMI 面向一台可信设备，不是托管服务，也不是可直接上线的多租户产品。

## 当前能力

- 本地账号、按用户隔离的会话，以及服务重启后仍有效的登录 session。
- 基于 Server-Sent Events（SSE）的流式聊天，支持停止和一键重新生成。
- 扩展思考 / 思维链展示：支持 Claude、Gemini、Ollama 推理模型与 xAI，可按请求调节思维预算或推理力度；思维过程实时流式显示并随消息持久化。（OpenAI Chat Completions 会应用 `reasoning_effort`，但该 API 不返回思维内容本身。）
- 通过设置页配置 Provider 和模型，也支持环境变量作为服务端兜底。
- 会话历史、搜索、重命名、删除、分叉和 Markdown 对话导出。
- 代码块带语言标签和一键复制；自己的消息可一键填回输入框再编辑发送。
- 默认不包含 API 凭证的安全 JSON 备份。
- 导入前预览；覆盖数据或恢复凭证时必须再次确认。
- 只读数据健康报告，用于查看迁移和完整性问题；数据库文件损坏时自动从最新有效备份恢复。
- 本地请求量与 token 估算；真实账单仍以 Provider 官方后台为准。
- 英文与简体中文界面。

键盘快捷键：`Ctrl+N` 新会话，`Ctrl+K` 或 `/` 消息模板，`Esc` 关闭面板，`Enter` 发送，`Shift+Enter` 换行。

## 环境要求

- Node.js 20 或更新版本
- npm
- 远程 Provider API Key，或本机运行的 Ollama

## 快速开始

```bash
npm ci
```

可以把 `.env.example` 复制为 `.env` 并填写服务端兜底密钥，也可以保持为空，登录后再从设置页配置。

```bash
npm run dev
```

打开 `http://localhost:5173`，注册本地账号，然后在 **设置** 中至少配置一个 Provider。

默认地址：

- Web 前端：`http://localhost:5173`
- API 与健康检查：`http://127.0.0.1:3001/api`

服务端默认只监听 `127.0.0.1`。除非已经设置严格的 `CORS_ORIGINS` 并理解 Provider 密钥会以明文保存在本机，否则不要把 `HOST` 改成公开网络接口。

## Provider 配置

对于已登录用户，设置页配置优先于环境变量兜底。

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_DEFAULT_MODEL=gpt-5.5

CLAUDE_API_KEY=
CLAUDE_BASE_URL=https://api.anthropic.com
CLAUDE_DEFAULT_MODEL=claude-sonnet-5

GEMINI_API_KEY=
GEMINI_DEFAULT_MODEL=gemini-3.5-flash

XAI_API_KEY=
XAI_BASE_URL=https://api.x.ai/v1
XAI_DEFAULT_MODEL=grok-4.5

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=qwen3
```

上述模型 ID 已于 2026 年 7 月对照各 Provider 文档核实。可在设置页拉取模型列表查看你的 Key 实际可用的模型，并用 `node scripts/update-openai-data.cjs` / `node scripts/update-gemini-data.cjs` 刷新内置的参数数据。

Ollama 应填写服务根地址，例如 `http://localhost:11434`，不要附加 `/v1`。ONMI 会兼容并规范化旧的 `/v1` 配置，聊天和模型列表统一使用 Ollama 原生接口。

仓库里存在适配器，不代表每个模型版本都一定兼容。正式使用前请在设置页执行连接或模型测试。

## 本地数据与安全

默认数据库位置：

```text
data/database.json
```

可以通过 `GEMINI_VIDEO_WEBUI_DB_PATH` 指定其他位置。自动化测试始终使用隔离的临时数据库。

需要明确了解的安全属性：

- Provider API Key 当前以明文保存在本地数据库中，尚未实现系统钥匙串或主密码加密。
- Session token 是随机不透明值；数据库只持久化 SHA-256 哈希和过期时间。
- 从旧的内存 token 版本升级后需要重新登录一次。
- 普通 v2 备份默认剔除 API Key，并且永远不会导出 session。
- “包含凭证”会生成敏感的明文备份，必须显式选择并确认。
- 覆盖导入必须额外确认破坏性操作。
- 数据库迁移会先备份；完整性异常只报告，不会自动删除孤儿记录。

请把数据库和包含凭证的备份视为密码文件，不要提交到 Git、通过邮件传播或上传到不可信服务。

## 验证

```bash
npm run verify
npm run test:e2e
```

`verify` 会依次运行 TypeScript、ESLint、全部 Vitest 测试和生产前端构建。Playwright 冒烟测试会使用隔离数据库和本地模拟 Ollama 服务，不会调用真实 AI Provider。

其他命令：

```bash
npm run test:run
npm run test:coverage
npm run check
npm run lint
npm run build
```

测试覆盖关键数据库、认证、聊天上下文、Provider 与 UI 回归，但不能证明第三方 Provider 永远可用、所有远程模型行为完全一致，或 ONMI 适合暴露在恶意多租户环境中。

## 架构

```text
React/Vite 前端
      │ 认证请求 + SSE
      ▼
Express API ── Provider 适配器 ── OpenAI / Claude / Gemini / xAI / Ollama
      │
      └── 本地 JSON 数据库（用户、session 哈希、配置、对话）
```

主要目录：

```text
src/        React 页面、聊天 UI、状态、hooks 与 i18n
api/        Express 路由、认证、迁移、数据库与 Provider 适配器
e2e/        使用隔离数据库的 Playwright 冒烟测试
data/       已忽略的本地运行数据
```

除 `/api/auth/*` 和 `/api/health` 外，所有路由都必须经过认证中间件。用户数据只能按当前认证用户访问，不能信任客户端传来的用户 ID。

主要接口：

- `POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/logout`
- `GET /api/chat/conversations`、`PATCH /api/chat/conversations/:id`、`DELETE /api/chat/conversations`
- `GET /api/chat/conversations/:id/messages`、`POST /api/chat/conversations/:id/fork`、`POST /api/chat`
- `POST /api/chat/conversations/:id/regenerate` —— 基于同一条用户消息重新生成回复
- `GET /api/data/preview/:userId`、`GET /api/data/export/:userId`、`POST /api/data/import/:userId`
- `GET /api/data/health`
- `GET /api/business/usage/:userId`

## 部署边界

- `npm run build` 只构建浏览器前端；仓库有意不再提供虚假的云端或 Serverless 部署配置。
- JSON 数据库只适合单机，不能用于横向扩容或临时文件系统部署。
- 若要把 API 暴露到本机之外，需要自行补齐反向代理、TLS、来源限制、限流、共享持久化和密钥管理。

## 维护说明

- 后端使用 ESM；TypeScript 源码里的相对导入保留 `.js` 后缀以满足 Node 解析。
- 聊天传输使用 SSE，不是 Socket.IO。
- 路由层保持精简，共享逻辑放在 `api/services/`。
- 在旧客户端仍可能依赖时，继续保留会话列表响应中的 `data` 与 `conversations` 双字段。
- 不得记录 Provider 凭证、原始 session token 或完整的敏感请求对象。
- `README.md` 与 `README.zh-CN.md` 的行为描述必须同步。

本项目以 [MIT 许可证](LICENSE) 发布。
