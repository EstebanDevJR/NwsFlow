import prisma from '@paymentflow/database';

interface ApprovalContext {
  paymentId: string;
  amount: number;
  currentApprovals: Array<{ approverId: string; status: string }>;
}

export async function getRequiredApprovals(amount: number): Promise<number> {
  const rules = await prisma.approvalRule.findMany({
    where: {
      isActive: true,
      minAmount: { lte: amount },
    },
    orderBy: { minAmount: 'desc' },
  });

  const matchingRule = rules.find(
    (r) => !r.maxAmount || amount <= r.maxAmount.toNumber()
  );

  return matchingRule?.requiredApprovals || 1;
}

export async function checkMultiLevelApproval(
  ctx: ApprovalContext,
  action: 'approve' | 'reject'
): Promise<{ canFinalize: boolean; pendingCount: number }> {
  const requiredCount = await getRequiredApprovals(ctx.amount);
  const approvals = ctx.currentApprovals;
  const effectiveRequiredCount = approvals.length > 0
    ? Math.max(1, Math.min(requiredCount, approvals.length))
    : requiredCount;
  
  const approvedCount = approvals.filter((a) => a.status === 'APPROVED').length;

  if (action === 'reject') {
    return { canFinalize: true, pendingCount: 0 };
  }

  if (approvedCount + 1 >= effectiveRequiredCount) {
    return { canFinalize: true, pendingCount: 0 };
  }

  return {
    canFinalize: false,
    pendingCount: Math.max(0, effectiveRequiredCount - approvedCount - 1),
  };
}

export async function createApprovalRequest(
  paymentId: string,
  approverId: string
) {
  return prisma.paymentApproval.create({
    data: {
      paymentRequestId: paymentId,
      approverId,
      status: 'PENDING',
    },
  });
}

export async function processApproval(
  paymentId: string,
  approverId: string,
  action: 'APPROVED' | 'REJECTED',
  comment?: string
) {
  const payment = await prisma.paymentRequest.findUnique({
    where: { id: paymentId },
    include: { approvals: true },
  });

  if (!payment) throw new Error('Payment not found');

  await prisma.paymentApproval.updateMany({
    where: { paymentRequestId: paymentId, approverId },
    data: {
      status: action,
      comment,
      updatedAt: new Date(),
    },
  });

  const { canFinalize, pendingCount } = await checkMultiLevelApproval(
    {
      paymentId,
      amount: payment.amount.toNumber(),
      currentApprovals: payment.approvals.map((a) => ({
        approverId: a.approverId,
        status: a.status,
      })),
    },
    action === 'APPROVED' ? 'approve' : 'reject'
  );

  await prisma.paymentTimeline.create({
    data: {
      paymentRequestId: paymentId,
      status: canFinalize ? action : 'PENDING',
      comment: comment || `${action} by ${approverId}`,
      changedBy: approverId,
    },
  });

  if (canFinalize) {
    const finalStatus = action === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    await prisma.paymentRequest.update({
      where: { id: paymentId },
      data: {
        status: finalStatus,
        rejectionComment: action === 'REJECTED' ? comment : null,
        approvedAt: action === 'APPROVED' ? new Date() : null,
        approvedBy: action === 'APPROVED' ? approverId : null,
      },
    });

    return { finalized: true, status: finalStatus, pendingCount };
  }

  return { finalized: false, status: 'PENDING', pendingCount };
}
