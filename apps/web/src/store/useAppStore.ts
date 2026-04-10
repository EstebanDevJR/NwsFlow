import { create } from 'zustand';
import { api } from '@/lib/api';
import type { CurrencyCode, PaymentMethodType } from '@paymentflow/shared';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';

export interface PaymentRequest {
  id: string;
  amount: number;
  currency: CurrencyCode;
  concept: string;
  description: string;
  category: string;
  paymentMethod?: PaymentMethodType | null;
  paymentMethodDetail?: string | null;
  requiredDate: string;
  status: RequestStatus;
  rejectionComment?: string;
  paymentProofUrl?: string;
  createdAt: string;
  updatedAt?: string;
  /** Fecha en que se marcó como pagado (solo si aplica). */
  paidAt?: string | null;
  userId: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  evidences?: Evidence[];
  timeline?: PaymentTimeline[];
}

export interface Evidence {
  id: string;
  filename: string;
  filepath: string;
  url?: string | null;
  mimetype: string;
  size: number;
}

export interface PaymentTimeline {
  id: string;
  status: RequestStatus;
  comment?: string;
  changedBy?: string;
  createdAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  description: string;
  scheduledAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  meetingUrl?: string;
  leaderId: string;
  holderId: string;
  leader?: { id: string; name: string; email: string };
  holder?: { id: string; name: string; email: string };
}

export interface PaymentsListResponse {
  data: PaymentRequest[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface AppState {
  requests: PaymentRequest[];
  meetings: Meeting[];
  isLoading: boolean;
  fetchRequests: () => Promise<void>;
  createRequest: (data: {
    amount: number;
    currency: CurrencyCode;
    concept: string;
    description: string;
    category: string;
    paymentMethod: PaymentMethodType;
    paymentMethodDetail: string;
    requiredDate: string;
  }) => Promise<PaymentRequest>;
  updateRequestStatus: (
    id: string,
    status: RequestStatus,
    extra?: { rejectionComment?: string; paymentProofUrl?: string }
  ) => Promise<void>;
  fetchMeetings: () => Promise<void>;
  createMeeting: (data: {
    title: string;
    description: string;
    scheduledAt: string;
    holderId: string;
    meetingUrl?: string;
  }) => Promise<void>;
  updateMeeting: (
    id: string,
    body: { status?: Meeting['status']; scheduledAt?: string; meetingUrl?: string | null }
  ) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  requests: [],
  meetings: [],
  isLoading: false,

  fetchRequests: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<PaymentsListResponse>('/payments?limit=200');
      set({ requests: res.data, isLoading: false });
    } catch (e) {
      console.error('[NWSPayFlow] fetchRequests failed', e);
      set({ isLoading: false });
    }
  },

  createRequest: async (data) => {
    set({ isLoading: true });
    try {
      const created = await api.post<PaymentRequest>('/payments', data);
      await get().fetchRequests();
      return created;
    } finally {
      set({ isLoading: false });
    }
  },

  updateRequestStatus: async (id, status, extra) => {
    set({ isLoading: true });
    try {
      const random = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const idempotencyKey = `payment-${status.toLowerCase()}:${id}:${random}`;

      if (status === 'PAID') {
        const url = extra?.paymentProofUrl;
        if (!url) throw new Error('paymentProofUrl is required');
        await api.put(
          `/payments/${id}`,
          { status: 'PAID', paymentProofUrl: url },
          { 'Idempotency-Key': idempotencyKey }
        );
      } else {
        await api.put(
          `/payments/${id}`,
          { status, rejectionComment: extra?.rejectionComment },
          { 'Idempotency-Key': idempotencyKey }
        );
      }
      await get().fetchRequests();
    } finally {
      set({ isLoading: false });
    }
  },

  fetchMeetings: async () => {
    try {
      const meetings = await api.get<Meeting[]>('/meetings');
      set({ meetings });
    } catch {}
  },

  createMeeting: async (data: {
    title: string;
    description: string;
    scheduledAt: string;
    holderId: string;
    meetingUrl?: string;
  }) => {
    await api.post('/meetings', data);
    await get().fetchMeetings();
  },

  updateMeeting: async (id, body) => {
    await api.put(`/meetings/${id}`, body);
    await get().fetchMeetings();
  },
}));
