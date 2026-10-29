-- AlterTable
ALTER TABLE "FoodEntry" ADD COLUMN     "barcode" TEXT;

-- AlterTable
ALTER TABLE "RoutineExercise" ADD COLUMN     "supersetGroup" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoAdjustTargets" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "targetsAdjustedAt" TEXT;

-- AlterTable
ALTER TABLE "WorkoutExercise" ADD COLUMN     "supersetGroup" INTEGER;

-- CreateIndex
CREATE INDEX "FoodEntry_userId_barcode_idx" ON "FoodEntry"("userId", "barcode");
