-- AlterTable
ALTER TABLE "channel_members" ADD COLUMN     "last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_read_message_id" TEXT;

-- AlterTable
ALTER TABLE "chat_conversations" ADD COLUMN     "user_one_last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_one_last_read_msg_id" TEXT,
ADD COLUMN     "user_two_last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_two_last_read_msg_id" TEXT;
