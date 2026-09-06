CREATE TABLE "alert_events" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"alert_id" varchar(32) NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"observed_value" double precision,
	"message" text NOT NULL,
	"delivery_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"delivery_detail" text
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"realm_id" smallint DEFAULT 0 NOT NULL,
	"resource_id" integer NOT NULL,
	"quality" smallint DEFAULT 0 NOT NULL,
	"condition" varchar(32) NOT NULL,
	"threshold" double precision NOT NULL,
	"window_hours" integer,
	"channel" varchar(16) DEFAULT 'email' NOT NULL,
	"destination" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"cooldown_seconds" integer DEFAULT 21600 NOT NULL,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"realm_id" smallint NOT NULL,
	"kind" varchar(120) NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"image" text,
	"category" text,
	"cost" double precision,
	"cost_unit" text,
	"wages_per_hour_per_level" double precision,
	"seconds_to_build" integer,
	"robots_needed" double precision,
	"is_retail" boolean DEFAULT false NOT NULL,
	"production" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buildings_realm_id_kind_pk" PRIMARY KEY("realm_id","kind")
);
--> statement-breakpoint
CREATE TABLE "company_snapshots" (
	"linked_company_id" varchar(32) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"level" double precision,
	"value" double precision,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "company_snapshots_linked_company_id_observed_at_pk" PRIMARY KEY("linked_company_id","observed_at")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"job" varchar(64) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linked_companies" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"realm_id" smallint NOT NULL,
	"company_name" text NOT NULL,
	"company_ref" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "market_candles" (
	"realm_id" smallint NOT NULL,
	"resource_id" integer NOT NULL,
	"quality" smallint NOT NULL,
	"interval" varchar(4) NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"average" double precision NOT NULL,
	"average_quantity" double precision,
	"sample_count" integer NOT NULL,
	CONSTRAINT "market_candles_realm_id_resource_id_quality_interval_bucket_start_pk" PRIMARY KEY("realm_id","resource_id","quality","interval","bucket_start")
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"realm_id" smallint NOT NULL,
	"resource_id" integer NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"lowest_price" double precision,
	"highest_price" double precision,
	"median_price" double precision,
	"weighted_average_price" double precision,
	"total_quantity" double precision DEFAULT 0 NOT NULL,
	"offer_count" integer DEFAULT 0 NOT NULL,
	"prices_by_quality" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "market_snapshots_realm_id_resource_id_observed_at_pk" PRIMARY KEY("realm_id","resource_id","observed_at")
);
--> statement-breakpoint
CREATE TABLE "metric_counters" (
	"metric" varchar(96) NOT NULL,
	"day" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "metric_counters_metric_day_pk" PRIMARY KEY("metric","day")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"realm_id" smallint NOT NULL,
	"output_resource_id" integer NOT NULL,
	"inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"produced_in" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_realm_id_output_resource_id_pk" PRIMARY KEY("realm_id","output_resource_id")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"realm_id" smallint NOT NULL,
	"resource_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"image" text,
	"transport_units" double precision,
	"base_units_per_hour" double precision,
	"retailable" boolean,
	"is_research" boolean,
	"category" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_realm_id_resource_id_pk" PRIMARY KEY("realm_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"client_hint" varchar(80)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"watchlist_id" varchar(32) NOT NULL,
	"resource_id" integer NOT NULL,
	"target_price" double precision,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_items_watchlist_id_resource_id_pk" PRIMARY KEY("watchlist_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"realm_id" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_snapshots" ADD CONSTRAINT "company_snapshots_linked_company_id_linked_companies_id_fk" FOREIGN KEY ("linked_company_id") REFERENCES "public"."linked_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_companies" ADD CONSTRAINT "linked_companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_events_alert_idx" ON "alert_events" USING btree ("alert_id","fired_at");--> statement-breakpoint
CREATE INDEX "alerts_user_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alerts_scan_idx" ON "alerts" USING btree ("enabled","realm_id","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_realm_slug_idx" ON "buildings" USING btree ("realm_id","slug");--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "linked_companies_user_idx" ON "linked_companies" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_companies_unique_idx" ON "linked_companies" USING btree ("user_id","realm_id","company_name");--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "login_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "login_tokens_expiry_idx" ON "login_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "market_candles_range_idx" ON "market_candles" USING btree ("interval","bucket_start");--> statement-breakpoint
CREATE INDEX "market_snapshots_observed_idx" ON "market_snapshots" USING btree ("observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_realm_slug_idx" ON "resources" USING btree ("realm_id","slug");--> statement-breakpoint
CREATE INDEX "resources_name_idx" ON "resources" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "watchlists_user_idx" ON "watchlists" USING btree ("user_id");