ALTER TYPE "public"."admin_role" ADD VALUE 'manager';--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "branch_id" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "role_snapshot" text;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "branch_id_snapshot" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_users_branch_idx" ON "admin_users" USING btree ("branch_id");