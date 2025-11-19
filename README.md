# 🤖 AI Chat Application

![AI Coded 100%](https://img.shields.io/badge/AI%20Coded-100%25-brightgreen?style=plastic&labelColor=gray)

A modern multi-AI provider chat application built with React, TypeScript, and Node.js. Support conversations with multiple AI models including OpenAI GPT, Google Gemini, Anthropic Claude, and more.

English | [简体中文](README.zh-CN.md)

## ✨ Key Features

- 🔄 **Multiple AI Provider Support**: OpenAI, Google Gemini, Anthropic Claude, xAI Grok, Ollama
- 👤 **User Authentication System**: User registration and login with data isolation and personalized settings
- 🔐 **User-Configurable API Keys**: Configure personal API keys through web interface or environment variables
- 💬 **Conversation Management**: Create, save, and manage multiple chat conversations with independent user data
- ⚡ **Real-time Chat Interface**: Modern responsive chat UI with message history
- 📝 **Markdown Rendering**: Full Markdown format support for AI responses
- 💾 **Local Data Storage**: All conversations and messages stored in local JSON files
- 📤 **Data Export/Import**: Support user data backup and migration functionality
- 🚀 **Zero Configuration**: No external service registration required, ready to use
- 💼 **Business-Ready**: Reserved subscription and payment interfaces for future expansion
- 🔒 **TypeScript**: Complete type safety for both frontend and backend

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Zustand** for state management

### Backend
- **Node.js** with Express.js and TypeScript
- **Local JSON Database** for data storage
- **AI Service Adapters** for multiple AI providers

## 📋 Prerequisites

- **Node.js 18+** and npm
- **AI Provider API Keys** (can be configured through web interface or environment variables)

## 🚀 Quick Start

### Step 1: Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/YspritanHyzygy/ONMI-CHATBOX.git
cd ONMI-CHATBOX

# Install dependencies
npm install
```

### Step 2: Configure AI Services (Optional)

**Option 1: Environment Variables (Recommended)**

Edit the `.env` file and add your AI API keys:
```env
# AI Provider API Keys (Optional - can also be configured via web interface)
OPENAI_API_KEY=sk-your-openai-key
GEMINI_API_KEY=your-gemini-key
CLAUDE_API_KEY=your-claude-key
XAI_API_KEY=your-grok-key

# Ollama Configuration (if using local Ollama)
OLLAMA_BASE_URL=http://localhost:11434/v1
```

**Option 2: Web Interface Configuration**
Configure through the settings page after starting the application.

### Step 3: Start the Application

```bash
# Start both frontend and backend (recommended)
npm run dev
```

**Or start separately:**
```bash
# Terminal 1: Start backend service (port 3001)
npm run server:dev

# Terminal 2: Start frontend service (port 5173)
npm run client:dev
```

### Step 4: Start Using

1. 🌐 Visit `http://localhost:5173`
2. 👤 **Register/Login**: Create a new account or login with existing username
3. 💬 Start chatting directly, or configure AI services first
4. ⚙️ Click the settings button to configure API keys (optional)
5. ✅ Click "Test Connection" to verify configuration
6. 🎯 Select your default model
7. 🎉 Start chatting!

### Step 5: Data Management (Optional)

- 📤 **Export Data**: Backup your conversations and settings
- 📥 **Import Data**: Restore from backup files
- 🔄 **Switch Users**: Each user has isolated data

### Step 6: Production Deployment

```bash
# Build frontend
npm run build

# Start production server
npm start
```

## 🔧 Configuration Verification

### Check Service Status
After starting the application, check if the terminal output includes:
```
Server ready on port 3001
```

### Check Frontend Service
Successful frontend startup will display:
```
➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

## ❓ Troubleshooting

### Q: AI provider test connection failed
**A**: 
- Confirm API key format is correct
- Check network connection
- Verify API key is valid and has sufficient balance

### Q: Port already in use
**A**: 
```bash
# Check port usage
netstat -ano | findstr :3001
netstat -ano | findstr :5173

# Or modify port configuration
# Frontend: modify server.port in vite.config.ts
# Backend: modify PORT in api/server.ts
```

### Q: No chat history showing?
**A**: This is normal for first-time use. Local storage will automatically create demo data on first use.

## Project Structure

```
├── api/                    # Backend Express.js API
│   ├── routes/            # API route handlers
│   ├── services/          # AI service adapters and managers
│   └── app.ts            # Express app configuration
├── src/                   # Frontend React application
│   ├── components/       # Reusable React components
│   ├── pages/           # Page components
│   ├── hooks/           # Custom React hooks
│   └── lib/            # Utility functions
├── data/                 # Local data storage folder
│   └── database.json    # Chat data storage (auto-created)
└── public/              # Static assets
```

## API Endpoints

### Authentication Endpoints
- `POST /api/auth/register` - Register new user account
- `POST /api/auth/login` - User login
- `GET /api/auth/user/:userId` - Get user information
- `GET /api/auth/check-username/:username` - Check username availability

### Chat Endpoints
- `GET /api/chat/conversations` - Fetch user conversations
- `POST /api/chat` - Send message and get AI response
- `GET /api/chat/:conversationId/messages` - Get conversation messages

### Provider Endpoints
- `GET /api/providers` - Get available AI providers and their configurations
- `GET /api/providers/supported` - Get list of supported AI providers

### Data Management Endpoints
- `GET /api/data/export/:userId` - Export user data
- `POST /api/data/import/:userId` - Import user data
- `GET /api/data/preview/:userId` - Get export data preview

### Business Endpoints (Future)
- `GET /api/business/subscription/:userId` - Get subscription information
- `GET /api/business/usage/:userId` - Get API usage statistics
- `GET /api/business/plans` - Get available subscription plans

## 🤖 Supported AI Providers

| Provider | Latest Models | Configuration | How to Get |
|----------|---------------|---------------|------------|
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo | API Key | [Get API Key](https://platform.openai.com/api-keys) |
| **Google Gemini** | Gemini-2.5-Pro, Gemini-2.5-Flash, Gemini-2.0-Flash | API Key | [Get API Key](https://aistudio.google.com/app/apikey) |
| **Anthropic Claude** | Claude-3.5-Sonnet, Claude-3-Opus, Claude-3.5-Haiku | API Key | [Get API Key](https://console.anthropic.com/) |
| **xAI Grok** | Grok-4, Grok-3, Grok-2-1212, Grok-2-Vision | API Key | [Get API Key](https://console.x.ai/) |
| **Ollama** | Custom Large Language Model (LLM) | Local Installation | [Download Ollama](https://ollama.ai/) |

### 💰 Pricing Information
- **OpenAI**: Pay-per-use, GPT-4o ~$0.005/1K tokens
- **Google Gemini**: Free tier available, pay-per-use after limit
- **Anthropic Claude**: Pay-per-use, Claude-3.5-Sonnet ~$0.003/1K tokens
- **xAI Grok**: Pay-per-use
- **Ollama**: Completely free, runs locally

### 🚀 Recommended Configuration
- **New Users**: Start with Google Gemini (has free tier)
- **Advanced Users**: OpenAI GPT-4o or Claude-3.5-Sonnet (best performance)
- **Local Deployment**: Ollama + Llama3.3 (completely offline, privacy protection)

## 🏦 Model Bank

The application uses a "Model Bank" system to manage model parameters (context window, max tokens, capabilities, etc.) locally. This ensures the UI always reflects the accurate capabilities of each model.

### Updating Model Definitions

To update the local model database with the latest models from providers:

1. **Configure API Keys**: Ensure your `.env` file has valid API keys.
2. **Run Update Scripts**:

```bash
# Update OpenAI models (fetches from API and Azure docs)
node scripts/update-openai-data.cjs

# Update Gemini models (fetches from Google API)
node scripts/update-gemini-data.cjs
```

These scripts will:
- Fetch the latest model lists from the respective APIs
- Update the JSON configuration files in `src/lib/model-parameters/data/`
- Create backups of the previous configurations automatically

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
