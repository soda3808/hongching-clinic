// eCTCM Auto-Scraper — fetches today's patient list from os.ectcm.com
// POST /api/scrape?action=fetch-today
// Requires env vars: ECTCM_USERNAME, ECTCM_PASSWORD

export const config = { maxDuration: 60, memory: 1024 };

import { setCORS, handleOptions, requireAuth, errorResponse } from './_middleware.js';

let chromium, puppeteer;

async function getBrowser() {
  // Dynamic imports for serverless compatibility
  if (!chromium) chromium = (await import('@sparticuz/chromium')).default;
  if (!puppeteer) puppeteer = (await import('puppeteer-core')).default;

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 900 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

// ── Classify treatment type from service string ──
function classifyTreatment(service) {
  const s = service || '';
  const hasAcu = /針灸|拔罐|刮痧|艾灸|推拿|天灸/.test(s);
  const hasHerbal = /中藥|配藥|處方/.test(s);
  if (hasAcu && hasHerbal) return 'both';
  if (hasHerbal) return 'herbal';
  return 'acupuncture';
}

// ── Main scraper ──
async function scrapeECTCM(date) {
  const username = process.env.ECTCM_USERNAME;
  const password = process.env.ECTCM_PASSWORD;
  if (!username || !password) throw new Error('eCTCM credentials not configured');

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // 1. Navigate to login page
    await page.goto('https://os.ectcm.com/Login', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });

    // 2. Find and fill login form
    // Try common input patterns
    const usernameSelectors = ['input[name="username"]', 'input[name="userName"]', 'input[name="account"]', 'input[name="loginId"]', 'input[type="text"]:not([type="password"])'];
    let usernameInput = null;
    for (const sel of usernameSelectors) {
      usernameInput = await page.$(sel);
      if (usernameInput) break;
    }
    // Fallback: first text-like input
    if (!usernameInput) {
      usernameInput = await page.$('input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="checkbox"])');
    }

    if (!usernameInput) throw new Error('Cannot find username input');

    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(username, { delay: 50 });

    const passwordInput = await page.$('input[type="password"]');
    if (!passwordInput) throw new Error('Cannot find password input');
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    // 3. Submit login
    const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button.login', '.btn-login', '#loginBtn', 'button:has-text("登入")', 'button'];
    let submitted = false;
    for (const sel of submitSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          const text = await page.evaluate(el => el.textContent || el.value || '', btn);
          if (text.includes('登') || text.includes('Login') || text.includes('login') || sel === 'button[type="submit"]' || sel === 'input[type="submit"]') {
            await btn.click();
            submitted = true;
            break;
          }
        }
      } catch {}
    }

    if (!submitted) {
      // Fallback: press Enter
      await passwordInput.press('Enter');
    }

    // 4. Wait for navigation after login
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000)); // Extra wait for SPA routing

    // Check if login succeeded
    const currentUrl = page.url();
    if (currentUrl.includes('/Login') || currentUrl.includes('/login')) {
      throw new Error('Login failed — check credentials');
    }

    // 5. Navigate to dispensary/billing page (配藥/收費)
    // Try common URL patterns for eCTCM
    const dispensaryUrls = [
      'https://os.ectcm.com/Dispensary',
      'https://os.ectcm.com/Dispensary/List',
      'https://os.ectcm.com/dispensary',
      'https://os.ectcm.com/Billing',
    ];

    let navigated = false;
    for (const url of dispensaryUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
        const hasTable = await page.$('table');
        if (hasTable) { navigated = true; break; }
      } catch {}
    }

    // Fallback: try clicking the menu
    if (!navigated) {
      try {
        const menuLinks = await page.$$('a, .nav-link, .menu-item');
        for (const link of menuLinks) {
          const text = await page.evaluate(el => el.textContent || '', link);
          if (text.includes('配藥') || text.includes('收費')) {
            await link.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 2000));
            navigated = true;
            break;
          }
        }
      } catch {}
    }

    // 6. Set date filter to target date
    if (date) {
      try {
        const dateInput = await page.$('input[type="date"]');
        if (dateInput) {
          await dateInput.click({ clickCount: 3 });
          await dateInput.type(date);
          // Click search/refresh button
          const searchBtn = await page.$('button:has-text("搜"), button:has-text("刷新"), button:has-text("查"), .btn-search, .btn-refresh');
          if (searchBtn) await searchBtn.click();
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch {}
    }

    // 7. Click "當天記錄" button if available
    try {
      const buttons = await page.$$('button, a, .btn');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent || '', btn);
        if (text.includes('當天記錄') || text.includes('當天')) {
          await btn.click();
          await new Promise(r => setTimeout(r, 2000));
          break;
        }
      }
    } catch {}

    // 8. Scrape the patient table
    await page.waitForSelector('table', { timeout: 10000 });

    const patients = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const results = [];

      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr, tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 9) continue;

          const vals = Array.from(cells).map(c => (c.textContent || '').trim());

          // Skip header-like rows
          if (vals[0]?.includes('診所') || vals[4]?.includes('顧客姓名')) continue;

          // Match the known eCTCM column structure:
          // 0:診所 1:掛號日期 2:排號 3:顧客編號 4:顧客姓名 5:性別 6:年齡 7:診治醫師 8:服務
          const patientName = vals[4] || '';
          if (!patientName || patientName === '-') continue;

          results.push({
            store: vals[0] || '',
            date: vals[1] || '',
            queueNo: vals[2] || '',
            customerCode: vals[3] || '',
            patientName,
            gender: vals[5] || '',
            age: vals[6] || '',
            doctor: vals[7] || '',
            service: vals[8] || '',
          });
        }
      }
      return results;
    });

    await browser.close();

    // 9. Classify treatment types
    return patients.map(p => ({
      ...p,
      treatmentType: classifyTreatment(p.service),
    }));

  } catch (err) {
    await browser.close();
    throw err;
  }
}

// ── Main Router ──
export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);

  const action = req.query?.action || req.body?._action || '';
  const date = req.body?.date || new Date().toISOString().substring(0, 10);

  if (action !== 'fetch-today') {
    return errorResponse(res, 400, `Unknown scrape action: ${action}`);
  }

  try {
    const patients = await scrapeECTCM(date);
    return res.status(200).json({
      success: true,
      date,
      count: patients.length,
      patients,
    });
  } catch (err) {
    console.error('eCTCM scrape error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Scraping failed',
    });
  }
}
