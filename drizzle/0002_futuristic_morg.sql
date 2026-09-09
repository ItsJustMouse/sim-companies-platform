ALTER TABLE "market_snapshots" ALTER COLUMN "total_quantity" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "market_snapshots" ALTER COLUMN "total_quantity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "market_snapshots" ALTER COLUMN "offer_count" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "market_snapshots" ALTER COLUMN "offer_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD COLUMN "source" varchar(16) DEFAULT 'order-book' NOT NULL;