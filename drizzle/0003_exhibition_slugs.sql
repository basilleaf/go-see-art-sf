-- Add column, backfill, then NOT NULL + unique (NOT NULL on existing rows needs backfill first)
ALTER TABLE "exhibitions" ADD COLUMN "slug" text;--> statement-breakpoint
WITH raw AS (
  SELECT
    e.id,
    nullif(
      trim(
        both '-'
        FROM
          lower(
            regexp_replace(
              e.title || ' ' || coalesce(m.name, 'museum'),
              '[^a-zA-Z0-9]+',
              '-',
              'g'
            )
          )
      ),
      ''
    ) AS s
  FROM
    exhibitions e
    INNER JOIN museums m ON m.id = e.museum_id
),
n AS (
  SELECT
    r.id,
    case
      when r.s is not null then r.s
      else 'exhibition-' || r.id::text
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
UPDATE exhibitions e
SET
  slug = n.base
  || case
    when n.rn = 1 then ''
    else '-' || n.rn::text
  end
FROM
  n
WHERE
  e.id = n.id;--> statement-breakpoint
ALTER TABLE "exhibitions" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exhibitions" ADD CONSTRAINT "exhibitions_slug_unique" UNIQUE("slug");
