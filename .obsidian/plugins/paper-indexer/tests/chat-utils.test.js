const { normalizeMessage, generateDiscussionId } = require('../ui/chat-utils');

describe('chat-utils', () => {
  test('normalizeMessage parses timestamp strings and defaults', () => {
    const m1 = normalizeMessage({ role: 'user', content: 'hi', timestamp: new Date().toISOString() });
    expect(m1.role).toBe('user');
    expect(m1.content).toBe('hi');
    expect(m1.timestamp instanceof Date).toBe(true);

    const m2 = normalizeMessage({ role: 'assistant', content: 123, timestamp: 123456789 });
    expect(m2.content).toBe('123');
    expect(m2.timestamp instanceof Date).toBe(true);

    const m3 = normalizeMessage({});
    expect(m3.role).toBe('assistant');
    expect(m3.content).toBe('');
    expect(m3.timestamp instanceof Date).toBe(true);
  });

  test('generateDiscussionId creates a string with prefix', () => {
    const id = generateDiscussionId();
    expect(typeof id).toBe('string');
    expect(id.startsWith('discussion_')).toBe(true);
  });
});
