import { addInAppNotificationJob } from './queue.js';

function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return [...s].slice(0, max).join('') + '…';
}

/**
 * Invitación al holder: notificación in-app; el correo lo envía el worker si `emailNotifications`.
 */
export async function queueHolderMeetingInvite(meeting: {
  id: string;
  title: string;
  description: string;
  scheduledAt: Date;
  holderId: string;
  leader: { name: string };
  holder: { name: string; inAppNotifications?: boolean };
}) {
  const when = meeting.scheduledAt.toLocaleString('es', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const desc = truncateText(meeting.description, 400);
  const message = [
    `${meeting.leader.name} te propone una reunión.`,
    ``,
    `Título: ${meeting.title}`,
    ``,
    desc,
    ``,
    `Cuándo: ${when}`,
  ].join('\n');

  if (meeting.holder.inAppNotifications !== false) {
    await addInAppNotificationJob({
      userId: meeting.holderId,
      type: 'MEETING_INVITE',
      title: 'Nueva reunión',
      message,
      link: '/meetings',
    });
  }
}

/** Líder: reunión confirmada por el holder (in-app + correo vía worker). */
export async function notifyLeaderMeetingConfirmed(meeting: {
  id: string;
  title: string;
  scheduledAt: Date;
  leaderId: string;
  holder: { name: string };
}) {
  const when = meeting.scheduledAt.toLocaleString('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  await addInAppNotificationJob({
    userId: meeting.leaderId,
    type: 'MEETING_CONFIRMED',
    title: 'Reunión confirmada',
    message: `${meeting.holder.name} confirmó: "${meeting.title}" — ${when}`,
    link: '/meetings',
  });
}

/** Líder: el holder rechazó o canceló una reunión pendiente. */
export async function notifyLeaderMeetingDeclined(meeting: {
  title: string;
  scheduledAt: Date;
  leaderId: string;
  holder: { name: string };
  reason?: string;
}) {
  const when = meeting.scheduledAt.toLocaleString('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const msg = meeting.reason
    ? `${meeting.holder.name} rechazó o canceló: "${meeting.title}" (${when}). ${meeting.reason}`
    : `${meeting.holder.name} rechazó o canceló: "${meeting.title}" — ${when}`;
  await addInAppNotificationJob({
    userId: meeting.leaderId,
    type: 'MEETING_CANCELLED',
    title: 'Reunión cancelada o rechazada',
    message: msg,
    link: '/meetings',
  });
}
