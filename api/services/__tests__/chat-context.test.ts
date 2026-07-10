import { describe, expect, it } from 'vitest';
import { buildChatContext } from '../chat-context.js';

describe('buildChatContext', () => {
  it('keeps complete turns and starts Gemini history with a user on the 11th question', () => {
    const messages = [
      { role: 'system', content: 'Be concise.' },
      ...Array.from({ length: 10 }, (_, index) => [
        { role: 'user', content: `question-${index + 1}` },
        { role: 'assistant', content: `answer-${index + 1}` }
      ]).flat(),
      { role: 'user', content: 'question-11' }
    ];

    const context = buildChatContext(messages, 'gemini', { maxCompletedTurns: 10 });

    expect(context[0]).toEqual({ role: 'system', content: 'Be concise.' });
    expect(context[1]).toEqual({ role: 'user', content: 'question-1' });
    expect(context.at(-1)).toEqual({ role: 'user', content: 'question-11' });
    expect(context.filter(message => message.role !== 'system')).toHaveLength(21);
  });

  it('drops orphaned, failed, cancelled and incomplete assistant records', () => {
    const context = buildChatContext([
      { role: 'assistant', content: 'orphan' },
      { role: 'user', content: 'first attempt' },
      { role: 'assistant', content: 'provider failed', status: 'failed' },
      { role: 'user', content: 'retry' },
      { role: 'assistant', content: 'partial', incomplete: true },
      { role: 'assistant', content: 'cancelled', status: 'cancelled' }
    ], 'gemini');

    expect(context).toEqual([
      { role: 'user', content: 'first attempt\n\nretry' }
    ]);
  });

  it('preserves system instructions outside the completed-turn window', () => {
    const context = buildChatContext([
      { role: 'system', content: 'Instruction one' },
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: 'old answer' },
      { role: 'system', content: 'Instruction two' },
      { role: 'user', content: 'active question' }
    ], 'openai', { maxCompletedTurns: 0 });

    expect(context).toEqual([
      { role: 'system', content: 'Instruction one\n\nInstruction two' },
      { role: 'user', content: 'active question' }
    ]);
  });
});
