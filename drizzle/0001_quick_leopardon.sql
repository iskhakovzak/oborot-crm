ALTER TABLE "deal_items" ALTER COLUMN "vat_rate" SET DEFAULT 12;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "vat_rate" SET DEFAULT 12;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "oked" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "reg_number" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "mfo" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "kpp";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "ogrn";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "okved";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "bik";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "corr_account";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "vk";