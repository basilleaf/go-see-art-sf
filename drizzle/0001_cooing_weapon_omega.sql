ALTER TABLE "exhibitions" ADD CONSTRAINT "exhibitions_link_unique" UNIQUE("link");--> statement-breakpoint
ALTER TABLE "museums" ADD CONSTRAINT "museums_homepage_url_unique" UNIQUE("homepage_url");