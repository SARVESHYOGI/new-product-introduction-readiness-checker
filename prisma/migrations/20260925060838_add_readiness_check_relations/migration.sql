-- AddForeignKey
ALTER TABLE "ReadinessCheck" ADD CONSTRAINT "ReadinessCheck_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "BOMVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessCheck" ADD CONSTRAINT "ReadinessCheck_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "Routing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessCheck" ADD CONSTRAINT "ReadinessCheck_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
