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

// BATCH SIZE
const BATCH_SIZE = 5; // Reduced to 5 for more reliable checking

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
        } else {
            console.log('📂 No seen_products.json file found - first run');
        }
    } catch (e) {
        console.log('❌ Error loading seen products:', e.message);
    }
    return {};
}

function saveSeenProducts(seen) {
    try {
        fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
        console.log(`✅ Saved ${Object.keys(seen).length} products to seen_products.json`);
        
        if (fs.existsSync(SEEN_FILE)) {
            const stats = fs.statSync(SEEN_FILE);
            console.log(`📁 File size: ${stats.size} bytes`);
        }
    } catch (e) {
        console.log('❌ Error saving seen products:', e.message);
    }
}

async function debugProductPage(page, productUrl, productName) {
    console.log(`\n🔍 DEBUGGING PRODUCT: ${productName}`);
    console.log(`📌 URL: ${productUrl}`);
    
    try {
        // Save screenshot of product page
        await page.screenshot({ 
            path: `debug_product_${Date.now()}.jpg`,
            fullPage: true 
        });
        
        // Get ALL page text
        const pageText = await page.evaluate(() => document.body.innerText);
        console.log(`📝 PAGE TEXT SAMPLE (first 500 chars):`);
        console.log(pageText.substring(0, 500));
        console.log('...');
        
        // Get ALL HTML (first 2000 chars)
        const pageHtml = await page.evaluate(() => document.body.innerHTML);
        console.log(`\n📄 HTML SAMPLE (first 1000 chars):`);
        console.log(pageHtml.substring(0, 1000));
        console.log('...');
        
        // Check for specific stock indicators
        const stockIndicators = {
            'out of stock': pageText.toLowerCase().includes('out of stock'),
            'sold out': pageText.toLowerCase().includes('sold out'),
            'coming soon': pageText.toLowerCase().includes('coming soon'),
            'unavailable': pageText.toLowerCase().includes('unavailable'),
            'oos': pageText.toLowerCase().includes('oos'),
            'in stock': pageText.toLowerCase().includes('in stock'),
            'available': pageText.toLowerCase().includes('available')
        };
        
        console.log(`\n📊 STOCK INDICATORS:`);
        Object.entries(stockIndicators).forEach(([key, value]) => {
            console.log(`   ${value ? '✅' : '❌'} "${key}" found: ${value}`);
        });
        
        // Find all buttons
        const buttons = await page.evaluate(() => {
            const allButtons = Array.from(document.querySelectorAll('button'));
            return allButtons.map(b => ({
                text: b.innerText,
                disabled: b.disabled,
                class: b.className,
                html: b.outerHTML.substring(0, 200)
            }));
        });
        
        console.log(`\n🔄 BUTTONS FOUND (${buttons.length}):`);
        buttons.forEach((b, i) => {
            console.log(`   Button ${i+1}: "${b.text}" - Disabled: ${b.disabled}`);
            if (b.text.toLowerCase().includes('add to bag') || b.text.toLowerCase().includes('buy now')) {
                console.log(`   🔴 ADD TO BAG BUTTON: ${b.disabled ? 'DISABLED' : 'ENABLED'}`);
                console.log(`   HTML: ${b.html}`);
            }
        });
        
        // Find all elements with "stock" or "available" in class/id
        const stockElements = await page.evaluate(() => {
            const elements = [];
            document.querySelectorAll('[class*="stock"], [class*="available"], [id*="stock"], [id*="available"]').forEach(el => {
                elements.push({
                    class: el.className,
                    id: el.id,
                    text: el.innerText,
                    html: el.outerHTML.substring(0, 200)
                });
            });
            return elements;
        });
        
        console.log(`\n📦 STOCK-RELATED ELEMENTS (${stockElements.length}):`);
        stockElements.forEach((el, i) => {
            console.log(`   Element ${i+1}: class="${el.class}", id="${el.id}"`);
            console.log(`   Text: "${el.text}"`);
        });
        
        return {
            pageText: pageText.substring(0, 1000),
            pageHtml: pageHtml.substring(0, 2000),
            stockIndicators,
            buttons,
            stockElements
        };
        
    } catch (error) {
        console.log(`❌ Debug error: ${error.message}`);
        return null;
    }
}

async function checkProductStockWithDebug(page, productUrl, productName, productId) {
    console.log(`\n🔎 CHECKING: ${productName}`);
    
    try {
        // Create a unique debug filename
        const debugId = `${productId}_${Date.now()}`;
        
        // Navigate to product page
        console.log(`   📱 Navigating to product page...`);
        await page.goto(productUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        // Wait a bit for dynamic content
        await new Promise(r => setTimeout(r, 3000));
        
        // Take screenshot
        const screenshotPath = `debug_product_${debugId}.jpg`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`   📸 Screenshot saved: ${screenshotPath}`);
        
        // Get page content
        const pageContent = await page.content();
        const pageText = await page.evaluate(() => document.body.innerText);
        
        // Save full HTML
        const htmlPath = `debug_product_${debugId}.html`;
        fs.writeFileSync(htmlPath, pageContent);
        console.log(`   📄 HTML saved: ${htmlPath}`);
        
        // Check for stock indicators
        const textLower = pageText.toLowerCase();
        
        // Out of stock phrases
        const outOfStockPhrases = [
            'out of stock', 'out-of-stock', 'sold out', 'coming soon',
            'currently unavailable', 'not available', 'oos', 'temporarily unavailable',
            'back soon', 'restocking', 'soldout', 'outofstock'
        ];
        
        // In stock phrases
        const inStockPhrases = [
            'in stock', 'available', 'add to bag', 'add to cart',
            'buy now', 'order now', 'limited stock'
        ];
        
        let foundOutOfStock = false;
        let foundInStock = false;
        
        console.log(`\n   📊 STOCK PHRASE CHECK:`);
        
        // Check out of stock phrases
        outOfStockPhrases.forEach(phrase => {
            const found = textLower.includes(phrase);
            if (found) {
                foundOutOfStock = true;
                console.log(`   ❌ Found out-of-stock phrase: "${phrase}"`);
            }
        });
        
        // Check in stock phrases
        inStockPhrases.forEach(phrase => {
            const found = textLower.includes(phrase);
            if (found) {
                foundInStock = true;
                console.log(`   ✅ Found in-stock phrase: "${phrase}"`);
            }
        });
        
        // Find add to bag button
        const buttonInfo = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const addToBagButtons = buttons.filter(b => 
                b.innerText.toLowerCase().includes('add to bag') ||
                b.innerText.toLowerCase().includes('add to cart') ||
                b.innerText.toLowerCase().includes('buy now')
            );
            
            return addToBagButtons.map(b => ({
                text: b.innerText,
                disabled: b.disabled || b.hasAttribute('disabled'),
                class: b.className,
                visible: b.offsetWidth > 0 && b.offsetHeight > 0
            }));
        });
        
        console.log(`\n   🛒 ADD TO BAG BUTTONS: ${buttonInfo.length}`);
        buttonInfo.forEach((btn, i) => {
            console.log(`   Button ${i+1}: "${btn.text}"`);
            console.log(`      Disabled: ${btn.disabled}`);
            console.log(`      Visible: ${btn.visible}`);
        });
        
        // Determine stock status
        let isInStock = false;
        
        if (buttonInfo.length > 0) {
            // If there's an enabled, visible add to bag button
            const enabledButton = buttonInfo.find(b => !b.disabled && b.visible);
            if (enabledButton) {
                isInStock = true;
                console.log(`   ✅ IN STOCK: Enabled add to bag button found`);
            } else {
                console.log(`   ❌ OUT OF STOCK: Add to bag button exists but is disabled`);
            }
        } else if (foundInStock && !foundOutOfStock) {
            // No button but in-stock phrases found
            isInStock = true;
            console.log(`   ✅ IN STOCK: In-stock phrases found, no out-of-stock phrases`);
        } else if (foundOutOfStock) {
            console.log(`   ❌ OUT OF STOCK: Out-of-stock phrases found`);
        } else {
            console.log(`   ⚠️ UNKNOWN: No clear indicators, assuming out of stock`);
        }
        
        return {
            inStock: isInStock,
            debug: {
                screenshot: screenshotPath,
                html: htmlPath,
                textSample: pageText.substring(0, 500),
                outOfStockPhrasesFound: outOfStockPhrases.filter(p => textLower.includes(p)),
                inStockPhrasesFound: inStockPhrases.filter(p => textLower.includes(p)),
                buttonInfo
            }
        };
        
    } catch (error) {
        console.log(`   ❌ Error checking stock: ${error.message}`);
        return {
            inStock: false,
            debug: { error: error.message }
        };
    }
}

async function sendTelegramAlert(product) {
    const caption = `🆕 <b>${product.name}</b>\n💰 ${product.price} ✅ IN STOCK\n🔗 <a href="${product.url}">VIEW PRODUCT</a>`;
    
    try {
        const fetch = (await import('node-fetch')).default;
        
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
            console.log(`   ✅ Alert sent with image`);
        } else {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: caption,
                    parse_mode: 'HTML'
                })
            });
            console.log(`   ✅ Alert sent (text only)`);
        }
    } catch (error) {
        console.error(`   ❌ Telegram failed: ${error.message}`);
    }
}

async function sendDebugSummary(debugInfo) {
    try {
        const fetch = (await import('node-fetch')).default;
        
        let message = `🔍 <b>DEBUG SUMMARY</b>\n`;
        message += `━━━━━━━━━━━━━━\n`;
        message += `Products checked: ${debugInfo.checked}\n`;
        message += `✅ In stock: ${debugInfo.inStock}\n`;
        message += `❌ Out of stock: ${debugInfo.outOfStock}\n`;
        message += `\n<b>Sample out-of-stock products:</b>\n`;
        
        debugInfo.samples.forEach((s, i) => {
            message += `${i+1}. <a href="${s.url}">${s.name}</a> - ${s.phrases}\n`;
        });
        
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch (error) {
        console.error('❌ Debug summary failed:', error.message);
    }
}

async function scrapeWithProxy(proxy) {
    console.log(`🔄 Trying proxy: ${proxy.ip}:${proxy.port}`);
    
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
                `--proxy-server=${proxyUrl}`
            ]
        });

        const page = await browser.newPage();
        
        await page.authenticate({
            username: proxy.username,
            password: proxy.password
        });
        
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('📱 Loading Men\'s SHEINVERSE page...');
        
        const response = await page.goto(TARGET_URL, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        console.log(`📊 Response status: ${response.status()}`);
        
        await page.waitForSelector('.item.rilrtl-products-list__item', { timeout: 30000 });
        
        console.log('📜 Scrolling to load all products...');
        
        for (let i = 0; i < 15; i++) {
            await page.evaluate(() => window.scrollBy(0, 800));
            console.log(`   Scroll ${i + 1}/15`);
            await new Promise(r => setTimeout(r, 1500));
        }
        
        await new Promise(r => setTimeout(r, 3000));
        
        console.log('🔍 Extracting products from listing...');
        
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
                    } else {
                        const text = element.innerText;
                        const match = text.match(/₹\s*([0-9,]+)/);
                        if (match) price = `₹${match[1]}`;
                    }
                    
                    let imageUrl = img.getAttribute('src') || img.getAttribute('data-src');
                    if (imageUrl) {
                        if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                        else if (imageUrl.startsWith('/')) imageUrl = 'https://www.sheinindia.in' + imageUrl;
                        imageUrl = imageUrl.replace(/-\d+Wx\d+H-/, '-1000x1500-');
                    }
                    
                    const url = href.startsWith('http') ? href : `https://www.sheinindia.in${href}`;
                    
                    items.push({
                        id,
                        name,
                        price,
                        url,
                        imageUrl
                    });
                } catch (e) {
                    // Skip errors
                }
            });
            
            return items;
        });
        
        console.log(`📦 Found ${products.length} total products on listing`);
        
        if (products.length > 0) {
            const seen = loadSeenProducts();
            console.log(`📊 Previously seen in history: ${Object.keys(seen).length}`);
            
            // For first run, only check first 5 products for debugging
            const productsToCheck = seen.length === 0 ? products.slice(0, 5) : products.filter(p => p.id && !seen[p.id]);
            console.log(`🎯 Products to check (debug mode): ${productsToCheck.length}`);
            
            if (productsToCheck.length > 0) {
                console.log(`\n🔬 DEBUG MODE: Checking products with full debug info...`);
                
                const inStockProducts = [];
                const outOfStockProducts = [];
                const debugInfo = [];
                
                for (let i = 0; i < productsToCheck.length; i++) {
                    const product = productsToCheck[i];
                    console.log(`\n📦 [${i+1}/${productsToCheck.length}] ${product.name}`);
                    
                    const result = await checkProductStockWithDebug(page, product.url, product.name, product.id);
                    
                    if (result.inStock) {
                        inStockProducts.push(product);
                    } else {
                        outOfStockProducts.push(product);
                    }
                    
                    debugInfo.push({
                        name: product.name,
                        url: product.url,
                        inStock: result.inStock,
                        phrases: result.debug?.outOfStockPhrasesFound?.join(', ') || 'none'
                    });
                    
                    // Save debug files to artifacts
                    if (result.debug?.screenshot) {
                        try {
                            const screenshotData = fs.readFileSync(result.debug.screenshot);
                            fs.writeFileSync(`artifact_${product.id}_screenshot.jpg`, screenshotData);
                        } catch (e) {}
                    }
                    
                    if (result.debug?.html) {
                        try {
                            const htmlData = fs.readFileSync(result.debug.html);
                            fs.writeFileSync(`artifact_${product.id}_page.html`, htmlData);
                        } catch (e) {}
                    }
                    
                    // Small delay
                    await new Promise(r => setTimeout(r, 2000));
                }
                
                console.log(`\n📊 DEBUG RESULTS:`);
                console.log(`   ✅ In stock: ${inStockProducts.length}`);
                console.log(`   ❌ Out of stock: ${outOfStockProducts.length}`);
                
                // Send debug summary to Telegram
                await sendDebugSummary({
                    checked: productsToCheck.length,
                    inStock: inStockProducts.length,
                    outOfStock: outOfStockProducts.length,
                    samples: debugInfo.slice(0, 3)
                });
                
                // Save debug info to file
                fs.writeFileSync('debug_summary.json', JSON.stringify(debugInfo, null, 2));
                
            } else {
                console.log('❌ No products to check');
            }
        } else {
            console.log('⚠️ No products found on listing');
            const screenshot = await page.screenshot({ fullPage: true });
            fs.writeFileSync('debug_listing_screenshot.jpg', screenshot);
            console.log('📸 Debug screenshot saved');
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
    console.log('🚀 Starting SHEINVERSE Sniper (DEBUG MODE)...', new Date().toLocaleString());
    console.log(`📡 Target URL: ${TARGET_URL}`);
    console.log(`📡 Loaded ${WEBSHARE_PROXIES.length} proxies`);
    
    console.log('📁 Files in current directory:');
    const files = fs.readdirSync('.');
    files.forEach(f => console.log(`   - ${f}`));
    
    for (let attempt = 0; attempt < WEBSHARE_PROXIES.length; attempt++) {
        const proxy = getNextProxy();
        console.log(`\n📡 Attempt ${attempt + 1}/${WEBSHARE_PROXIES.length}`);
        
        const success = await scrapeWithProxy(proxy);
        if (success) {
            console.log('✅ Successfully scraped!');
            return;
        }
        
        console.log('⏳ Waiting 5 seconds before next proxy...');
        await new Promise(r => setTimeout(r, 5000));
    }
    
    console.log('❌ All proxies failed');
}

runSniper();
