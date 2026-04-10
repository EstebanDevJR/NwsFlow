-- Complete initial schema migration
-- This migration creates all base tables

-- Users table
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'LIDER',
    "avatar" TEXT,
    "telegramId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "inAppNotifications" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_email_key" UNIQUE ("email"),
    CONSTRAINT "User_telegramId_key" UNIQUE ("telegramId")
);

-- Payment requests table
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "concept" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "requiredDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionComment" TEXT,
    "paymentProofUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "paidBy" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Evidence table
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentRequestId" TEXT NOT NULL,
    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Evidence_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Meeting table
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "meetingUrl" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leaderId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Meeting_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Meeting_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Audit log table
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "paymentRequestId" TEXT,
    "meetingId" TEXT,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Notification table
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Refresh token table
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefreshToken_token_key" UNIQUE ("token"),
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Payment timeline table
CREATE TABLE "PaymentTimeline" (
    "id" TEXT NOT NULL,
    "paymentRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    CONSTRAINT "PaymentTimeline_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentTimeline_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Budget table
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "leaderId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "thresholds" INTEGER[] DEFAULT ARRAY[70,90,100],
    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- Budget alert table
CREATE TABLE "BudgetAlert" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BudgetAlert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Approval rule table
CREATE TABLE "ApprovalRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minAmount" DECIMAL(12,2) NOT NULL,
    "maxAmount" DECIMAL(12,2),
    "requiredApprovals" INTEGER NOT NULL DEFAULT 1,
    "approverRoles" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- Payment approval table
CREATE TABLE "PaymentApproval" (
    "id" TEXT NOT NULL,
    "paymentRequestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentApproval_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentApproval_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- SLA rule table
CREATE TABLE "SlaRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "maxHours" INTEGER NOT NULL,
    "escalationRole" TEXT,
    "notifyTemplate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SlaRule_pkey" PRIMARY KEY ("id")
);

-- Create indexes for performance
CREATE INDEX "PaymentRequest_userId_idx" ON "PaymentRequest"("userId");
CREATE INDEX "PaymentRequest_status_idx" ON "PaymentRequest"("status");
CREATE INDEX "PaymentRequest_category_idx" ON "PaymentRequest"("category");
CREATE INDEX "PaymentRequest_createdAt_idx" ON "PaymentRequest"("createdAt");
CREATE INDEX "Evidence_paymentRequestId_idx" ON "Evidence"("paymentRequestId");
CREATE INDEX "Meeting_leaderId_idx" ON "Meeting"("leaderId");
CREATE INDEX "Meeting_holderId_idx" ON "Meeting"("holderId");
CREATE INDEX "Meeting_scheduledAt_idx" ON "Meeting"("scheduledAt");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_paymentRequestId_idx" ON "AuditLog"("paymentRequestId");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_read_idx" ON "Notification"("read");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "PaymentTimeline_paymentRequestId_idx" ON "PaymentTimeline"("paymentRequestId");
CREATE INDEX "Budget_leaderId_idx" ON "Budget"("leaderId");
CREATE INDEX "Budget_category_idx" ON "Budget"("category");
CREATE INDEX "BudgetAlert_budgetId_idx" ON "BudgetAlert"("budgetId");
CREATE INDEX "ApprovalRule_minAmount_idx" ON "ApprovalRule"("minAmount");
CREATE INDEX "PaymentApproval_paymentRequestId_idx" ON "PaymentApproval"("paymentRequestId");
CREATE INDEX "PaymentApproval_approverId_idx" ON "PaymentApproval"("approverId");
CREATE INDEX "SlaRule_status_idx" ON "SlaRule"("status");