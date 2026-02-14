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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    
    try {
        console.log(`   ⚡ Checking: ${product.name.substring(0, 30)}...`);
        await page.goto(product.url, { waitUntil: 'networkidle2', timeout: 45000 });

        // DEBUG: Capture for the first 5 products
        if (index < 5) {
            const safeName = product.name.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);
            const htmlPath = `debug_${index}_${safeName}.html`;
            const screenPath = `debug_${index}_${safeName}.png`;
            
            const html = await page.content();
            fs.writeFileSync(htmlPath, html);
            await page.screenshot({ path: screenPath, fullPage: false });
            console.log(`      📸 Debug saved: ${htmlPath}`);
        }

        // IMPROVED DETECTION LOGIC
        // We look for common SHEIN "Add to Bag" patterns or the absence of "Sold Out"
        const stockData = await page.evaluate(() => {
            const html = document.body.innerHTML.toLowerCase();
            const btn = document.querySelector('.she-btn-black, .add-to-bag, [id*="add-to-bag"]');
            const isSoldOutText = html.includes('sold out') || html.includes('out of stock');
            const hasAddButton = !!btn && !btn.disabled && !btn.innerText.toLowerCase().includes('sold out');
            
            return {
                inStock: hasAddButton || (html.includes('add to bag') && !isSoldOutText),
                btnText: btn ? btn.innerText.trim() : 'NOT_FOUND'
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
    console.log(`🚀 Starting SHEINVERSE Sniper... ${new Date().toLocaleString()}`);
    let browser;
    let success = false;

    for (let i = 0; i < PROXIES.length && !success; i++) {
        const proxy = PROXIES[i];
        console.log(`🔄 Trying proxy: ${proxy}`);
        
        try {
            browser = await puppeteer.launch({
                headless: "new",
                args: [`--proxy-server=http://${proxy}`, '--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

            // Scroll to load products
            for (let s = 1; s <= 5; s++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await new Promise(r => setTimeout(r, 1000));
            }

            const products = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('.S-product-item')).map(el => ({
                    name: el.querySelector('.S-product-item__name-link')?.innerText.trim(),
                    url: el.querySelector('.S-product-item__name-link')?.href,
                    price: el.querySelector('.S-product-item__price')?.innerText.trim(),
                    image: el.querySelector('.S-product-item__img-main')?.src,
                    id: el.getAttribute('data-id') || el.querySelector('.S-product-item__name-link')?.href.split('/').pop()
                })).filter(p => p.name && p.url);
            });

            console.log(`📦 Found ${products.length} products.`);
            
            const newProducts = products.filter(p => !seenProducts.has(p.id));
            console.log(`🎯 New products to check: ${newProducts.length}`);

            // Batch check stock
            for (let j = 0; j < newProducts.length; j++) {
                const isAvailable = await checkStock(browser, newProducts[j], j);
                
                if (isAvailable) {
                    console.log(`✅ IN STOCK: ${newProducts[j].name}`);
                    await sendTelegram(`🔥 <b>IN STOCK!</b>\n\n${newProducts[j].name}\nPrice: ${newProducts[j].price}\n\n<a href="${newProducts[j].url}">Shop Now</a>`, newProducts[j].image);
                }
                
                seenProducts.add(newProducts[j].id);
                // Save progress
                fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenProducts]));
            }

            success = true;
        } catch (e) {
            console.error(`❌ Proxy ${proxy} failed: ${e.message}`);
        } finally {
            if (browser) await browser.close();
        }
    }
})();        const products = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.product-list__item, .S-product-item')).map(el => ({
                name: el.querySelector('.name, .S-product-item__name')?.innerText?.trim(),
                price: el.querySelector('.price, .S-product-item__price')?.innerText?.trim(),
                url: el.querySelector('a')?.href,
                image: el.querySelector('img')?.src
            })).filter(p => p.name && p.url);
        });

        console.log(`📦 Found ${products.length} products on listing.`);

        let debugCount = 0;
        for (const product of products.slice(0, 15)) { // Check top 15
            if (seenProducts.includes(product.url)) continue;

            console.log(`🔍 Checking Stock: ${product.name}`);
            await page.goto(product.url, { waitUntil: 'networkidle2' });
            
            // Save debug info for the first 5 new products found
            if (debugCount < 5) {
                await saveDebugData(page, debugCount + 1, product.name);
                debugCount++;
            }

            const stockInfo = await page.evaluate(() => {
                const btn = document.querySelector('.she-btn-black, .add-to-bag, .product-intro__add-btn');
                const isOutOfStock = document.body.innerText.includes('OUT OF STOCK') || 
                                   document.body.innerText.includes('Sold Out') ||
                                   (btn && btn.innerText.includes('OUT OF STOCK'));
                return {
                    inStock: !!btn && !btn.disabled && !isOutOfStock,
                    btnText: btn ? btn.innerText : 'NOT_FOUND'
                };
            });

            if (stockInfo.inStock) {
                await sendTelegram(`🎯 <b>IN STOCK!</b>\n\n${product.name}\nPrice: ${product.price}\n<a href="${product.url}">Buy Now</a>`, product.image);
                seenProducts.push(product.url);
            } else {
                console.log(`❌ Still OOS (Btn: ${stockInfo.btnText})`);
            }
        }

        fs.writeFileSync(SEEN_PRODUCTS_FILE, JSON.stringify(seenProducts.slice(-200)));
    } catch (err) {
        console.error("❌ Run Error:", err.message);
    } finally {
        await browser.close();
        console.log("🏁 Cycle Complete.");
    }
}

run();
