import test from 'node:test';
import assert from 'node:assert/strict';
import {showChatTime,fullChatTime,chatTimeLabel,conversationTime} from '../src/chat-presentation.js';
test('private chat groups time at five minutes and Shanghai midnight',()=>{
  assert.equal(showChatTime('2026-11-01T15:59:00Z'),true);
  assert.equal(showChatTime('2026-11-01T15:59:59Z','2026-11-01T15:59:00Z'),false);
  assert.equal(showChatTime('2026-11-01T16:00:00Z','2026-11-01T15:59:59Z'),true);
  assert.equal(showChatTime('2026-11-01T16:05:00Z','2026-11-01T16:00:00Z'),true);
  assert.equal(showChatTime('invalid','2026-11-01T16:00:00Z'),false);
});
test('time labels distinguish today, yesterday and other years consistently',()=>{
  const now='2026-11-02T02:00:00Z';
  assert.equal(chatTimeLabel('2026-11-02T01:00:00Z',now),'09:00');
  assert.equal(chatTimeLabel('2026-11-01T15:00:00Z',now),'昨天 23:00');
  assert.equal(chatTimeLabel('2025-11-01T15:00:00Z',now),'2025年11月1日 23:00');
  assert.equal(conversationTime('2026-11-01T15:00:00Z',now),'昨天');
  assert.equal(conversationTime('2026-10-30T01:00:00Z',now),'10/30');
  assert.equal(fullChatTime('2026-11-01T16:00:00Z'),'2026-11-02 00:00:00');
  assert.equal(fullChatTime(null),'');
});
