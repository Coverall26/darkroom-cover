-- AlterTable: Rename hasFundroomAccess to hasFundRoomAccess for consistent casing
ALTER TABLE "UserTeam" RENAME COLUMN "hasFundroomAccess" TO "hasFundRoomAccess";
