import prisma from '@paymentflow/database';

export async function getExecutiveDashboard() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalRequests,
    pendingRequests,
    approvedRequests,
    rejectedRequests,
    paidRequests,
    monthlyStats,
    categoryStats,
    leaderSpending,
    avgApprovalTime,
  ] = await Promise.all([
    prisma.paymentRequest.count(),
    prisma.paymentRequest.count({ where: { status: 'PENDING' } }),
    prisma.paymentRequest.count({ where: { status: 'APPROVED' } }),
    prisma.paymentRequest.count({ where: { status: 'REJECTED' } }),
    prisma.paymentRequest.count({ where: { status: 'PAID' } }),
    prisma.paymentRequest.groupBy({
      by: ['status'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.paymentRequest.groupBy({
      by: ['category'],
      where: { status: { in: ['APPROVED', 'PAID'] } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.paymentRequest.groupBy({
      by: ['userId'],
      where: { status: { in: ['APPROVED', 'PAID'] }, createdAt: { gte: thirtyDaysAgo } },
      _count: true,
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    }),
    prisma.paymentRequest.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED'] }, approvedAt: { not: null } },
      select: { createdAt: true, approvedAt: true },
      take: 1000,
    }),
  ]);

  const approvalTimes = avgApprovalTime
    .filter((p) => p.approvedAt)
    .map((p) => p.approvedAt!.getTime() - p.createdAt.getTime());
  const avgApprovalMs = approvalTimes.length > 0
    ? approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length
    : 0;

  const topLeaders = await prisma.user.findMany({
    where: { id: { in: leaderSpending.map((l) => l.userId) } },
    select: { id: true, name: true },
  });

  const pendingAging = await prisma.paymentRequest.findMany({
    where: { status: 'PENDING' },
    select: { createdAt: true },
  });

  const aging = {
    lessThan24h: pendingAging.filter((p) => now.getTime() - p.createdAt.getTime() < 24 * 60 * 60 * 1000).length,
    lessThan48h: pendingAging.filter((p) => {
      const diff = now.getTime() - p.createdAt.getTime();
      return diff >= 24 * 60 * 60 * 1000 && diff < 48 * 60 * 60 * 1000;
    }).length,
    lessThan72h: pendingAging.filter((p) => {
      const diff = now.getTime() - p.createdAt.getTime();
      return diff >= 48 * 60 * 60 * 1000 && diff < 72 * 60 * 60 * 1000;
    }).length,
    moreThan72h: pendingAging.filter((p) => now.getTime() - p.createdAt.getTime() >= 72 * 60 * 60 * 1000).length,
  };

  const rejectionByCategory = await prisma.paymentRequest.groupBy({
    by: ['category'],
    where: { status: 'REJECTED', createdAt: { gte: thirtyDaysAgo } },
    _count: true,
  });

  return {
    overview: {
      totalRequests,
      pending: pendingRequests,
      approved: approvedRequests,
      rejected: rejectedRequests,
      paid: paidRequests,
      rejectionRate: totalRequests > 0 ? (rejectedRequests / totalRequests * 100).toFixed(1) : '0',
    },
    monthly: monthlyStats.map((s) => ({
      status: s.status,
      count: s._count,
      amount: s._sum.amount?.toNumber() || 0,
    })),
    byCategory: categoryStats.map((c) => ({
      category: c.category,
      count: c._count,
      amount: c._sum.amount?.toNumber() || 0,
    })),
    topLeaders: leaderSpending.map((l) => ({
      id: l.userId,
      name: topLeaders.find((u) => u.id === l.userId)?.name || 'Unknown',
      count: l._count,
      amount: l._sum.amount?.toNumber() || 0,
    })),
    avgApprovalTimeHours: (avgApprovalMs / (1000 * 60 * 60)).toFixed(1),
    aging,
    rejectionByCategory: rejectionByCategory.map((r) => ({
      category: r.category,
      count: r._count,
    })),
  };
}