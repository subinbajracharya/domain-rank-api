-- CreateTable
CREATE TABLE "Ranking" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ranking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ranking_domain_idx" ON "Ranking"("domain");

-- CreateIndex
CREATE INDEX "Ranking_date_idx" ON "Ranking"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Ranking_domain_date_key" ON "Ranking"("domain", "date");
