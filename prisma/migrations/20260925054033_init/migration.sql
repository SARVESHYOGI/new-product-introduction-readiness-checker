-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BOMStatus" AS ENUM ('DRAFT', 'ACTIVE', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "RoutingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "StationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "LineStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "WorkInstructionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "OperatorStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IdentifierRangeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MappingType" AS ENUM ('OUTPUT');

-- CreateEnum
CREATE TYPE "ReadinessCheckStatus" AS ENUM ('READY', 'NOT_READY', 'BLOCKED', 'ERROR');

-- CreateEnum
CREATE TYPE "ReadinessResultStatus" AS ENUM ('PASS', 'WARNING', 'FAIL');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ENGINEER', 'VIEWER');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOMVersion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "BOMStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BOMVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOMItem" (
    "id" TEXT NOT NULL,
    "bomVersionId" TEXT NOT NULL,
    "componentSku" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BOMItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "RoutingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingOperation" (
    "id" TEXT NOT NULL,
    "routingId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "operationCode" TEXT NOT NULL,
    "operationName" TEXT NOT NULL,
    "standardCycleTimeSeconds" INTEGER,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "stationId" TEXT,

    CONSTRAINT "RoutingOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Line" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "LineStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lineId" TEXT,
    "capabilities" TEXT[],

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkInstruction" (
    "id" TEXT NOT NULL,
    "routingOperationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "WorkInstructionStatus" NOT NULL DEFAULT 'DRAFT',
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OperatorStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorStationAssignment" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "OperatorStationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentifierRange" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "startNumber" INTEGER NOT NULL,
    "endNumber" INTEGER NOT NULL,
    "currentNumber" INTEGER NOT NULL,
    "status" "IdentifierRangeStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "IdentifierRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInventoryMapping" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "mappingType" "MappingType" NOT NULL DEFAULT 'OUTPUT',
    "status" "InventoryStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "ProductInventoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessCheck" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "bomVersionId" TEXT NOT NULL,
    "routingId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "status" "ReadinessCheckStatus" NOT NULL,
    "score" INTEGER NOT NULL,
    "passedCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "blockingCount" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadinessCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessResult" (
    "id" TEXT NOT NULL,
    "readinessCheckId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "ReadinessResultStatus" NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "affectedEntityType" TEXT,
    "affectedEntityId" TEXT,
    "causeRuleCode" TEXT,
    "remediation" TEXT,
    "isBlocking" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_updatedAt_idx" ON "Product"("updatedAt");

-- CreateIndex
CREATE INDEX "BOMVersion_productId_status_idx" ON "BOMVersion"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BOMVersion_productId_version_key" ON "BOMVersion"("productId", "version");

-- CreateIndex
CREATE INDEX "BOMItem_bomVersionId_idx" ON "BOMItem"("bomVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "BOMItem_bomVersionId_componentSku_key" ON "BOMItem"("bomVersionId", "componentSku");

-- CreateIndex
CREATE INDEX "Routing_productId_status_idx" ON "Routing"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Routing_productId_code_key" ON "Routing"("productId", "code");

-- CreateIndex
CREATE INDEX "RoutingOperation_routingId_idx" ON "RoutingOperation"("routingId");

-- CreateIndex
CREATE INDEX "RoutingOperation_stationId_idx" ON "RoutingOperation"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingOperation_routingId_sequence_key" ON "RoutingOperation"("routingId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Line_code_key" ON "Line"("code");

-- CreateIndex
CREATE INDEX "Line_status_idx" ON "Line"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- CreateIndex
CREATE INDEX "Station_lineId_status_idx" ON "Station"("lineId", "status");

-- CreateIndex
CREATE INDEX "WorkInstruction_routingOperationId_status_idx" ON "WorkInstruction"("routingOperationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkInstruction_routingOperationId_version_key" ON "WorkInstruction"("routingOperationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_employeeCode_key" ON "Operator"("employeeCode");

-- CreateIndex
CREATE INDEX "Operator_status_idx" ON "Operator"("status");

-- CreateIndex
CREATE INDEX "OperatorStationAssignment_stationId_status_idx" ON "OperatorStationAssignment"("stationId", "status");

-- CreateIndex
CREATE INDEX "OperatorStationAssignment_operatorId_status_idx" ON "OperatorStationAssignment"("operatorId", "status");

-- CreateIndex
CREATE INDEX "OperatorStationAssignment_validFrom_validTo_idx" ON "OperatorStationAssignment"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "IdentifierRange_productId_status_idx" ON "IdentifierRange"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IdentifierRange_productId_prefix_key" ON "IdentifierRange"("productId", "prefix");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE INDEX "InventoryItem_status_idx" ON "InventoryItem"("status");

-- CreateIndex
CREATE INDEX "ProductInventoryMapping_inventoryItemId_idx" ON "ProductInventoryMapping"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductInventoryMapping_productId_mappingType_key" ON "ProductInventoryMapping"("productId", "mappingType");

-- CreateIndex
CREATE INDEX "ReadinessCheck_productId_createdAt_idx" ON "ReadinessCheck"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ReadinessCheck_status_idx" ON "ReadinessCheck"("status");

-- CreateIndex
CREATE INDEX "ReadinessCheck_createdAt_idx" ON "ReadinessCheck"("createdAt");

-- CreateIndex
CREATE INDEX "ReadinessResult_readinessCheckId_idx" ON "ReadinessResult"("readinessCheckId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "BOMVersion" ADD CONSTRAINT "BOMVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOMItem" ADD CONSTRAINT "BOMItem_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "BOMVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routing" ADD CONSTRAINT "Routing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingOperation" ADD CONSTRAINT "RoutingOperation_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "Routing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingOperation" ADD CONSTRAINT "RoutingOperation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkInstruction" ADD CONSTRAINT "WorkInstruction_routingOperationId_fkey" FOREIGN KEY ("routingOperationId") REFERENCES "RoutingOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorStationAssignment" ADD CONSTRAINT "OperatorStationAssignment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorStationAssignment" ADD CONSTRAINT "OperatorStationAssignment_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentifierRange" ADD CONSTRAINT "IdentifierRange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryMapping" ADD CONSTRAINT "ProductInventoryMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventoryMapping" ADD CONSTRAINT "ProductInventoryMapping_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessCheck" ADD CONSTRAINT "ReadinessCheck_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessResult" ADD CONSTRAINT "ReadinessResult_readinessCheckId_fkey" FOREIGN KEY ("readinessCheckId") REFERENCES "ReadinessCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
