// Regenerates the README screenshots. Requires the dev server running on :5183
// (`npm run dev -- --port 5183`) and `playwright` installed. Run with:
//   node scripts/screenshot.cjs
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'screenshots');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  // --- Hero shot: Demo tab, pangram, wiggle on, tight crop on just the black canvas ---
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 500 }, deviceScaleFactor: 2 });
    await page.goto('http://localhost:5183/', { waitUntil: 'networkidle' });
    await page.fill('input[placeholder*="type any word"]', 'sinefont');
    await page.waitForTimeout(1100);
    const box = await page.$eval('svg', (svg) => {
      const containerR = svg.closest('div').getBoundingClientRect();
      const pathR = svg.querySelector('path').getBoundingClientRect();
      const pad = 36;
      return {
        x: containerR.x,
        y: containerR.y,
        width: Math.min(containerR.width, pathR.x + pathR.width - containerR.x + pad),
        height: containerR.height,
      };
    });
    await page.screenshot({
      path: path.join(OUT, 'demo-hero.png'),
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });
    await page.close();
  }

  // --- Editor shot: Glyph Editor tab on a loop letter, showing draw canvas + result ---
  {
    const page = await browser.newPage({ viewport: { width: 1300, height: 950 }, deviceScaleFactor: 2 });
    await page.goto('http://localhost:5183/', { waitUntil: 'networkidle' });
    await page.click('button:has-text("Glyph Editor")');
    await page.click('button:text-is("g")');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'editor.png'), clip: { x: 0, y: 0, width: 1300, height: 950 } });
    await page.close();
  }

  await browser.close();
  console.log('done');
})();
