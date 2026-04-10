import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  base: {
    service: 'nwspayflow-api',
    env: process.env.NODE_ENV || 'development',
  },
  redact: {
    paths: ['req.headers.authorization', 'authorization', 'password', 'refreshToken', 'token'],
    remove: true,
  },
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
});

export function requestLogger(req: any, res: any, next: any) {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  req.requestId = requestId;

  logger.info(
    {
      requestId,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userId: req.user?.userId,
    },
    'request_start'
  );

  res.on('finish', () => {
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        userId: req.user?.userId,
      },
      'request_end'
    );
  });

  next();
}
