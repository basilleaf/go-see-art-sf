CREATE TABLE "exhibitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image" text,
	"image_credit" text,
	"artist" text,
	"start_date" date,
	"end_date" date,
	"museum_id" integer NOT NULL,
	"link" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "museums" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"homepage_url" text NOT NULL,
	"exhibitions_page_url" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exhibitions" ADD CONSTRAINT "exhibitions_museum_id_museums_id_fk" FOREIGN KEY ("museum_id") REFERENCES "public"."museums"("id") ON DELETE no action ON UPDATE no action;