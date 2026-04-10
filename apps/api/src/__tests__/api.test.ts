import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';

const integration = process.env.RUN_INTEGRATION === 'true';

describe('Public registration policy', () => {
  it('rejects registration when ALLOW_PUBLIC_REGISTRATION is not true', async () => {
    const prev = process.env.ALLOW_PUBLIC_REGISTRATION;
    process.env.ALLOW_PUBLIC_REGISTRATION = 'false';
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `policy-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Policy',
        role: 'LIDER',
      });
    process.env.ALLOW_PUBLIC_REGISTRATION = prev;
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const [payments, users, notifications] = await Promise.all([
      request(app).get('/api/payments'),
      request(app).get('/api/users'),
      request(app).get('/api/notifications'),
    ]);

    expect(payments.status).toBe(401);
    expect(users.status).toBe(401);
    expect(notifications.status).toBe(401);
  });

  it('responds on health endpoint', async () => {
    const res = await request(app).get('/api/health');
    // Health can be 200 or 503 depending on DB availability.
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('uptime');
  });

  it('exposes OpenAPI json with paths', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('openapi');
    expect(res.body).toHaveProperty('paths');
    expect(res.body.paths).toHaveProperty('/payments');
  });

  it('serves API docs UI endpoint', async () => {
    const res = await request(app).get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SwaggerUIBundle');
    expect(res.text).toContain('/api/openapi.json');
  });

  it('rejects change-password without auth', async () => {
    const res = await request(app).post('/api/auth/change-password').send({
      currentPassword: 'old',
      newPassword: 'newpass1',
    });
    expect(res.status).toBe(401);
  });

  it('rejects PATCH /auth/me without auth', async () => {
    const res = await request(app).patch('/api/auth/me').send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('rejects avatar upload without auth', async () => {
    const res = await request(app).post('/api/upload/avatar');
    expect(res.status).toBe(401);
  });

  it('rejects payment proof upload without auth', async () => {
    const res = await request(app).post('/api/upload/payment-proof/some-id');
    expect(res.status).toBe(401);
  });

  it('rejects GET /api/users without auth', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('rejects public registration for non-LIDER role', async () => {
    const prev = process.env.ALLOW_PUBLIC_REGISTRATION;
    process.env.ALLOW_PUBLIC_REGISTRATION = 'true';
    const res = await request(app).post('/api/auth/register').send({
      email: `role-${Date.now()}@example.com`,
      password: 'password123',
      name: 'Role Test',
      role: 'HOLDER',
    });
    process.env.ALLOW_PUBLIC_REGISTRATION = prev;
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!integration)('Role-based permissions', () => {
  const leaderUser = {
    email: `leader-perm-${Date.now()}@example.com`,
    password: 'password123',
    name: 'Leader Perm',
    role: 'LIDER' as const,
  };
  const holderUser = {
    email: `holder-perm-${Date.now()}@example.com`,
    password: 'password123',
    name: 'Holder Perm',
    role: 'HOLDER' as const,
  };
  const cajeroUser = {
    email: `cajero-perm-${Date.now()}@example.com`,
    password: 'password123',
    name: 'Cajero Perm',
    role: 'CAJERO' as const,
  };

  let holderToken = '';

  beforeAll(async () => {
    process.env.ALLOW_PUBLIC_REGISTRATION = 'true';
    await request(app).post('/api/auth/register').send(leaderUser);

    const holderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: process.env.TEST_HOLDER_EMAIL || 'admin@paymentflow.com', password: process.env.TEST_HOLDER_PASSWORD || 'password123' });
    holderToken = holderLogin.body.accessToken;

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ ...holderUser, role: 'HOLDER' });
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ ...cajeroUser, role: 'CAJERO' });
  });

  it('Leader can create payment request', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: leaderUser.email, password: leaderUser.password });
    const token = login.body.accessToken;

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: 100,
        concept: 'Test Payment',
        description: 'Test payment description for permission testing',
        category: 'supplies',
        paymentMethod: 'BANK',
        paymentMethodDetail: 'Integration test bank transfer detail',
        requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    expect(res.status).toBe(201);
  });

  it('Leader cannot approve payments', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: leaderUser.email, password: leaderUser.password });
    const token = login.body.accessToken;

    const res = await request(app)
      .put('/api/payments/some-payment-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'APPROVED' });
    expect([403, 404]).toContain(res.status);
  });

  it('Holder can view all payments', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: holderUser.email, password: holderUser.password });
    const token = login.body.accessToken;

    const res = await request(app)
      .get('/api/payments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('Holder can approve pending payments', async () => {
    const holderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: holderUser.email, password: holderUser.password });
    const holderToken = holderLogin.body.accessToken;

    const leaderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: leaderUser.email, password: leaderUser.password });
    const leaderToken = leaderLogin.body.accessToken;

    const createRes = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({
        amount: 200,
        concept: 'Payment for Approval',
        description: 'Payment to test approval flow',
        category: 'services',
        paymentMethod: 'BANK',
        paymentMethodDetail: 'Integration test bank transfer detail',
        requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    const paymentId = createRes.body.id;

    const approveRes = await request(app)
      .put(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ status: 'APPROVED' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');
  });

  it('Holder cannot mark payments as PAID', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: holderUser.email, password: holderUser.password });
    const token = login.body.accessToken;

    const res = await request(app)
      .put('/api/payments/some-payment-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PAID', paymentProofUrl: 'https://example.com/proof.jpg' });
    expect([403, 404]).toContain(res.status);
  });

  it('Cajero can mark approved payments as PAID', async () => {
    const cajeroLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: cajeroUser.email, password: cajeroUser.password });
    const cajeroToken = cajeroLogin.body.accessToken;

    const holderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: holderUser.email, password: holderUser.password });
    const holderToken = holderLogin.body.accessToken;

    const leaderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: leaderUser.email, password: leaderUser.password });
    const leaderToken = leaderLogin.body.accessToken;

    const createRes = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({
        amount: 300,
        concept: 'Payment for Cajero',
        description: 'Payment to test payment flow',
        category: 'expenses',
        paymentMethod: 'BANK',
        paymentMethodDetail: 'Integration test bank transfer detail',
        requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    const paymentId = createRes.body.id;

    await request(app)
      .put(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ status: 'APPROVED' });

    const paidRes = await request(app)
      .put(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ status: 'PAID', paymentProofUrl: 'https://example.com/proof.pdf' });
    expect(paidRes.status).toBe(200);
    expect(paidRes.body.status).toBe('PAID');
  });

  it('Leader can only see their own payments', async () => {
    const leaderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: leaderUser.email, password: leaderUser.password });
    const token = leaderLogin.body.accessToken;

    await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: 50,
        concept: 'Leader Private Payment',
        description: 'Private payment for leader',
        category: 'misc',
        paymentMethod: 'BANK',
        paymentMethodDetail: 'Integration test bank transfer detail',
        requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

    const res = await request(app)
      .get('/api/payments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((p: { userId: string }) => {
      expect(p.userId).toBe(leaderLogin.body.user?.id);
    });
  });
});

describe.skipIf(!integration)('Integration API (set RUN_INTEGRATION=true + DATABASE_URL)', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'password123',
    name: 'Test User',
    role: 'LIDER' as const,
  };

  let token = '';

  beforeAll(() => {
    process.env.ALLOW_PUBLIC_REGISTRATION = 'true';
  });

  it('registers a new user', async () => {
    const res = await request(app).post('/api/auth/register').send(testUser);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe(testUser.email);
  });

  it('logs in', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    token = res.body.accessToken;
  });

  it('lists payments with pagination shape', async () => {
    const res = await request(app).get('/api/payments').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('rejects unauthenticated payments list', async () => {
    const res = await request(app).get('/api/payments');
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!integration)('End-to-End Payment Flow', () => {
  const e2eLeader = {
    email: `e2e-leader-${Date.now()}@example.com`,
    password: 'password123',
    name: 'E2E Leader',
    role: 'LIDER' as const,
  };
  const e2eHolder = {
    email: `e2e-holder-${Date.now()}@example.com`,
    password: 'password123',
    name: 'E2E Holder',
    role: 'HOLDER' as const,
  };
  const e2eCajero = {
    email: `e2e-cajero-${Date.now()}@example.com`,
    password: 'password123',
    name: 'E2E Cajero',
    role: 'CAJERO' as const,
  };

  beforeAll(async () => {
    process.env.ALLOW_PUBLIC_REGISTRATION = 'true';
    await request(app).post('/api/auth/register').send(e2eLeader);

    const holderLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: process.env.TEST_HOLDER_EMAIL || 'admin@paymentflow.com',
        password: process.env.TEST_HOLDER_PASSWORD || 'password123',
      });
    const bootstrapHolderToken = holderLogin.body.accessToken;
    expect(bootstrapHolderToken).toBeTruthy();

    const createHolder = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${bootstrapHolderToken}`)
      .send({ ...e2eHolder, role: 'HOLDER' });
    expect([201, 400]).toContain(createHolder.status);

    const createCajero = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${bootstrapHolderToken}`)
      .send({ ...e2eCajero, role: 'CAJERO' });
    expect([201, 400]).toContain(createCajero.status);
  });

  it('Complete flow: create → approve → pay → verify timeline', async () => {
    const leaderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: e2eLeader.email, password: e2eLeader.password });
    const leaderToken = leaderLogin.body.accessToken;
    const leaderId = leaderLogin.body.user.id;

    const holderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: e2eHolder.email, password: e2eHolder.password });
    const holderToken = holderLogin.body.accessToken;
    const holderId = holderLogin.body.user.id;

    const cajeroLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: e2eCajero.email, password: e2eCajero.password });
    const cajeroToken = cajeroLogin.body.accessToken;

    const createRes = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({
        amount: 500,
        concept: 'E2E Test Payment',
        description: 'Full end-to-end test payment flow',
        category: 'services',
        paymentMethod: 'BANK',
        paymentMethodDetail: 'Integration test bank transfer detail',
        requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    expect(createRes.status).toBe(201);
    const paymentId = createRes.body.id;
    expect(createRes.body.status).toBe('PENDING');
    expect(createRes.body.approvedAt).toBeNull();
    expect(createRes.body.paidAt).toBeNull();

    const approveRes = await request(app)
      .put(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ status: 'APPROVED' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');
    expect(approveRes.body.approvedBy).toBe(holderId);
    expect(approveRes.body.approvedAt).not.toBeNull();

    const payRes = await request(app)
      .put(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ status: 'PAID', paymentProofUrl: 'https://example.com/e2e-proof.pdf' });
    expect(payRes.status).toBe(200);
    expect(payRes.body.status).toBe('PAID');
    expect(payRes.body.paidAt).not.toBeNull();
    expect(payRes.body.paidBy).not.toBeNull();

    const getRes = await request(app)
      .get(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${holderToken}`);
    expect(getRes.body.timeline).toBeDefined();
    expect(Array.isArray(getRes.body.timeline)).toBe(true);
  });

  it('Rejection flow: leader creates, holder rejects with comment', async () => {
    const leaderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: e2eLeader.email, password: e2eLeader.password });
    const leaderToken = leaderLogin.body.accessToken;

    const holderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: e2eHolder.email, password: e2eHolder.password });
    const holderToken = holderLogin.body.accessToken;

    const createRes = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({
        amount: 150,
        concept: 'Payment to Reject',
        description: 'This should be rejected for testing',
        category: 'misc',
        paymentMethod: 'BANK',
        paymentMethodDetail: 'Integration test bank transfer detail',
        requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    const paymentId = createRes.body.id;

    const rejectRes = await request(app)
      .put(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ status: 'REJECTED', rejectionComment: 'Budget constraints' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('REJECTED');
    expect(rejectRes.body.rejectionComment).toBe('Budget constraints');
  });
});
