export type AppRole = 'LIDER' | 'HOLDER' | 'CAJERO';

/** Líder y cajero solo pueden chatear con holders; holders pueden chatear con cualquiera. */
export function canChatRoles(a: AppRole, b: AppRole): boolean {
  if (a === 'HOLDER' || b === 'HOLDER') return true;
  return false;
}

export function orderedParticipantIds(userId1: string, userId2: string): [string, string] {
  return userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
}
