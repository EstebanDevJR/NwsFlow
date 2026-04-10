import { Router } from 'express';
import { z } from 'zod';
import prisma from '@paymentflow/database';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { sendSSE } from './sse.js';
import { canChatRoles, orderedParticipantIds } from '../lib/chatPolicy.js';
import { pipeChatExportPdf } from '../lib/chatExportPdf.js';

const router = Router();

router.use(authMiddleware);

function otherParticipantId(
  c: { participantLowId: string; participantHighId: string },
  me: string
): string {
  return c.participantLowId === me ? c.participantHighId : c.participantLowId;
}

/** Usuarios con los que el rol actual puede iniciar conversación. */
router.get('/contacts', async (req, res, next) => {
  try {
    const me = req.user!;
    const uid = me.userId;

    if (me.role === 'LIDER' || me.role === 'CAJERO') {
      const holders = await prisma.user.findMany({
        where: { role: 'HOLDER', isActive: true },
        select: { id: true, name: true, email: true, role: true, avatar: true },
        orderBy: { name: 'asc' },
      });
      return res.json(holders);
    }

    if (me.role === 'HOLDER') {
      const users = await prisma.user.findMany({
        where: { isActive: true, id: { not: uid } },
        select: { id: true, name: true, email: true, role: true, avatar: true },
        orderBy: { name: 'asc' },
      });
      return res.json(users);
    }

    res.json([]);
  } catch (err) {
    next(err);
  }
});

const createConversationSchema = z.object({
  otherUserId: z.string().min(1),
});

router.post('/conversations', async (req, res, next) => {
  try {
    const me = req.user!;
    const { otherUserId } = createConversationSchema.parse(req.body);
    if (otherUserId === me.userId) {
      throw createError('No puedes chatear contigo mismo', 400);
    }

    const [self, other] = await Promise.all([
      prisma.user.findUnique({ where: { id: me.userId } }),
      prisma.user.findFirst({ where: { id: otherUserId, isActive: true } }),
    ]);
    if (!self || !other) throw createError('Usuario no encontrado', 404);
    if (!canChatRoles(self.role, other.role)) {
      throw createError('No tienes permiso para chatear con este usuario', 403);
    }

    const [low, high] = orderedParticipantIds(me.userId, otherUserId);
    const conv = await prisma.chatConversation.upsert({
      where: {
        participantLowId_participantHighId: { participantLowId: low, participantHighId: high },
      },
      create: {
        participantLowId: low,
        participantHighId: high,
      },
      update: {},
      include: {
        participantLow: { select: { id: true, name: true, email: true, role: true, avatar: true } },
        participantHigh: { select: { id: true, name: true, email: true, role: true, avatar: true } },
      },
    });

    const otherUser = otherParticipantId(conv, me.userId) === conv.participantLowId ? conv.participantLow : conv.participantHigh;

    res.json({
      id: conv.id,
      updatedAt: conv.updatedAt,
      otherUser,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/conversations', async (req, res, next) => {
  try {
    const me = req.user!.userId;

    const convs = await prisma.chatConversation.findMany({
      where: {
        OR: [{ participantLowId: me }, { participantHighId: me }],
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, name: true } } },
        },
        reads: { where: { userId: me } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const out = await Promise.all(
      convs.map(async (c) => {
        const otherId = otherParticipantId(c, me);
        const other = await prisma.user.findUnique({
          where: { id: otherId },
          select: { id: true, name: true, email: true, role: true, avatar: true },
        });
        const lastMsg = c.messages[0];
        const lastRead = c.reads[0]?.lastReadAt;
        const unread = await prisma.chatMessage.count({
          where: {
            conversationId: c.id,
            senderId: otherId,
            ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
          },
        });
        return {
          id: c.id,
          updatedAt: c.updatedAt,
          otherUser: other,
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                body: lastMsg.body,
                createdAt: lastMsg.createdAt,
                senderId: lastMsg.senderId,
                senderName: lastMsg.sender.name,
              }
            : null,
          unreadCount: unread,
        };
      })
    );

    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    const me = req.user!.userId;
    const convs = await prisma.chatConversation.findMany({
      where: { OR: [{ participantLowId: me }, { participantHighId: me }] },
      select: {
        id: true,
        participantLowId: true,
        participantHighId: true,
        reads: { where: { userId: me }, select: { lastReadAt: true } },
      },
    });

    let total = 0;
    for (const c of convs) {
      const otherId = otherParticipantId(c, me);
      const lastRead = c.reads[0]?.lastReadAt;
      const n = await prisma.chatMessage.count({
        where: {
          conversationId: c.id,
          senderId: otherId,
          ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
        },
      });
      total += n;
    }
    res.json({ count: total });
  } catch (err) {
    next(err);
  }
});

async function requireConversationMember(conversationId: string, userId: string) {
  const conv = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conv) throw createError('Conversación no encontrada', 404);
  if (conv.participantLowId !== userId && conv.participantHighId !== userId) {
    throw createError('No autorizado', 403);
  }
  return conv;
}

const sendMessageSchema = z.object({
  body: z.string().min(1).max(8000),
});

/** Exportar conversación en PDF (solo holders). */
router.get('/conversations/:id/export', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const me = req.user!.userId;
    const { id } = req.params;
    const conv = await requireConversationMember(id, me);

    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 8000,
      include: { sender: { select: { name: true } } },
    });

    const otherId = otherParticipantId(conv, me);
    const [selfUser, otherUser] = await Promise.all([
      prisma.user.findUnique({
        where: { id: me },
        select: { name: true, email: true, role: true },
      }),
      prisma.user.findUnique({
        where: { id: otherId },
        select: { name: true, email: true, role: true },
      }),
    ]);

    const safeName = (otherUser?.name ?? 'contacto').replace(/[^\w\s-]/g, '').slice(0, 40) || 'chat';
    const filename = `chat-${safeName}-${id.slice(-8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);

    const exportMessages = messages.map((m) => ({
      body: m.body,
      createdAt: m.createdAt,
      senderName: m.sender.name,
      isMine: m.senderId === me,
    }));

    pipeChatExportPdf(
      res,
      exportMessages,
      {
        selfName: selfUser?.name ?? 'Tú',
        selfRole: selfUser?.role ?? '—',
        selfEmail: selfUser?.email,
        otherName: otherUser?.name ?? '—',
        otherRole: otherUser?.role ?? '—',
        otherEmail: otherUser?.email,
        exportedAt: new Date(),
      },
      (err) => next(err)
    );
  } catch (err) {
    next(err);
  }
});

router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const me = req.user!.userId;
    const { id } = req.params;
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const take = Math.min(100, Math.max(1, parseInt(String(req.query.take || '40'), 10) || 40));

    await requireConversationMember(id, me);

    let beforeDate: Date | undefined;
    if (before) {
      const ref = await prisma.chatMessage.findFirst({
        where: { id: before, conversationId: id },
      });
      if (!ref) throw createError('Mensaje no encontrado', 404);
      beforeDate = ref.createdAt;
    }

    const batch = await prisma.chatMessage.findMany({
      where: {
        conversationId: id,
        ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
      },
    });

    const chronological = [...batch].reverse();
    const oldestInBatch = batch[batch.length - 1];
    const nextCursor = batch.length === take && oldestInBatch ? oldestInBatch.id : null;

    res.json({
      messages: chronological.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        senderId: m.senderId,
        sender: m.sender,
      })),
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
});

/** Elimina todos los mensajes de la conversación (ambos participantes dejan de verlos). */
router.delete('/conversations/:id/messages', async (req, res, next) => {
  try {
    const me = req.user!.userId;
    const { id } = req.params;
    const conv = await requireConversationMember(id, me);

    await prisma.$transaction([
      prisma.chatMessage.deleteMany({ where: { conversationId: id } }),
      prisma.chatConversationRead.deleteMany({ where: { conversationId: id } }),
    ]);

    await prisma.chatConversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    const low = conv.participantLowId;
    const high = conv.participantHighId;
    const payload = { conversationId: id };
    sendSSE(low, 'chat_cleared', payload);
    sendSSE(high, 'chat_cleared', payload);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const me = req.user!.userId;
    const { id } = req.params;
    const { body: text } = sendMessageSchema.parse(req.body);

    const conv = await requireConversationMember(id, me);

    const msg = await prisma.chatMessage.create({
      data: {
        conversationId: id,
        senderId: me,
        body: text.trim(),
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
      },
    });

    await prisma.chatConversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    const payload = {
      conversationId: id,
      message: {
        id: msg.id,
        body: msg.body,
        createdAt: msg.createdAt,
        senderId: msg.senderId,
        sender: msg.sender,
      },
    };

    const low = conv.participantLowId;
    const high = conv.participantHighId;
    sendSSE(low, 'chat_message', payload);
    sendSSE(high, 'chat_message', payload);

    res.status(201).json(payload.message);
  } catch (err) {
    next(err);
  }
});

router.patch('/conversations/:id/read', async (req, res, next) => {
  try {
    const me = req.user!.userId;
    const { id } = req.params;
    await requireConversationMember(id, me);

    await prisma.chatConversationRead.upsert({
      where: {
        conversationId_userId: { conversationId: id, userId: me },
      },
      create: {
        conversationId: id,
        userId: me,
        lastReadAt: new Date(),
      },
      update: {
        lastReadAt: new Date(),
      },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
