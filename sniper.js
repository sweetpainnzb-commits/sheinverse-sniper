const puppeteer = require('puppeteer');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';

// Your Webshare proxies
const WEBSHARE_PROXIES = [
    '31.59.20.176:6754:vtlrnieh:3cl0gw8tlcsy',
    '23.95.150.145:6114:vtlrnieh:3cl0gw8tlcsy',
    '198.23.239.134:6540:vtlrnieh:3cl0gw8tlcsy',
    '45.38.107.97:6014:vtlrnieh:3cl0gw8tlcsy',
    '107.172.163.27:6543:vtlrnieh:3cl0gw8tlcsy',
    '198.105.121.200:6462:vtlrnieh:3cl0gw8tlcsy',
    '64.137.96.74:6641:vtlrnieh:3cl0gw8tlcsy',
    '216.10.27.159:6837:vtlrnieh:3cl0gw8tlcsy',
    '23.26.71.145:5628:vtlrnieh:3cl0gw8tlcsy',
    '23.229.19.94:8689:vtlrnieh:3cl0gw8tlcsy'
];

// Men's SHEINVERSE URL
const TARGET_URL = 'https://www.sheinindia.in/c/sverse-5939-37961?query=%3Arelevance%3Agenderfilter%3AMen&gridColumns=2&segmentIds=23%2C17%2C18%2C9&customerType=Existing&includeUnratedProducts=false';

// TEST MODE - Only check 2 products, no batches
const TEST_COUNT = 2;
const DEBUG_MODE = true;
const DEBUG_DIR = 'debug_artifacts';

function parseProxy(proxyString) {
    const [ip, port, username, password] = proxyString.split(':');
    return { ip, port, username, password };
}

function formatProxyForPuppeteer(proxy) {
    return `http://${proxy.ip}:${proxy.port}`;
}

let currentProxyIndex = 0;
function getNextProxy() {
    const proxyString = WEBSHARE_PROXIES[currentProxyIndex];
    currentProxyIndex = (currentProxyIndex + 1) % WEBSHARE_PROXIES.length;
    return parseProxy(proxyString);
}

function loadSeenProducts() {
    try {
        if (fs.existsSync(SEEN_FILE)) {
            const data = fs.readFileSync(SEEN_FILE, 'utf8');
            const seen = JSON.parse(data);
            console.log(`📂 Loaded ${Object.keys(seen).length} previously seen products`);
            return seen;
        }
    } catch (e) {
        console.log('❌ Error loading seen products:', e.message);
    }
    return {};
}

function saveSeenProducts(seen) {
    try {
        fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
        console.log(`✅ Saved ${Object.keys(seen).length} products`);
    } catch (e) {
        console.log('❌ Error saving:', e.message);
    }
}

async function saveDebugFiles(page, product, index) {
    try {
        if (!fs.existsSync(DEBUG_DIR)) {
            fs.mkdirSync(DEBUG_DIR, { recursive: true });
        }
        
        const safeId = product.id.toString().replace(/[^a-z0-9]/gi, '_');
        const baseName = `product_${index + 1}_${safeId}`;
        
        const screenshotPath = `${DEBUG_DIR}/${baseName}.jpg`;
        await page.screenshot({ 
            path: screenshotPath,
            fullPage: true,
            type: 'jpeg',
            quality: 80
        });
        
        const htmlPath = `${DEBUG_DIR}/${baseName}.html`;
        const html = await page.content();
        fs.writeFileSync(htmlPath, html);
        
        console.log(`   📸 Saved: ${baseName}.jpg + .html`);
        return true;
    } catch (error) {
        console.log(`   ❌ Debug save failed: ${error.message}`);
        return false;
    }
}

async function setupStealthPage(browser, proxy) {
    const page = await browser.newPage();
    
    // Authenticate proxy
    await page.authenticate({
        username: proxy.username,
        password: proxy.password
    });
    
    // Set realistic viewport
    await page.setViewport({ 
        width: 1920, 
        height: 1080,
        deviceScaleFactor: 1
    });
    
    // Latest Chrome user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    // Set realistic headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    });
    
    // Advanced stealth - hide automation indicators
    await page.evaluateOnNewDocument(() => {
        // Overwrite the `plugins` property to use a custom getter
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
        
        // Overwrite the `plugins` property to use a custom getter
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        
        // Overwrite the `languages` property to use a custom getter
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
        });
        
        // Pass the Webdriver test
        delete navigator.__proto__.webdriver;
        
        // Pass the Chrome test
        window.chrome = {
            runtime: {},
        };
        
        // Pass the Permissions test
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
    });
    
    return page;
}

async function checkProductWithRetry(page, product, index, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`\n🔍 Product ${index + 1}/${TEST_COUNT}: ${product.name.substring(0, 40)}...`);
            if (attempt > 1) console.log(`   🔄 Retry attempt ${attempt}/${maxRetries}`);
            
            console.log(`   ⏳ Loading: ${product.url}`);
            
            // Navigate with generous timeout
            const response = await page.goto(product.url, {
                waitUntil: 'domcontentloaded',
                timeout: 45000
            });
            
            const status = response.status();
            console.log(`   📊 HTTP ${status}`);
            
            // Wait for page to settle
            console.log(`   ⏳ Waiting for content...`);
            await new Promise(r => setTimeout(r, 8000)); // 8 second wait
            
            // Check page title
            const title = await page.title();
            console.log(`   📄 Title: ${title.substring(0, 60)}...`);
            
            // Check if blocked
            if (title.includes('Access Denied') || title.includes('Just a moment') || title.includes('Attention Required')) {
                console.log(`   🚫 BLOCKED by security (${title})`);
                
                if (attempt < maxRetries) {
                    console.log(`   ⏳ Waiting 10 seconds before retry...`);
                    await new Promise(r => setTimeout(r, 10000));
                    continue;
                } else {
                    if (DEBUG_MODE) await saveDebugFiles(page, product, index);
                    return { blocked: true, inStock: false };
                }
            }
            
            // Success - page loaded
            console.log(`   ✅ Page loaded successfully!`);
            
            // Save debug files
            if (DEBUG_MODE) {
                await saveDebugFiles(page, product, index);
            }
            
            // Check stock
            console.log(`   🔎 Checking stock...`);
            const stockInfo = await page.evaluate(() => {
                const bodyText = document.body.innerText?.toLowerCase() || '';
                
                return {
                    hasOutOfStock: bodyText.includes('out of stock'),
                    hasSoldOut: bodyText.includes('sold out'),
                    hasComingSoon: bodyText.includes('coming soon'),
                    hasAddToBag: bodyText.includes('add to bag'),
                    hasBuyNow: bodyText.includes('buy now'),
                    hasPrice: bodyText.includes('₹'),
                    bodyLength: bodyText.length,
                    titleText: document.title
                };
            });
            
            console.log(`   📊 Stock Info:`, JSON.stringify(stockInfo, null, 2));
            
            // Determine stock status
            if (stockInfo.hasOutOfStock || stockInfo.hasSoldOut || stockInfo.hasComingSoon) {
                console.log(`   ❌ OUT OF STOCK`);
                return { blocked: false, inStock: false, stockInfo };
            } else if (stockInfo.hasAddToBag || stockInfo.hasBuyNow) {
                console.log(`   ✅ IN STOCK!`);
                return { blocked: false, inStock: true, stockInfo };
            } else if (stockInfo.hasPrice && stockInfo.bodyLength > 1000) {
                console.log(`   ⚠️ UNCERTAIN - has price and content, assuming IN STOCK`);
                return { blocked: false, inStock: true, stockInfo };
            } else {
                console.log(`   ⚠️ UNCERTAIN - assuming OUT OF STOCK`);
                return { blocked: false, inStock: false, stockInfo };
            }
            
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            
            if (attempt < maxRetries) {
                console.log(`   ⏳ Waiting 10 seconds before retry...`);
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }
            
            return { blocked: false, inStock: false, error: error.message };
        }
    }
}

async function sendTelegramAlert(product) {
    const caption = `🆕 <b>${product.name}</b>\n💰 ${product.price} ✅ IN STOCK\n🔗 <a href="${product.url}">VIEW PRODUCT</a>`;
    
    try {
        const fetch = (await import('node-fetch')).default;
        const FormData = (await import('form-data')).default;
        
        if (product.imageUrl) {
            const formData = new FormData();
            formData.append('chat_id', TELEGRAM_CHAT_ID);
            formData.append('photo', product.imageUrl);
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
            
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
        }
    } catch (error) {
        console.error(`❌ Telegram failed: ${error.message}`);
    }
}

async function scrapeWithProxy(proxy) {
    console.log(`\n🔄 Testing proxy: ${proxy.ip}:${proxy.port}`);
    
    let browser;
    try {
        const proxyUrl = formatProxyForPuppeteer(proxy);
        
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome-stable',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-web-security',
                `--proxy-server=${proxyUrl}`
            ]
        });

        const page = await setupStealthPage(browser, proxy);
        
        console.log('📱 Loading Men\'s SHEINVERSE listing page...');
        
        const response = await page.goto(TARGET_URL, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        console.log(`📊 Listing page: HTTP ${response.status()}`);
        
        await page.waitForSelector('.item.rilrtl-products-list__item', { timeout: 30000 });
        
        console.log('📜 Scrolling...');
        for (let i = 0; i < 10; i++) {
            await page.evaluate(() => window.scrollBy(0, 800));
            await new Promise(r => setTimeout(r, 1000));
        }
        
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('🔍 Extracting products...');
        
        const products = await page.evaluate(() => {
            const items = [];
            const productElements = document.querySelectorAll('.item.rilrtl-products-list__item');
            
            productElements.forEach((element) => {
                try {
                    const link = element.querySelector('a.rilrtl-products-list__link');
                    if (!link) return;
                    
                    const href = link.getAttribute('href');
                    const id = href?.match(/-p-(\d+)/)?.[1] || href;
                    
                    const img = element.querySelector('img.rilrtl-lazy-img');
                    if (!img) return;
                    
                    let name = img.getAttribute('alt') || "Shein Product";
                    name = name.replace(/Shein\s*/i, '').trim();
                    
                    let price = "Price N/A";
                    const priceElement = element.querySelector('.price strong, .offer-pricess');
                    if (priceElement) {
                        price = priceElement.innerText.trim();
                        if (!price.includes('₹')) price = '₹' + price;
                    }
                    
                    let imageUrl = img.getAttribute('src') || img.getAttribute('data-src');
                    if (imageUrl) {
                        if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                        else if (imageUrl.startsWith('/')) imageUrl = 'https://www.sheinindia.in' + imageUrl;
                    }
                    
                    const url = href.startsWith('http') ? href : `https://www.sheinindia.in${href}`;
                    
                    items.push({ id, name, price, url, imageUrl });
                } catch (e) {}
            });
            
            return items;
        });
        
        console.log(`📦 Found ${products.length} products`);
        
        if (products.length > 0) {
            const seen = loadSeenProducts();
            
            let newProducts = products.filter(p => p.id && !seen[p.id]);
            
            // Only check first TEST_COUNT products
            if (newProducts.length > TEST_COUNT) {
                newProducts = newProducts.slice(0, TEST_COUNT);
            }
            
            console.log(`\n🎯 Testing ${newProducts.length} products...`);
            
            if (newProducts.length > 0) {
                const inStockProducts = [];
                const outOfStockProducts = [];
                let blockedCount = 0;
                
                for (let i = 0; i < newProducts.length; i++) {
                    const product = newProducts[i];
                    
                    // Use the SAME page to maintain session/cookies
                    const result = await checkProductWithRetry(page, product, i);
                    
                    if (result.blocked) {
                        blockedCount++;
                    } else if (result.inStock) {
                        inStockProducts.push(product);
                    } else {
                        outOfStockProducts.push(product);
                    }
                    
                    // Longer wait between products
                    if (i < newProducts.length - 1) {
                        console.log(`   ⏳ Waiting 15 seconds before next product...`);
                        await new Promise(r => setTimeout(r, 15000));
                    }
                }
                
                console.log(`\n📊 FINAL RESULTS:`);
                console.log(`   ✅ In stock: ${inStockProducts.length}`);
                console.log(`   ❌ Out of stock: ${outOfStockProducts.length}`);
                console.log(`   🚫 Blocked: ${blockedCount}`);
                
                if (DEBUG_MODE && fs.existsSync(DEBUG_DIR)) {
                    const files = fs.readdirSync(DEBUG_DIR);
                    console.log(`\n📁 Debug files: ${files.length}`);
                    files.forEach(f => console.log(`   - ${f}`));
                }
                
                if (inStockProducts.length > 0) {
                    console.log(`\n📤 Sending alerts...`);
                    for (const product of inStockProducts) {
                        await sendTelegramAlert(product);
                        seen[product.id] = Date.now();
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
                
                newProducts.forEach(p => seen[p.id] = Date.now());
                saveSeenProducts(seen);
            }
        }
        
        return true;
        
    } catch (error) {
        console.log(`❌ Proxy failed: ${error.message}`);
        return false;
    } finally {
        if (browser) await browser.close();
    }
}

async function runSniper() {
    console.log(`🚀 SHEINVERSE Sniper - STEALTH MODE`);
    console.log(`🧪 Testing ${TEST_COUNT} products only`);
    console.log(`📡 ${WEBSHARE_PROXIES.length} proxies available`);
    console.log(`🔍 Debug: ${DEBUG_MODE ? 'ON' : 'OFF'}\n`);
    
    for (let attempt = 0; attempt < WEBSHARE_PROXIES.length; attempt++) {
        const proxy = getNextProxy();
        console.log(`📡 Proxy ${attempt + 1}/${WEBSHARE_PROXIES.length}`);
        
        const success = await scrapeWithProxy(proxy);
        if (success) {
            console.log('\n✅ Completed successfully!');
            return;
        }
        
        console.log('⏳ Waiting 5 seconds before next proxy...\n');
        await new Promise(r => setTimeout(r, 5000));
    }
    
    console.log('❌ All proxies failed');
}

runSniper();
