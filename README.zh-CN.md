# 🤖 AI Chat Application

![AI Coded 100%](https://img.shields.io/badge/AI%20Coded-100%25-brightgreen?style=plastic&labelColor=gray)

一个现代化的多AI提供商聊天应用，基于React、TypeScript和Node.js构建。支持与OpenAI GPT、Google Gemini、Anthropic Claude等多种AI模型进行对话。

[English](README.md) | 简体中文

## ✨ 核心特性

- 🔄 **多AI提供商支持**: 支持OpenAI、Google Gemini、Anthropic Claude、xAI Grok、Ollama
- 👤 **用户认证系统**: 用户注册和登录功能，支持用户数据隔离和个性化设置
- 🔐 **用户自定义API密钥**: 通过Web界面或环境变量配置个人API密钥
- 💬 **对话管理**: 创建、保存和管理多个聊天对话，支持用户独立数据
- ⚡ **实时聊天界面**: 现代化响应式聊天UI，支持消息历史
- 📝 **Markdown渲染**: AI回复支持完整的Markdown格式显示
- 💾 **本地数据存储**: 所有对话和消息存储在本地JSON文件中
- 📤 **数据导出/导入**: 支持用户数据备份和迁移功能
- 🚀 **零配置启动**: 无需注册外部服务，直接运行即可使用
- 💼 **商业化扩展**: 预留订阅和付费功能接口，支持未来扩展
- 🔒 **TypeScript**: 前后端完整的类型安全保障

## 技术栈

### 前端
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Zustand** for state management

### 后端
- **Node.js** with Express.js and TypeScript
- **本地JSON数据库** 用于数据存储
- **AI服务适配器** 支持多个AI提供商

## 📋 环境要求

- **Node.js 18+** 和 npm
- **AI提供商API密钥** (可通过Web界面或环境变量配置)

## 🚀 快速开始

### 步骤1: 克隆项目并安装依赖

```bash
# 克隆项目
git clone https://github.com/YspritanHyzygy/ONMI-CHATBOX.git
cd ONMI-CHATBOX

# 安装依赖
npm install
```

### 步骤2: 配置AI服务 (可选)

**方式一: 环境变量配置 (推荐)**

编辑 `.env` 文件，添加您的AI API密钥：
```env
# AI提供商API密钥 (可选 - 也可通过Web界面配置)
OPENAI_API_KEY=sk-your-openai-key
GEMINI_API_KEY=your-gemini-key
CLAUDE_API_KEY=your-claude-key
XAI_API_KEY=your-grok-key

# Ollama配置 (如果使用本地Ollama)
OLLAMA_BASE_URL=http://localhost:11434/v1
```

**方式二: Web界面配置**
可以在启动应用后通过设置页面配置。

### 步骤3: 启动应用

```bash
# 同时启动前后端 (推荐)
npm run dev
```

**或者分别启动:**
```bash
# 终端1: 启动后端服务 (端口3001)
npm run server:dev

# 终端2: 启动前端服务 (端口5173)
npm run client:dev
```

### 步骤4: 开始使用

1. 🌐 访问 `http://localhost:5173`
2. 👤 **注册/登录**: 创建新账户或使用现有用户名登录
3. 💬 直接开始聊天，或先配置AI服务
4. ⚙️ 点击设置按钮配置API密钥(可选)
5. ✅ 点击"测试连接"验证配置
6. 🎯 选择默认模型
7. 🎉 开始聊天！

### 步骤5: 数据管理 (可选)

- 📤 **导出数据**: 备份您的对话和设置
- 📥 **导入数据**: 从备份文件恢复
- 🔄 **切换用户**: 每个用户都有独立的数据

### 步骤6: 生产环境部署

```bash
# 构建前端
npm run build

# 启动生产服务器
npm start
```

## 🔧 配置验证

### 检查服务状态
启动应用后，检查终端输出是否包含：
```
Server ready on port 3001
```

### 检查前端服务
前端启动成功会显示：
```
➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

## ❓ 常见问题

### Q: AI提供商测试连接失败
**A**: 
- 确认API密钥格式正确
- 检查网络连接
- 验证API密钥是否有效且有足够余额

### Q: 端口被占用
**A**: 
```bash
# 查看端口占用
netstat -ano | findstr :3001
netstat -ano | findstr :5173

# 或修改端口配置
# 前端: vite.config.ts 中修改 server.port
# 后端: api/server.ts 中修改 PORT
```

### Q: 没有聊天记录显示？
**A**: 这是正常现象，本地存储会在首次使用时自动创建演示数据。

## 项目结构

```
├── api/                    # 后端 Express.js API
│   ├── routes/            # API 路由处理器
│   ├── services/          # AI 服务适配器和管理器
│   └── app.ts            # Express 应用配置
├── src/                   # 前端 React 应用
│   ├── components/       # 可复用 React 组件
│   ├── pages/           # 页面组件
│   ├── hooks/           # 自定义 React hooks
│   └── lib/            # 工具函数
├── data/                 # 本地数据存储文件夹
│   └── database.json    # 聊天数据存储 (自动创建)
└── public/              # 静态资源
```

## API 端点

### 用户认证端点
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/user/:userId` - 获取用户信息
- `GET /api/auth/check-username/:username` - 检查用户名是否可用

### 聊天端点
- `GET /api/chat/conversations` - 获取用户对话
- `POST /api/chat` - 发送消息并获取AI回复
- `GET /api/chat/:conversationId/messages` - 获取对话消息

### 提供商端点
- `GET /api/providers` - 获取可用的AI提供商及其配置
- `GET /api/providers/supported` - 获取支持的AI提供商列表

### 数据管理端点
- `GET /api/data/export/:userId` - 导出用户数据
- `POST /api/data/import/:userId` - 导入用户数据
- `GET /api/data/preview/:userId` - 获取导出数据预览

### 商业化端点 (预留)
- `GET /api/business/subscription/:userId` - 获取订阅信息
- `GET /api/business/usage/:userId` - 获取API使用统计
- `GET /api/business/plans` - 获取可用订阅计划

## 🤖 支持的AI提供商

| 提供商 | 最新模型 | 配置要求 | 获取方式 |
|--------|----------|----------|----------|
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo | API Key | [获取API密钥](https://platform.openai.com/api-keys) |
| **Google Gemini** | Gemini-2.5-Pro, Gemini-2.5-Flash, Gemini-2.0-Flash | API Key | [获取API密钥](https://aistudio.google.com/app/apikey) |
| **Anthropic Claude** | Claude-3.5-Sonnet, Claude-3-Opus, Claude-3.5-Haiku | API Key | [获取API密钥](https://console.anthropic.com/) |
| **xAI Grok** | Grok-4, Grok-3, Grok-2-1212, Grok-2-Vision | API Key | [获取API密钥](https://console.x.ai/) |
| **Ollama** | 自定义模型 | 本地安装 | [下载Ollama](https://ollama.ai/) |

### 💰 费用说明
- **OpenAI**: 按使用量付费，GPT-4o约$0.005/1K tokens
- **Google Gemini**: 有免费额度，超出后按使用量付费
- **Anthropic Claude**: 按使用量付费，Claude-3.5-Sonnet约$0.003/1K tokens
- **xAI Grok**: 按使用量付费
- **Ollama**: 完全免费，本地运行

### 🚀 推荐配置
- **新手用户**: 建议从Google Gemini开始（有免费额度）
- **高级用户**: OpenAI GPT-4o或Claude-3.5-Sonnet（性能最佳）
- **本地部署**: Ollama + Llama3.3（完全离线，隐私保护）

## 🏦 模型库 (Model Bank)

本应用使用“模型库”系统在本地管理模型参数（上下文窗口、最大 token 数、模型能力等）。这确保了用户界面始终反映每个模型的准确能力。

### 更新模型定义

要使用提供商的最新模型更新本地模型数据库，请执行以下操作：

1. **配置 API 密钥**：确保您的 `.env` 文件中包含有效的 API 密钥。
2. **运行更新脚本**：

```bash
# 更新 OpenAI 模型（从 API 和 Azure 文档获取）
node scripts/update-openai-data.cjs

# 更新 Gemini 模型（从 Google API 获取）
node scripts/update-gemini-data.cjs
```

这些脚本将：
- 从各自的 API 获取最新的模型列表
- 更新 `src/lib/model-parameters/data/` 中的 JSON 配置文件
- 自动创建旧配置的备份

## 贡献

1. Fork 本仓库
2. 创建功能分支
3. 提交你的更改
4. 如适用，添加测试
5. 提交 Pull Request

## 许可证

本项目采用 MIT 许可证。
