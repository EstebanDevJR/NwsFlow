import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { idempotencyMiddleware } from '../middleware/idempotency.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = {
    userId: 'test-user',
    email: 'test@example.com',
    role: 'HOLDER',
  };
  next();
});

let counter = 0;
app.put('/critical', idempotencyMiddleware({ required: true, ttlSeconds: 60 }), (req, res) => {
  counter += 1;
  res.json({
    counter,
    value: req.body?.value ?? null,
  });
});

describe('Idempotency middleware', () => {
  beforeEach(() => {
    counter = 0;
  });

  it('replays the same response for repeated requests with same key and payload', async () => {
    const key = 'same-request-key';

    const first = await request(app)
      .put('/critical')
      .set('Idempotency-Key', key)
      .send({ value: 'A' });
    expect(first.status).toBe(200);
    expect(first.body.counter).toBe(1);

    const second = await request(app)
      .put('/critical')
      .set('Idempotency-Key', key)
      .send({ value: 'A' });
    expect(second.status).toBe(200);
    expect(second.body.counter).toBe(1);
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(counter).toBe(1);
  });

  it('rejects reuse of same key with different payload', async () => {
    const key = 'same-key-different-body';

    const first = await request(app)
      .put('/critical')
      .set('Idempotency-Key', key)
      .send({ value: 'A' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .put('/critical')
      .set('Idempotency-Key', key)
      .send({ value: 'B' });
    expect(second.status).toBe(409);
    expect(second.body.error).toContain('different payload');
    expect(counter).toBe(1);
  });

  it('requires key when configured as required', async () => {
    const res = await request(app)
      .put('/critical')
      .send({ value: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Idempotency-Key');
  });
});
