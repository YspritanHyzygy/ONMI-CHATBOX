import type { AIProvider, ChatMessage, MessageRole } from './types.js';

export interface StoredChatMessage {
  role?: unknown;
  content?: unknown;
  status?: unknown;
  is_error?: unknown;
  isError?: unknown;
  incomplete?: unknown;
  cancelled?: unknown;
}

export interface ChatContextOptions {
  /** Number of completed user/assistant turns retained before the active user turn. */
  maxCompletedTurns?: number;
}

const EXCLUDED_STATUSES = new Set([
  'cancelled',
  'canceled',
  'error',
  'failed',
  'incomplete',
  'interrupted',
  'pending',
  'streaming'
]);

const LEGACY_ERROR_PREFIXES = [
  'ai service temporarily unavailable',
  'ai service call failed',
  'sorry, the ai service',
  '抱歉，ai服务暂时不可用',
  '抱歉，AI服务暂时不可用'
];

function isRole(value: unknown): value is MessageRole {
  return value === 'user' || value === 'assistant' || value === 'system';
}

function isUsableMessage(message: StoredChatMessage): message is StoredChatMessage & {
  role: MessageRole;
  content: string;
} {
  if (!isRole(message.role) || typeof message.content !== 'string' || !message.content.trim()) {
    return false;
  }

  const status = typeof message.status === 'string' ? message.status.toLowerCase() : '';
  if (EXCLUDED_STATUSES.has(status)) {
    return false;
  }

  if (
    message.is_error === true ||
    message.isError === true ||
    message.incomplete === true ||
    message.cancelled === true
  ) {
    return false;
  }

  if (message.role === 'assistant') {
    const normalized = message.content.trim().toLowerCase();
    if (LEGACY_ERROR_PREFIXES.some(prefix => normalized.startsWith(prefix.toLowerCase()))) {
      return false;
    }
  }

  return true;
}

function mergeAdjacent(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];

  for (const message of messages) {
    const previous = merged[merged.length - 1];
    if (previous?.role === message.role) {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else {
      merged.push({ ...message });
    }
  }

  return merged;
}

/**
 * Builds a provider-safe context from persisted messages.
 *
 * System instructions are kept outside the turn window. Dialogue is reduced to
 * complete user/assistant turns plus the latest active user turn. Orphaned
 * assistant messages and failed/partial records are deliberately ignored.
 */
export function buildChatContext(
  storedMessages: unknown,
  _provider: AIProvider,
  options: ChatContextOptions = {}
): ChatMessage[] {
  const maxCompletedTurns = Math.max(0, options.maxCompletedTurns ?? 10);
  const input = Array.isArray(storedMessages) ? storedMessages : [];
  const usable = input
    .filter((message): message is StoredChatMessage => typeof message === 'object' && message !== null)
    .filter(isUsableMessage)
    .map(message => ({ role: message.role, content: message.content.trim() }));

  const systemContent = usable
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n\n');

  const dialogue = mergeAdjacent(usable.filter(message => message.role !== 'system'));

  // Providers (especially Gemini) reject histories that begin with a model turn.
  while (dialogue[0]?.role === 'assistant') {
    dialogue.shift();
  }

  const completedTurns: Array<[ChatMessage, ChatMessage]> = [];
  let activeUser: ChatMessage | undefined;

  for (const message of dialogue) {
    if (message.role === 'user') {
      activeUser = message;
      continue;
    }

    if (message.role === 'assistant' && activeUser) {
      completedTurns.push([activeUser, message]);
      activeUser = undefined;
    }
  }

  const retainedTurns = maxCompletedTurns === 0
    ? []
    : completedTurns.slice(-maxCompletedTurns);
  const selectedDialogue = retainedTurns
    .flatMap(([user, assistant]) => [user, assistant]);

  if (activeUser) {
    selectedDialogue.push(activeUser);
  }

  const context: ChatMessage[] = [];
  if (systemContent) {
    context.push({ role: 'system', content: systemContent });
  }
  context.push(...selectedDialogue);

  return context;
}
