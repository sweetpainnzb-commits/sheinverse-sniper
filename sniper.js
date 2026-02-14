const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// The Men's SHEINVERSE URL you provided
const TARGET_URL = 'https://www.sheinindia.in/c/sverse-5939-37961?query=%3Arelevance%3Agenderfilter%3AMen&gridColumns=2&segmentIds=23%2C17%2C18%2C9&customerType=Existing&includeUnratedProducts=false';

// Your 10 Webshare Proxies
const PROXIES = [
    '31.59.20.176:6754', '185.193.159.136:7417', '185.193.157.142:6971',
    '31.59.13.141:5906', '31.59.14.39:5348', '31.59.50.117:6383',
    '185.193.157.38:8150', '185.193.159.123:5131', '31.59.13.155:5430',
    '31.59.13.197:5620'
];

const SEEN_FILE = 'seen_products.json';
let seenProducts = new Set();

// Load previously seen products
if (fs.existsSync(SEEN_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
        seenProducts = new Set(data);
        console.log(`📂 Loaded ${seenProducts.size} previously seen products.`);
    } catch (e) {
        console.log("⚠️ Error loading seen products, starting fresh.");
    }
}

// --- TELEGRAM FUNCTION ---
async function sendTelegram(message, imageUrl = null) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        const endpoint = imageUrl ? 'sendPhoto' : 'sendMessage';
        const body = imageUrl 
            ? { chat_id: TELEGRAM_CHAT_ID, photo: imageUrl, caption: message, parse_mode: 'HTML' } 
            : { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' };
        
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error("❌ Telegram Error:", e.message);
    }
}

// --- STOCK CHECKING FUNCTION (THE FIX) ---
async function checkStock(browser, product, index) {
    const page = await browser.newPage();
    // Use a real desktop User Agent to prevent mobile redirects/blocks
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    try {
        console.log(`   ⚡ Checking stock: ${product.name.substring(0, 25)}...`);
        
        // Go to product page
        await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait specifically for the price or button area to load
        // This prevents checking "too early" while the page is white
        try {
            await page.waitForSelector('.product-intro__info', { timeout: 10000 });
        } catch (e) {
            // Ignore timeout, we will check content anyway
        }

        // --- DEBUG: SAVE HTML & SCREENSHOT FOR FIRST 5 PRODUCTS ---
        if (index < 5) {
            // We use simple names so the YAML artifact uploader finds them
            const debugName = `debug-product-${index}`;
            
            // Save Screenshot
            await page.screenshot({ path: `${debugName}.jpg`, type: 'jpeg', quality: 60 });
            
            // Save HTML
            const html = await page.content();
            fs.writeFileSync(`${debugName}.html`, html);
            
            console.log(`      📸 Saved debug files: ${debugName}.jpg / .html`);
        }

        // --- STOCK DETECTION LOGIC ---
        const stockInfo = await page.evaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            
            // 1. Look for explicit "Sold Out" text
            const isSoldOutText = bodyText.includes('sold out') || 
                                  bodyText.includes('out of stock') || 
                                  bodyText.includes('currently unavailable');

            // 2. Look for the "Add to Bag" button
            const addBtn = document.querySelector('button.she-btn-black, button.add-to-bag, .product-intro__add-btn');
            
            let btnStatus = "No Button Found";
            let isBtnDisabled = true;

            if (addBtn) {
                btnStatus = addBtn.innerText;
                // Check if button has 'disabled' attribute or class
                isBtnDisabled = addBtn.disabled || addBtn.classList.contains('is-disabled') || addBtn.classList.contains('btn-disabled');
            }

            // DECISION:
            // It is IN STOCK if:
            // - We do NOT see "sold out" text
            // - AND We found a button that is NOT disabled
            const isInStock = !isSoldOutText && (addBtn && !isBtnDisabled);

            return { isInStock, btnStatus, isSoldOutText };
        });

        if (stockInfo.isInStock) {
            console.log(`      ✅ IN STOCK! (Button: ${stockInfo.btnStatus})`);
            return true;
        } else {
            console.log(`      ❌ Out of Stock (SoldOutText: ${stockInfo.isSoldOutText}, Button: ${stockInfo.btnStatus})`);
            return false;
        }

    } catch (e) {
        console.error(`      ⚠️ Error checking stock for ${product.id}: ${e.message}`);
        // If error, assume out of stock to be safe, but log it
        fs.appendFileSync('debug-error.txt', `Error ${product.id}: ${e.message}\n`);
        return false;
    } finally {
        await page.close();
    }
}

// --- MAIN SNIPER LOGIC ---
(async () => {
    console.log(`🚀 Starting FAST SHEINVERSE Sniper... ${new Date().toLocaleString()}`);
    let browser;
    let success = false;

    // Try proxies until one works
    for (let i = 0; i < PROXIES.length && !success; i++) {
        const proxy = PROXIES[i];
        console.log(`🔄 Trying proxy: ${proxy}`);
        
        try {
            browser = await puppeteer.launch({
                headless: "new",
                args: [
                    `--proxy-server=http://${proxy}`, 
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });

            const page = await browser.newPage();
            // Block images/fonts on the listing page to speed it up
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font'].includes(req.resourceType()) && req.url().indexOf(TARGET_URL) === -1) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            console.log(`📱 Loading Men's SHEINVERSE page...`);
            await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

            // Scroll to load lazy products (Scroll 15 times)
            console.log(`📜 Scrolling to load all products...`);
            for (let s = 1; s <= 15; s++) {
                await page.evaluate(() => window.scrollBy(0, 1000));
                await new Promise(r => setTimeout(r, 1000)); // 1 second wait between scrolls
            }

            // Extract Products
            console.log(`🔍 Extracting products from listing...`);
            const products = await page.evaluate(() => {
                const items = document.querySelectorAll('.S-product-item');
                const results = [];
                
                items.forEach(el => {
                    const link = el.querySelector('a');
                    const img = el.querySelector('img');
                    const priceEl = el.querySelector('.S-product-item__price');
                    
                    if (link && img) {
                        // Get ID from URL or Data attribute
                        let id = el.getAttribute('data-id');
                        if (!id && link.href) {
                            // Extract ID from URL like "...-p-123456.html"
                            const match = link.href.match(/-p-(\d+)/);
                            if (match) id = match[1];
                        }
                        // Fallback ID
                        if (!id) id = link.href;

                        results.push({
                            name: link.getAttribute('aria-label') || "Shein Product",
                            url: link.href,
                            price: priceEl ? priceEl.innerText : "N/A",
                            image: img.src,
                            id: id
                        });
                    }
                });
                return results;
            });

            console.log(`📦 Found ${products.length} total products on listing`);

            // Filter new products
            const newProducts = products.filter(p => !seenProducts.has(p.id));
            console.log(`🎯 New products to check: ${newProducts.length}`);
            console.log(`⚡ Checking stock in batches (This is FAST!)...`);

            // --- BATCH PROCESSING (Check stock for new items) ---
            // We verify stock before alerting
            const BATCH_SIZE = 1; // Keep it 1 for now to ensure debug files don't get overwritten or mixed up
            
            for (let j = 0; j < newProducts.length; j += BATCH_SIZE) {
                const batch = newProducts.slice(j, j + BATCH_SIZE);
                
                // Process batch
                await Promise.all(batch.map(async (product, batchIndex) => {
                    const globalIndex = j + batchIndex;
                    
                    // Check Stock
                    const isAvailable = await checkStock(browser, product, globalIndex);

                    if (isAvailable) {
                        console.log(`🚨 ALERTING: ${product.name}`);
                        const caption = `🎯 <b>SNIPER HIT!</b>\n\n${product.name}\n💰 ${product.price}\n\n<a href="${product.url}">🛒 ADD TO BAG</a>`;
                        await sendTelegram(caption, product.image);
                    } else {
                        // Mark as seen so we don't check again (unless you want to re-check OOS items, but usually snipers ignore OOS)
                        seenProducts.add(product.id);
                    }
                }));

                // Save Seen Products Progress
                fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenProducts], null, 2));
            }

            success = true; // Mark run as successful

        } catch (e) {
            console.error(`❌ Proxy ${proxy} failed/died: ${e.message}`);
        } finally {
            if (browser) await browser.close();
        }
    }
    
    if (!success) {
        console.log("❌ All proxies failed or script crashed.");
        process.exit(1);
    } else {
        console.log("✅ Cycle complete.");
    }
})();
