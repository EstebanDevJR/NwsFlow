import { Router } from 'express';
import { z } from 'zod';
import prisma from '@paymentflow/database';
import { requireRole } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import {
  queueHolderMeetingInvite,
  notifyLeaderMeetingConfirmed,
  notifyLeaderMeetingDeclined,
} from '../services/meetingNotifications.js';

const router = Router();

function parseScheduledAt(raw: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw createError('Fecha y hora inválidas', 400);
  }
  return d;
}

const createMeetingSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  scheduledAt: z.string().min(1),
  holderId: z.string().min(1),
  meetingUrl: z.union([z.string().url(), z.literal('')]).optional(),
});

router.post('/', requireRole('LIDER'), async (req, res, next) => {
  try {
    const data = createMeetingSchema.parse(req.body);
    const scheduledAt = parseScheduledAt(data.scheduledAt);
    const holder = await prisma.user.findFirst({
      where: { id: data.holderId, role: 'HOLDER', isActive: true },
    });
    if (!holder) throw createError('Holder no encontrado', 404);

    const meeting = await prisma.meeting.create({
      data: {
        title: data.title,
        description: data.description,
        scheduledAt,
        holderId: data.holderId,
        leaderId: req.user!.userId,
        meetingUrl: data.meetingUrl?.trim() || undefined,
      },
      include: {
        leader: { select: { id: true, name: true, email: true } },
        holder: {
          select: {
            id: true,
            name: true,
            email: true,
            inAppNotifications: true,
          },
        },
      },
    });

    await queueHolderMeetingInvite({
      id: meeting.id,
      title: meeting.title,
      description: meeting.description,
      scheduledAt: meeting.scheduledAt,
      holderId: meeting.holderId,
      leader: meeting.leader,
      holder: meeting.holder,
    });

    res.status(201).json(meeting);
  } catch (err) {
    next(err);
  }
});

const updateMeetingSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
  scheduledAt: z.string().optional(),
  meetingUrl: z.union([z.string().url(), z.literal('')]).optional().nullable(),
});

router.get('/', requireRole('LIDER', 'HOLDER'), async (req, res, next) => {
  try {
    const where: { leaderId?: string; holderId?: string } = {};
    if (req.user!.role === 'LIDER') where.leaderId = req.user!.userId;
    if (req.user!.role === 'HOLDER') where.holderId = req.user!.userId;

    const meetings = await prisma.meeting.findMany({
      where,
      include: {
        leader: { select: { id: true, name: true, email: true } },
        holder: { select: { id: true, name: true, email: true } },
      },
      orderBy: { scheduledAt: 'desc' },
    });
    res.json(meetings);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('HOLDER', 'LIDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = updateMeetingSchema.parse(req.body);
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw createError('Reunión no encontrada', 404);

    const uid = req.user!.userId;
    const role = req.user!.role;
    if (role === 'HOLDER' && meeting.holderId !== uid) throw createError('No autorizado', 403);
    if (role === 'LIDER' && meeting.leaderId !== uid) throw createError('No autorizado', 403);

    const data: { status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'; scheduledAt?: Date; meetingUrl?: string | null } =
      {};

    if (body.meetingUrl !== undefined) {
      data.meetingUrl = body.meetingUrl?.trim() || null;
    }

    if (body.scheduledAt !== undefined) {
      if (role !== 'HOLDER') throw createError('Solo el holder puede reprogramar la fecha', 403);
      if (meeting.status !== 'PENDING' && meeting.status !== 'CONFIRMED') {
        throw createError('Solo se puede reprogramar si está pendiente o confirmada', 400);
      }
      data.scheduledAt = parseScheduledAt(body.scheduledAt);
    }

    if (body.status !== undefined) {
      const nextStatus = body.status;
      if (role === 'HOLDER') {
        if (nextStatus === 'CONFIRMED') {
          if (meeting.status !== 'PENDING') throw createError('Solo puedes confirmar reuniones pendientes', 400);
          data.status = 'CONFIRMED';
        } else if (nextStatus === 'CANCELLED') {
          if (!['PENDING', 'CONFIRMED'].includes(meeting.status)) throw createError('No se puede cancelar', 400);
          data.status = 'CANCELLED';
        } else if (nextStatus === 'COMPLETED') {
          if (meeting.status !== 'CONFIRMED') throw createError('Solo reuniones confirmadas pueden marcarse completadas', 400);
          data.status = 'COMPLETED';
        } else {
          throw createError('Estado no permitido', 400);
        }
      } else {
        if (nextStatus === 'CANCELLED') {
          if (!['PENDING', 'CONFIRMED'].includes(meeting.status)) throw createError('No se puede cancelar', 400);
          data.status = 'CANCELLED';
        } else if (nextStatus === 'COMPLETED') {
          if (meeting.status !== 'CONFIRMED') throw createError('Solo reuniones confirmadas pueden completarse', 400);
          data.status = 'COMPLETED';
        } else {
          throw createError('Estado no permitido para líder', 400);
        }
      }
    }

    if (Object.keys(data).length === 0) {
      throw createError('No hay cambios', 400);
    }

    const prevStatus = meeting.status;
    const prevScheduledMs = meeting.scheduledAt.getTime();
    const updated = await prisma.meeting.update({
      where: { id },
      data,
      include: {
        leader: { select: { id: true, name: true, email: true } },
        holder: { select: { id: true, name: true, email: true } },
      },
    });

    if (data.status === 'CONFIRMED' && prevStatus === 'PENDING') {
      await notifyLeaderMeetingConfirmed({
        id: updated.id,
        title: updated.title,
        scheduledAt: updated.scheduledAt,
        leaderId: updated.leaderId,
        holder: { name: updated.holder.name },
      });
    }

    if (data.status === 'CANCELLED' && role === 'HOLDER' && (prevStatus === 'PENDING' || prevStatus === 'CONFIRMED')) {
      await notifyLeaderMeetingDeclined({
        title: updated.title,
        scheduledAt: updated.scheduledAt,
        leaderId: updated.leaderId,
        holder: { name: updated.holder.name },
      });
    }

    if (data.status === 'CANCELLED' && prevStatus === 'PENDING' && role === 'LIDER') {
      const { addInAppNotificationJob } = await import('../services/queue.js');
      await addInAppNotificationJob({
        userId: updated.holderId,
        type: 'MEETING_CANCELLED',
        title: 'Reunión cancelada',
        message: `${updated.leader.name} canceló la propuesta: ${updated.title}`,
        link: '/meetings',
      });
    }

    if (data.status === 'CANCELLED' && prevStatus === 'CONFIRMED' && role === 'LIDER') {
      const { addInAppNotificationJob } = await import('../services/queue.js');
      await addInAppNotificationJob({
        userId: updated.holderId,
        type: 'MEETING_CANCELLED',
        title: 'Reunión cancelada',
        message: `${updated.leader.name} canceló la reunión: ${updated.title}`,
        link: '/meetings',
      });
    }

    if (body.scheduledAt !== undefined && role === 'HOLDER' && updated.scheduledAt.getTime() !== prevScheduledMs) {
      const { addInAppNotificationJob } = await import('../services/queue.js');
      await addInAppNotificationJob({
        userId: updated.leaderId,
        type: 'MEETING_RESCHEDULED',
        title: 'Reunión reprogramada',
        message: `${updated.holder.name} cambió la hora de «${updated.title}» a ${updated.scheduledAt.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}`,
        link: '/meetings',
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting || meeting.holderId !== req.user!.userId) throw createError('No autorizado', 403);
    if (meeting.status === 'CANCELLED' || meeting.status === 'COMPLETED') {
      return res.json({ message: 'Ya estaba cerrada' });
    }
    await prisma.meeting.update({ where: { id }, data: { status: 'CANCELLED' } });
    if (meeting.status === 'PENDING' || meeting.status === 'CONFIRMED') {
      const hn = (await prisma.user.findUnique({ where: { id: meeting.holderId } }))?.name || 'Holder';
      await notifyLeaderMeetingDeclined({
        title: meeting.title,
        scheduledAt: meeting.scheduledAt,
        leaderId: meeting.leaderId,
        holder: { name: hn },
      });
    }
    res.json({ message: 'Meeting cancelled' });
  } catch (err) {
    next(err);
  }
});

export default router;
