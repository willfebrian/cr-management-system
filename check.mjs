import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Users\\Lenovo\\.cache\\puppeteer\\chrome\\win64-149.0.7827.22\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  
  let hasError = false;
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
      hasError = true;
    }
  });
  page.on('pageerror', error => {
    console.log('PAGE EXCEPTION:', error.message);
    hasError = true;
  });
  
  await page.goto('http://127.0.0.1:5173/');
  
  // Login first
  await page.waitForSelector('input[placeholder="Enter username"]');
  await page.type('input[placeholder="Enter username"]', 'admin');
  await page.type('input[placeholder="Enter password"]', 'password');
  await page.click('button');
  
  // Wait for sidebar
  await page.waitForSelector('.sidebar');
  
  // Click on Issues tab
  const tabs = await page.$$('.sidebar-nav button');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text.includes('Issues')) {
      await tab.click();
      break;
    }
  }
  
  // Wait for Create Issue button
  await new Promise(r => setTimeout(r, 1000));
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Create issue')) {
      await btn.click();
      break;
    }
  }
  
  await new Promise(r => setTimeout(r, 2000));
  
  if (!hasError) {
    console.log("NO ERRORS CAUGHT!");
  }
  await browser.close();
})();
