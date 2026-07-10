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
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaAdapter implements AIServiceAdapter {
  provider = 'ollama' as const;

  private getBaseUrl(config: AIServiceConfig): string {
    return normalizeOllamaBaseUrl(config.baseUrl);
  }

  private buildOptions(config: AIServiceConfig) {
    return {
      temperature: config.temperature ?? 0.7,
      num_predict: config.numPredict ?? config.maxTokens ?? 2000,
      ...(config.topP !== undefined ? { top_p: config.topP } : {}),
      ...(config.numCtx !== undefined ? { num_ctx: config.numCtx } : {}),
      ...(config.repeatPenalty !== undefined ? { repeat_penalty: config.repeatPenalty } : {}),
      ...(config.stop ? { stop: config.stop } : {})
    };
  }

  private buildRequest(messages: ChatMessage[], config: AIServiceConfig, stream: boolean) {
    return {
      model: config.model,
      messages: messages.map(message => ({ role: message.role, content: message.content })),
      stream,
      options: this.buildOptions(config)
    };
  }

  async chat(messages: ChatMessage[], config: AIServiceConfig): Promise<AIResponse> {
    try {
      const response = await fetch(buildServiceUrl('ollama', 'chat', this.getBaseUrl(config)), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildRequest(messages, config, false)),
        signal: (config as AbortableConfig).signal
      });

      if (!response.ok) {
        throw new AIServiceError(`Ollama request failed with HTTP ${response.status}`, 'ollama', response.status);
      }

      const data = await response.json() as OllamaChatChunk;
      const content = data.message?.content;
      if (!content) {
        throw new AIServiceError('Ollama returned an empty response', 'ollama');
      }

      const promptTokens = data.prompt_eval_count ?? 0;
      const completionTokens = data.eval_count ?? 0;
      return {
        content,
        model: data.model || config.model,
        provider: 'ollama',
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
      const response = await fetch(buildServiceUrl('ollama', 'chat', this.getBaseUrl(config)), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildRequest(messages, config, true)),
        signal
      });

      if (!response.ok) {
        throw new AIServiceError(`Ollama request failed with HTTP ${response.status}`, 'ollama', response.status);
      }
      if (!response.body) {
        throw new AIServiceError('Ollama returned an empty stream', 'ollama');
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;

      const consumeLine = (line: string): OllamaChatChunk | undefined => {
        const trimmed = line.trim();
        return trimmed ? JSON.parse(trimmed) as OllamaChatChunk : undefined;
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

          if (chunk.message?.content) {
            yield {
              content: chunk.message.content,
              done: false,
              model: chunk.model || config.model,
              provider: 'ollama'
            };
          }

          if (chunk.done) {
            completed = true;
            yield {
              content: '',
              done: true,
              model: chunk.model || config.model,
              provider: 'ollama'
            };
            break;
          }
        }

        if (done) {
          if (buffer.trim()) {
            const chunk = consumeLine(buffer);
            if (chunk?.message?.content) {
              yield {
                content: chunk.message.content,
                done: false,
                model: chunk.model || config.model,
                provider: 'ollama'
              };
            }
            if (chunk?.done) {
              completed = true;
              yield {
                content: '',
                done: true,
                model: chunk.model || config.model,
                provider: 'ollama'
              };
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
