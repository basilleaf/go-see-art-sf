-- Nested URLs: /exhibitions/{museum_slug}/{exhibition_slug}
-- 1) Drop global unique on exhibition slugs
ALTER TABLE "exhibitions" DROP CONSTRAINT IF EXISTS "exhibitions_slug_unique";
--> statement-breakpoint
-- 2) Museum slugs (nullable, then fill)
ALTER TABLE "museums" ADD COLUMN "slug" text;
--> statement-breakpoint
-- Backfill museum slug from name; disambiguate duplicates
WITH raw AS (
  SELECT
    m.id,
    nullif(
      trim(
        both '-'
        FROM
          lower(
            regexp_replace(m.name, '[^a-zA-Z0-9]+', '-', 'g')
          )
      ),
      ''
    ) AS s
  FROM
    museums m
),
mnum AS (
  SELECT
    r.id,
    case
      when r.s is not null then r.s
      else 'museum-' || r.id::text
    end as base,
    row_number() over (
      partition by case
        when r.s is not null then r.s
        else '§' || r.id::text
      end
      order by
        r.id
    ) as rn
  FROM
    raw r
)
UPDATE museums m
SET
  slug = mnum.base
  || case
    when mnum.rn = 1 then ''
    else '-' || mnum.rn::text
  end
FROM
  mnum
WHERE
  m.id = mnum.id;
--> statement-breakpoint
ALTER TABLE "museums" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "museums" ADD CONSTRAINT "museums_slug_unique" UNIQUE ("slug");
--> statement-breakpoint
-- 3) Rebuild exhibition slugs: title only, unique per museum
WITH base AS (
  SELECT
    e.id,
    e.museum_id,
    nullif(
      trim(
        both '-'
        FROM
          lower(
            regexp_replace(e.title, '[^a-zA-Z0-9]+', '-', 'g')
          )
      ),
      ''
    ) AS s
  FROM
    exhibitions e
),
en AS (
  SELECT
    b.id,
    b.museum_id,
    case
      when b.s is not null then b.s
      else 'exhibition-' || b.id::text
    end as base,
    row_number() over (
      partition by
        b.museum_id,
        case
          when b.s is not null then b.s
          else '§' || b.id::text
        end
      order by
        b.id
    ) as rn
  FROM
    base b
)
UPDATE exhibitions e
SET
  slug = en.base
  || case
    when en.rn = 1 then ''
    else '-' || en.rn::text
  end
FROM
  en
WHERE
  e.id = en.id;
--> statement-breakpoint
ALTER TABLE "exhibitions" ADD CONSTRAINT "exhibitions_museum_id_slug_unique" UNIQUE ("museum_id", "slug");
