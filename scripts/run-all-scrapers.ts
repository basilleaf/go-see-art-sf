import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const SCRAPERS_DIR = path.join(__dirname, "scrapers");

const scrapers = fs
  .readdirSync(SCRAPERS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => path.join(SCRAPERS_DIR, e.name, "index.ts"))
  .filter((p) => fs.existsSync(p));

console.log(`Found ${scrapers.length} scrapers\n`);

for (const scraper of scrapers) {
  const name = path.basename(path.dirname(scraper));
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Running: ${name}`);
  console.log("=".repeat(40));
  try {
    execSync(`npx tsx --env-file=.env "${scraper}"`, {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
  } catch {
    console.error(`\nScraper "${name}" failed — continuing`);
  }
}

console.log("\nAll scrapers finished.");
