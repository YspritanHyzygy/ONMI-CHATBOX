import type {
  AIResponse,
  AIServiceAdapter,
  AIServiceConfig,
  ChatMessage,
  StreamResponse
} from './types.js';
import { AIServiceError } from './types.js';
import { normalizeOllamaBaseUrl } from './config-manager.js';
import { buildServiceUrl } from './url-utils.js';

type AbortableConfig = AIServiceConfig & { signal?: AbortSignal };

interface OllamaChatChunk {
  model?: string;
  message?: { content?: string; thinking?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * 兜底解析器：部分推理模型（如早期 deepseek-r1 tag 版本）不走 Ollama 的原生
 * thinking 通道，而是把 <think>...</think> 直接混在 content 里。该状态机能
 * 处理标签被流式切碎的情况（如一个 chunk 结尾是 "<thi"）。
 */
class ThinkTagParser {
  private inside = false;
  private pending = '';

  private static longestPartialSuffix(text: string, tag: string): number {
    const max = Math.min(text.length, tag.length - 1);
    for (let len = max; len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) return len;
    }
    return 0;
  }

  feed(text: string): { thought: string; content: string } {
    this.pending += text;
    let thought = '';
    let content = '';
    for (;;) {
      const tag = this.inside ? '</think>' : '<think>';
      const idx = this.pending.indexOf(tag);
      if (idx === -1) {
        const keep = ThinkTagParser.longestPartialSuffix(this.pending, tag);
        const emit = this.pending.slice(0, this.pending.length - keep);
        this.pending = this.pending.slice(this.pending.length - keep);
        if (this.inside) thought += emit;
        else content += emit;
        break;
      }
      const before = this.pending.slice(0, idx);
      if (this.inside) thought += before;
      else content += before;
      this.pending = this.pending.slice(idx + tag.length);
      this.inside = !this.inside;
    }
    return { thought, content };
  }

  flush(): { thought: string; content: string } {
    const rest = this.pending;
    this.pending = '';
    return this.inside ? { thought: rest, content: '' } : { thought: '', content: rest };
  }
}

export class OllamaAdapter implements AIServiceAdapter {
  provider = 'ollama' as const;

  private getBaseUrl(config: AIServiceConfig): string {
    return normalizeOllamaBaseUrl(config.baseUrl);
  }

  private buildOptions(config: AIServiceConfig) {
    const numPredict = config.numPredict ?? config.maxTokens;
    return {
      temperature: config.temperature ?? 0.7,
      // 用户未设置时不传，交给模型自身上限，避免静默截断
      ...(numPredict !== undefined ? { num_predict: numPredict } : {}),
      ...(config.topP !== undefined ? { top_p: config.topP } : {}),
      ...(config.numCtx !== undefined ? { num_ctx: config.numCtx } : {}),
      ...(config.repeatPenalty !== undefined ? { repeat_penalty: config.repeatPenalty } : {}),
      ...(config.stop ? { stop: config.stop } : {})
    };
  }

  private buildRequest(
    messages: ChatMessage[],
    config: AIServiceConfig,
    stream: boolean,
    options?: { omitThink?: boolean }
  ) {
    return {
      model: config.model,
      messages: messages.map(message => ({ role: message.role, content: message.content })),
      stream,
      ...(config.enableThinking && !options?.omitThink ? { think: true } : {}),
      options: this.buildOptions(config)
    };
  }

  /**
   * 发起 chat 请求。模型不支持 think 参数时 Ollama 会直接报错，
   * 此时去掉 think 重试一次（<think> 标签兜底解析仍然生效）。
   */
  private async requestChat(
    messages: ChatMessage[],
    config: AIServiceConfig,
    stream: boolean
  ): Promise<globalThis.Response> {
    const signal = (config as AbortableConfig).signal;
    const url = buildServiceUrl('ollama', 'chat', this.getBaseUrl(config));
    const send = (omitThink: boolean) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.buildRequest(messages, config, stream, { omitThink })),
      signal
    });

    let response = await send(false);
    if (!response.ok && config.enableThinking) {
      const errorText = await response.text().catch(() => '');
      if (/think/i.test(errorText)) {
        response = await send(true);
      } else {
        throw new AIServiceError(`Ollama request failed with HTTP ${response.status}`, 'ollama', response.status);
      }
    }
    if (!response.ok) {
      throw new AIServiceError(`Ollama request failed with HTTP ${response.status}`, 'ollama', response.status);
    }
    return response;
  }

  async chat(messages: ChatMessage[], config: AIServiceConfig): Promise<AIResponse> {
    try {
      const response = await this.requestChat(messages, config, false);

      const data = await response.json() as OllamaChatChunk;
      let content = data.message?.content ?? '';
      let thinking = data.message?.thinking ?? '';

      // 兜底：模型把 <think> 混进 content 时拆出来
      if (config.enableThinking && !thinking && content.includes('<think>')) {
        const parser = new ThinkTagParser();
        const fed = parser.feed(content);
        const rest = parser.flush();
        thinking = fed.thought + rest.thought;
        content = fed.content + rest.content;
      }

      if (!content) {
        throw new AIServiceError('Ollama returned an empty response', 'ollama');
      }

      const promptTokens = data.prompt_eval_count ?? 0;
      const completionTokens = data.eval_count ?? 0;
      return {
        content,
        model: data.model || config.model,
        provider: 'ollama',
        thinking: thinking ? { content: thinking } : undefined,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        }
      };
    } catch (error: unknown) {
      if (error instanceof AIServiceError) throw error;
      const cause = error as { message?: string; status?: number };
      throw new AIServiceError(cause.message || 'Ollama request failed', 'ollama', cause.status, error);
    }
  }

  async *streamChat(messages: ChatMessage[], config: AIServiceConfig): AsyncGenerator<StreamResponse> {
    const signal = (config as AbortableConfig).signal;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const response = await this.requestChat(messages, config, true);
      if (!response.body) {
        throw new AIServiceError('Ollama returned an empty stream', 'ollama');
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      const tagParser = config.enableThinking ? new ThinkTagParser() : null;
      // 模型走原生 thinking 通道后关闭标签兜底，避免正文里出现的字面 <think>
      // 文本（如模型引用该标签）被误拆（与非流式路径的 !thinking 门控一致）
      let sawNativeThinking = false;

      const consumeLine = (line: string): OllamaChatChunk | undefined => {
        const trimmed = line.trim();
        return trimmed ? JSON.parse(trimmed) as OllamaChatChunk : undefined;
      };

      // 把一个 NDJSON 块转成待下发的流式响应（原生 thinking 通道 + 标签兜底）
      const expandChunk = (chunk: OllamaChatChunk): StreamResponse[] => {
        const out: StreamResponse[] = [];
        const model = chunk.model || config.model;
        if (chunk.message?.thinking) {
          sawNativeThinking = true;
          out.push({
            content: '',
            done: false,
            model,
            provider: 'ollama',
            thinking: { content: chunk.message.thinking, done: false }
          });
        }
        const rawContent = chunk.message?.content || '';
        if (rawContent) {
          const { thought, content } = tagParser && !sawNativeThinking
            ? tagParser.feed(rawContent)
            : { thought: '', content: rawContent };
          if (thought) {
            out.push({
              content: '',
              done: false,
              model,
              provider: 'ollama',
              thinking: { content: thought, done: false }
            });
          }
          if (content) {
            out.push({ content, done: false, model, provider: 'ollama' });
          }
        }
        if (chunk.done) {
          const rest = tagParser?.flush();
          if (rest?.thought) {
            out.push({
              content: '',
              done: false,
              model,
              provider: 'ollama',
              thinking: { content: rest.thought, done: true }
            });
          }
          if (rest?.content) {
            out.push({ content: rest.content, done: false, model, provider: 'ollama' });
          }
          out.push({ content: '', done: true, model, provider: 'ollama' });
        }
        return out;
      };

      while (!completed) {
        if (signal?.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError');
        }

        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        // Keep the final unterminated NDJSON record until it is explicitly
        // consumed below. Ollama usually includes a trailing newline, but a
        // proxy is allowed to close immediately after the final JSON object.
        buffer = lines.pop() || '';

        for (const line of lines) {
          const chunk = consumeLine(line);
          if (!chunk) continue;
          for (const item of expandChunk(chunk)) yield item;
          if (chunk.done) {
            completed = true;
            break;
          }
        }

        if (done) {
          if (buffer.trim()) {
            const chunk = consumeLine(buffer);
            if (chunk) {
              for (const item of expandChunk(chunk)) yield item;
              if (chunk.done) completed = true;
            }
          }
          buffer = '';
          break;
        }
      }

      if (!completed) {
        throw new AIServiceError('Ollama stream ended before completion', 'ollama');
      }
    } catch (error: unknown) {
      if (error instanceof AIServiceError) throw error;
      const cause = error as { message?: string; status?: number };
      throw new AIServiceError(cause.message || 'Ollama streaming request failed', 'ollama', cause.status, error);
    } finally {
      if (signal?.aborted) {
        await reader?.cancel().catch(() => undefined);
      }
    }
  }

  async testConnection(config: AIServiceConfig): Promise<boolean> {
    try {
      const response = await fetch(
        buildServiceUrl('ollama', 'models', this.getBaseUrl(config)),
        { signal: (config as AbortableConfig).signal }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(config: AIServiceConfig): Promise<{ id: string; name: string }[]> {
    try {
      const response = await fetch(
        buildServiceUrl('ollama', 'models', this.getBaseUrl(config)),
        { signal: (config as AbortableConfig).signal }
      );
      if (!response.ok) {
        throw new AIServiceError(`Failed to fetch Ollama models: HTTP ${response.status}`, 'ollama', response.status);
      }

      const data = await response.json() as { models?: Array<{ name?: string }> };
      return (data.models || [])
        .filter((model): model is { name: string } => typeof model.name === 'string' && !!model.name)
        .map(model => ({ id: model.name, name: model.name }));
    } catch (error: unknown) {
      if (error instanceof AIServiceError) throw error;
      const cause = error as { message?: string };
      throw new AIServiceError(cause.message || 'Unable to connect to Ollama', 'ollama', 503, error);
    }
  }

  async pullModel(modelName: string, config: AIServiceConfig): Promise<boolean> {
    try {
      const response = await fetch(buildServiceUrl('ollama', 'pull', this.getBaseUrl(config)), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        signal: (config as AbortableConfig).signal
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
