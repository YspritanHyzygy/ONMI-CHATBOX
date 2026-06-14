# ONMI Chatbox

ONMI Chatbox 是一个本地优先的多 Provider AI 聊天应用。前端使用 React/Vite，后端使用 Express，本地用 JSON 文件保存用户、会话、消息和 Provider 配置。用户可以使用自己的 API Key，也可以通过 `.env` 提供服务端兜底配置。

[English](README.md) | 简体中文

## 当前可用能力

- 用户注册和登录，并按用户隔离会话数据。
- 在设置页配置 Provider API Key，也支持 `.env` 作为兜底。
- 通过 SSE 流式返回聊天响应。
- 会话历史、刷新后恢复、删除、Markdown 导出和会话分叉。
- 导入/导出本项目自己的 JSON 备份格式。
- 基于本地会话和消息计算用量估算。
- 英文和简体中文界面文案。

## 支持的 Provider

项目内置了这些 Provider 的适配和配置入口：

- OpenAI
- Anthropic Claude
- Google Gemini
- xAI Grok
- Ollama

Provider 的真实账单和精确 token 统计仍以各官方控制台为准。Usage 页面展示的是本地估算，不代表官方消费金额。

## 环境要求

- Node.js 18 或更新版本
- npm
- 你计划使用的 Provider API Key，可选

## 安装

```bash
npm install
```

如果需要服务端兜底密钥，可以在项目根目录创建 `.env`：

```env
OPENAI_API_KEY=sk-your-openai-key
GEMINI_API_KEY=your-gemini-key
CLAUDE_API_KEY=your-claude-key
XAI_API_KEY=your-xai-key
OLLAMA_BASE_URL=http://localhost:11434
```

也可以先启动应用，登录后在 Settings 页面配置 API Key。

## 本地开发

同时启动前端和后端：

```bash
npm run dev
```

也可以分别启动：

```bash
npm run client:dev
npm run server:dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:3001/api`

这个项目没有 `npm start` 脚本。发布前请先构建前端，然后按你的部署方式运行后端。

## 验证

```bash
npm run check
npm run test:run
npm run build
```

`npm run check` 做 TypeScript 检查。`npm run test:run` 单次运行 Vitest。`npm run build` 会先类型检查，再构建 Vite 前端。

## 数据存储

运行数据保存在本地 `data/` 目录，核心文件是：

```text
data/database.json
```

这里会保存用户、会话、消息、Provider 配置和相关本地状态。项目不依赖外部数据库。

## API 概览

认证：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/user/:userId`
- `GET /api/auth/check-username/:username`

聊天：

- `GET /api/chat/conversations`
- `POST /api/chat/conversations`
- `GET /api/chat/conversations/:conversationId/messages`
- `POST /api/chat/conversations/:conversationId/fork`
- `DELETE /api/chat/conversations/:conversationId`
- `POST /api/chat`

数据：

- `GET /api/data/preview/:userId`
- `GET /api/data/export/:userId`
- `POST /api/data/import/:userId`

用量：

- `GET /api/business/usage/:userId`

需要登录的接口都应绑定当前用户。新增路由时不要绕过现有认证中间件，也不要跳过用户作用域的数据访问 helper。

## 项目结构

```text
api/        Express 路由、认证中间件、Provider 适配器、JSON 数据库
src/        React 页面、组件、hooks、Zustand store
data/       本地运行时 JSON 数据
public/     静态资源
```

## 维护备注

- 后端是 ESM，TypeScript 源码里的相对导入仍要写 `.js` 后缀。
- 聊天响应通过 SSE 流式传输，不是 Socket.IO。
- 路由层尽量保持薄，把共享逻辑放到 `api/services/`。
- Usage 页面数字默认视为本地估算，除非 Provider 返回了可验证的精确 usage 元数据。
- UI 继续沿用现有 shadcn/Radix/Tailwind 组合，不要为小功能随意引入新依赖。
