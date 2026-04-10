import { describe, expect, it } from 'vitest';
import { canChatRoles, orderedParticipantIds } from '../lib/chatPolicy.js';

describe('chatPolicy', () => {
  it('allows any chat where one participant is HOLDER', () => {
    expect(canChatRoles('HOLDER', 'LIDER')).toBe(true);
    expect(canChatRoles('CAJERO', 'HOLDER')).toBe(true);
    expect(canChatRoles('HOLDER', 'HOLDER')).toBe(true);
  });

  it('blocks chat when neither participant is HOLDER', () => {
    expect(canChatRoles('LIDER', 'CAJERO')).toBe(false);
    expect(canChatRoles('CAJERO', 'LIDER')).toBe(false);
    expect(canChatRoles('LIDER', 'LIDER')).toBe(false);
  });

  it('returns participant ids in stable lexical order', () => {
    expect(orderedParticipantIds('b-user', 'a-user')).toEqual(['a-user', 'b-user']);
    expect(orderedParticipantIds('a-user', 'a-user')).toEqual(['a-user', 'a-user']);
  });
});
