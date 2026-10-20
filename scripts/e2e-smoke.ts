// `npm run test:e2e` — browser smoke test against a RUNNING app (npm run dev
// or npm start) and the seeded demo workspace (npm run seed).
//
// For each seeded persona: sign in through the real login form, open every
// screen that role's nav links to, and fail on a server error, an error
// boundary, or a console error. This is what catches a page still wired to a
// removed table/function. Set BASE_URL to test a deployed instance.
import { config } from "dotenv";
config({ path: ".env.local" });
import { chromium, type Page } from "playwright";
import { DEMO_PASSWORD, DEMO_PERSONAS } from "@/lib/seed/personas";
import { navFor } from "@/lib/nav";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;

function fail(msg: string) {
  console.error(`  FAIL  ${msg}`);
  failures++;
}

async function visit(page: Page, path: string) {
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(m.text());
  };
  page.on("console", onConsole);
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
  const status = res?.status() ?? 0;
  const body = (await page.locator("body").innerText()).slice(0, 4000);
  page.off("console", onConsole);

  if (status >= 400) return fail(`${path} -> HTTP ${status}`);
  // A nav link must land on its own page, not be bounced somewhere else (a
  // stale redirect once hid /meetings behind /live and still looked "ok").
  const landed = new URL(page.url()).pathname;
  if (landed !== path) return fail(`${path} -> redirected to ${landed}`);
  if (/Application error|Something went wrong|Unhandled Runtime Error|This page couldn.t load/i.test(body)) {
    return fail(`${path} -> error boundary: ${body.slice(0, 120).replace(/\s+/g, " ")}`);
  }
  // Failed network requests to our own API are reported by the browser as
  // console errors; ignore third-party noise (fonts, pixel).
  const own = errors.filter((e) => !/facebook|fbevents|favicon|fonts\.g/i.test(e));
  if (own.length) return fail(`${path} -> console error: ${own[0].slice(0, 160)}`);
  console.log(`  ok    ${path}`);
}

async function main() {
  const browser = await chromium.launch();
  for (const persona of DEMO_PERSONAS) {
    console.log(`\n${persona.role} (${persona.email})`);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill("#email", persona.email);
    await page.fill("#password", DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
    } catch {
      fail(`sign-in did not leave /login`);
      await ctx.close();
      continue;
    }

    const paths = [...new Set(navFor(persona.role).map((n) => n.href))];
    for (const path of paths) await visit(page, path);
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${failures} failed.`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
