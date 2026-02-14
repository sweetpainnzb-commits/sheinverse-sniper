const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TARGET_URL = 'https://www.sheinindia.in/c/sverse-5939-37961?query=%3Arelevance%3Agenderfilter%3AMen&gridColumns=2&segmentIds=23%2C17%2C18%2C9&customerType=Existing&includeUnratedProducts=false';

const PROXIES = [
    '31.59.20.176:6754', '185.193.159.136:7417', '185.193.157.142:6971',
    '31.59.13.141:5906', '31.59.14.39:5348', '31.59.50.117:6383',
    '185.193.157.38:8150', '185.193.159.123:5131', '31.59.13.155:5430',
    '31.59.13.197:5620'
];

const SEEN_FILE = 'seen_products.json';
let seenProducts = new Set();

if (fs.existsSync(SEEN_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
        seenProducts = new Set(data);
        console.log(`📊 Loaded ${seenProducts.size} seen products.`);
    } catch (e) {
        console.log("⚠️ Error loading seen products, starting fresh.");
    }
}

async function sendTelegram(message, imageUrl = null) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        const endpoint = imageUrl ? 'sendPhoto' : 'sendMessage';
        const body = imageUrl ? { chat_id: TELEGRAM_CHAT_ID, photo: imageUrl, caption: message, parse_mode: 'HTML' } : { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' };
        
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error("❌ Telegram Error:", e.message);
    }
}

async function checkStock(browser, product, index) {
    const page = await browser.newPage();
    // Use a high-quality mobile User Agent to mimic a real device
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    
    try {
        console.log(`   ⚡ Checking (${index + 1}): ${product.name.substring(0, 30)}...`);
        await page.goto(product.url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Generate Debug Files for the first 5 products
        if (index < 5) {
            const safeName = product.name.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 15);
            const htmlPath = `debug_${index}_${safeName}.html`;
            const screenPath = `debug_${index}_${safeName}.png`;
            
            const html = await page.content();
            fs.writeFileSync(htmlPath, html);
            await page.screenshot({ path: screenPath });
            console.log(`      📸 Debug files created: ${htmlPath}`);
        }

        // IMPROVED STOCK DETECTION
        const stockData = await page.evaluate(() => {
            const htmlText = document.body.innerHTML.toLowerCase();
            
            // Look for common SHEIN Add to Bag button classes
            const addBtn = document.querySelector('.she-btn-black, .add-to-bag, .product-intro__add-btn');
            const oosText = htmlText.includes('sold out') || htmlText.includes('out of stock') || htmlText.includes('item is unavailable');
            
            // If button exists, is not disabled, and doesn't say "Sold Out"
            const isAvailable = !!addBtn && !addBtn.disabled && !addBtn.innerText.toLowerCase().includes('sold out') && !oosText;
            
            return {
                inStock: isAvailable,
                btnText: addBtn ? addBtn.innerText.trim() : 'NOT_FOUND',
                oosFound: oosText
            };
        });

        return stockData.inStock;
    } catch (e) {
        console.error(`      ❌ Error checking ${product.url}: ${e.message}`);
        return false;
    } finally {
        await page.close();
    }
}

(async () => {
    console.log(`🚀 Starting FAST SHEINVERSE Sniper... ${new Date().toLocaleString()}`);
    let browser;
    let success = false;

    // Try proxies until one works for the main listing
    for (let i = 0; i < PROXIES.length && !success; i++) {
        const proxy = PROXIES[i];
        console.log(`🔄 Trying proxy: ${proxy}`);
        
        try {
            browser = await puppeteer.launch({
                headless: "new",
                args: [`--proxy-server=http://${proxy}`, '--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 375, height: 812, isMobile: true });
            await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

            // Scroll to ensure products load
            for (let s = 1; s <= 10; s++) {
                await page.evaluate(() => window.scrollBy(0, 1000));
                await new Promise(r => setTimeout(r, 800));
            }

            const products = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('.S-product-item')).map(el => {
                    const link = el.querySelector('.S-product-item__name-link');
                    const img = el.querySelector('.S-product-item__img-main');
                    const price = el.querySelector('.S-product-item__price');
                    return {
                        name: link?.innerText.trim(),
                        url: link?.href,
                        price: price?.innerText.trim(),
                        image: img?.getAttribute('data-src') || img?.src,
                        id: el.getAttribute('data-id') || link?.href.split('/').pop()
                    };
                }).filter(p => p.name && p.url);
            });

            console.log(`📦 Found ${products.length} products on listing.`);
            
            const newProducts = products.filter(p => !seenProducts.has(p.id));
            console.log(`🎯 New products to check: ${newProducts.length}`);

            // Limit check to first 10 for speed and safety in this run
            const toCheck = newProducts.slice(0, 10);

            for (let j = 0; j < toCheck.length; j++) {
                const isAvailable = await checkStock(browser, toCheck[j], j);
                
                if (isAvailable) {
                    console.log(`✅ IN STOCK: ${toCheck[j].name}`);
                    await sendTelegram(`🔥 <b>IN STOCK!</b>\n\n${toCheck[j].name}\nPrice: ${toCheck[j].price}\n\n<a href="${toCheck[j].url}">Shop Now</a>`, toCheck[j].image);
                } else {
                    console.log(`❌ Still OOS: ${toCheck[j].name.substring(0, 20)}`);
                }
                
                seenProducts.add(toCheck[j].id);
            }

            // Final save of the seen products
            fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenProducts]));
            success = true;
        } catch (e) {
            console.error(`❌ Proxy/Run failed: ${e.message}`);
        } finally {
            if (browser) await browser.close();
        }
    }
})();
