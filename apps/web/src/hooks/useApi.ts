import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PaymentRequest, Meeting, PaymentsListResponse } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

function createIdempotencyKey(prefix: string, id: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${id}:${random}`;
}

export function usePayments(filters?: {
  status?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  q?: string;
}) {
  return useQuery({
    queryKey: ['payments', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.category) params.append('category', filters.category);
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.q) params.append('q', filters.q);
      return api.get<PaymentsListResponse>(`/payments?${params.toString()}`);
    },
  });
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: ['payment', id],
    queryFn: () => api.get<PaymentRequest>(`/payments/${id}`),
    enabled: !!id,
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      amount: number;
      currency: 'ROBUX' | 'COP' | 'USD';
      concept: string;
      description: string;
      category: string;
      requiredDate: string;
    }) => api.post('/payments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      rejectionComment,
      paymentProofUrl,
    }: {
      id: string;
      status: string;
      rejectionComment?: string;
      paymentProofUrl?: string;
    }) =>
      status === 'PAID'
        ? api.put(
            `/payments/${id}`,
            { status: 'PAID', paymentProofUrl },
            { 'Idempotency-Key': createIdempotencyKey('payment-paid', id) }
          )
        : api.put(
            `/payments/${id}`,
            { status, rejectionComment },
            { 'Idempotency-Key': createIdempotencyKey(`payment-${status.toLowerCase()}`, id) }
          ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

/** Estadísticas globales del sistema: solo rol HOLDER (cima de la pirámide). */
export function usePaymentStats() {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: ['paymentStats'],
    queryFn: () =>
      api.get<{
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        totalApprovedAmount: number;
        totalApprovedByCurrency: Record<string, number>;
      }>('/payments/stats'),
    enabled: role === 'HOLDER',
  });
}

export function useMeetings() {
  return useQuery({
    queryKey: ['meetings'],
    queryFn: () => api.get<Meeting[]>('/meetings'),
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; description: string; scheduledAt: string; holderId: string; meetingUrl?: string }) =>
      api.post('/meetings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<any[]>('/users'),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; email: string; password: string; role: string }) =>
      api.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.put(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useReports(filters?: {
  startDate?: string;
  endDate?: string;
  dateField?: 'created' | 'paid';
  userId?: string;
  category?: string;
  status?: string;
  page?: number;
  limit?: number;
  q?: string;
}) {
  return useQuery({
    queryKey: ['reports', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.dateField === 'paid') params.append('dateField', 'paid');
      if (filters?.userId) params.append('userId', filters.userId);
      if (filters?.category) params.append('category', filters.category);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.q) params.append('q', filters.q);
      const res = await api.get<{
        data: PaymentRequest[];
        meta: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
          aggregates?: {
            totalAmount: number;
            pendingCount: number;
            approvedAmount: number;
            amountByCurrency?: Record<string, number>;
            approvedAmountByCurrency?: Record<string, number>;
          };
          statusBreakdown?: { status: string; count: number; amountSum: number }[];
        };
      }>(`/reports?${params.toString()}`);
      return res;
    },
  });
}

export function useUploadEvidence(paymentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: FileList) => {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      return api.post(`/upload/${paymentId}`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment', paymentId] });
    },
  });
}
