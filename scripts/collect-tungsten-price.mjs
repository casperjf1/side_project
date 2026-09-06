import { chromium } from "playwright";
import { google } from "googleapis";

const url = "https://www.metal.com/tungsten";
const sheetId = process.env.GOOGLE_SHEET_ID;
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
if (!sheetId || !credentials.client_email || !credentials.private_key) throw new Error("Missing Google Sheets configuration");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  const data = await page.waitForFunction(() => {
    const name = [...document.querySelectorAll("div")].find((e) => e.textContent?.trim() === "Tungsten / 1# Tungsten bar");
    const text = name?.parentElement?.parentElement?.textContent?.replace(/\s+/g, " ").trim() || "";
    const price = text.match(/(\d+(?:\.\d+)?)\s*USD\/kg/);
    const change = text.match(/USD\/kg\s*([+-]?\d+(?:\.\d+)?)\s*([+-]?\d+(?:\.\d+)?)%/);
    if (!price) return null;
    return { price: Number(price[1]), change: change ? Number(change[1]) : null, changePercent: change ? Number(change[2]) : null };
  }, { timeout: 20000 }).then((h) => h.jsonValue());
  if (!Number.isFinite(data.price) || data.price <= 0) throw new Error(`Invalid price: ${JSON.stringify(data)}`);
  const now = new Date();
  const auth = new google.auth.JWT(credentials.client_email, null, credentials.private_key, ["https://www.googleapis.com/auth/spreadsheets"]);
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({ spreadsheetId: sheetId, range: "Sheet1!A:F", valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [[now.toISOString(), data.price, data.change, data.changePercent, now.toISOString().slice(0, 10), url]] }});
  console.log(JSON.stringify({ ...data, timestamp: now.toISOString() }));
} finally { await browser.close(); }
