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

// BATCH SIZE - Keep small for debug
const BATCH_SIZE = 3; // Check 3 products at a time for debug

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
    } catch (e) {
        console.log('❌ Error saving seen products:', e.message);
    }
}

// DEBUG FUNCTION - This creates artifacts you can download!
async function debugProductPage(page, productUrl, productId, productName) {
    console.log(`\n🔬 DEBUGGING: ${productName}`);
    
    // Create safe filename (remove special characters)
    const safeName = productId.replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = Date.now();
    
    const debugFiles = [];
    
    try {
        // Navigate to product page
        await page.goto(productUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        // Wait for dynamic content
        await new Promise(r => setTimeout(r, 3000));
        
        // 1. Take screenshot
        const screenshotPath = `debug_${safeName}_${timestamp}.jpg`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        debugFiles.push(screenshotPath);
        console.log(`   📸 Screenshot saved: ${screenshotPath}`);
        
        // 2. Save full HTML
        const htmlPath = `debug_${safeName}_${timestamp}.html`;
        const html = await page.content();
        fs.writeFileSync(htmlPath, html);
        debugFiles.push(htmlPath);
        console.log(`   📄 HTML saved: ${htmlPath}`);
        
        // 3. Extract ALL page text for analysis
        const pageText = await page.evaluate(() => document.body.innerText);
        const textPath = `debug_${safeName}_${timestamp}.txt`;
        fs.writeFileSync(textPath, pageText);
        debugFiles.push(textPath);
        
        // 4. Get detailed stock info
        const stockInfo = await page.evaluate(() => {
            const pageText = document.body.innerText?.toLowerCase() || '';
            const pageHtml = document.body.innerHTML?.toLowerCase() || '';
            
            // Check all possible stock indicators
            const outOfStockPhrases = [
                'out of stock', 'out-of-stock', 'sold out', 'coming soon',
                'currently unavailable', 'not available', 'oos', 'temporarily unavailable',
                'back soon', 'restocking', 'soldout', 'outofstock'
            ];
            
            const inStockPhrases = [
                'in stock', 'available', 'add to bag', 'add to cart',
                'buy now', 'order now', 'limited stock'
            ];
            
            const foundOutOfStock = outOfStockPhrases.filter(p => pageText.includes(p));
            const foundInStock = inStockPhrases.filter(p => pageText.includes(p));
            
            // Find all buttons
            const buttons = Array.from(document.querySelectorAll('button'));
            const addToBagButtons = buttons.filter(b => 
                b.innerText.toLowerCase().includes('add to bag') ||
                b.innerText.toLowerCase().includes('add to cart') ||
                b.innerText.toLowerCase().includes('buy now')
            );
            
            return {
                outOfStockPhrases: foundOutOfStock,
                inStockPhrases: foundInStock,
                buttonCount: buttons.length,
                addToBagButtons: addToBagButtons.map(b => ({
                    text: b.innerText,
                    disabled: b.disabled,
                    html: b.outerHTML.substring(0, 200)
                })),
                pageTitle: document.title,
                url: window.location.href
            };
        });
        
        // 5. Save stock info as JSON
        const jsonPath = `debug_${safeName}_${timestamp}.json`;
        fs.writeFileSync(jsonPath, JSON.stringify(stockInfo, null, 2));
        debugFiles.push(jsonPath);
        
        console.log(`   📊 Stock analysis: ${stockInfo.inStockPhrases.length ? '✅' : '❌'} In-stock phrases: ${stockInfo.inStockPhrases.join(', ') || 'none'}`);
        console.log(`   📊 Out-of-stock phrases: ${stockInfo.outOfStockPhrases.join(', ') || 'none'}`);
        console.log(`   📊 Add to Bag buttons: ${stockInfo.addToBagButtons.length}`);
        
        return {
            inStock: stockInfo.inStockPhrases.length > 0 && stockInfo.outOfStockPhrases.length === 0 && stockInfo.addToBagButtons.some(b => !b.disabled),
            debugFiles,
            stockInfo
        };
        
    } catch (error) {
        console.log(`   ❌ Debug error: ${error.message}`);
        // Save error info
        const errorPath = `debug_${safeName}_${timestamp}_error.txt`;
        fs.writeFileSync(errorPath, `Error: ${error.message}\nStack: ${error.stack}`);
        debugFiles.push(errorPath);
        
        return {
            inStock: false,
            debugFiles,
            error: error.message
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
        }
    } catch (error) {
        console.error(`   ❌ Telegram failed: ${error.message}`);
    }
}

async function sendDebugSummary(debugResults) {
    try {
        const fetch = (await import('node-fetch')).default;
        
        let message = `🔍 <b>DEBUG SUMMARY</b>\n`;
        message += `━━━━━━━━━━━━━━\n`;
        message += `Products checked: ${debugResults.length}\n`;
        
        const inStock = debugResults.filter(r => r.inStock).length;
        const outOfStock = debugResults.filter(r => !r.inStock).length;
        
        message += `✅ Marked in stock: ${inStock}\n`;
        message += `❌ Marked out of stock: ${outOfStock}\n\n`;
        
        message += `<b>Sample findings:</b>\n`;
        debugResults.slice(0, 3).forEach((r, i) => {
            message += `${i+1}. <a href="${r.url}">${r.name.substring(0, 30)}</a>\n`;
            if (r.stockInfo) {
                message += `   In-stock phrases: ${r.stockInfo.inStockPhrases.join(', ') || 'none'}\n`;
                message += `   Out-of-stock phrases: ${r.stockInfo.outOfStockPhrases.join(', ') || 'none'}\n`;
            }
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
    const allDebugFiles = [];
    const debugResults = [];
    
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
            
            // For debug, check first 5 products only
            const productsToDebug = products.slice(0, 5);
            console.log(`🔬 Debug mode: Checking ${productsToDebug.length} products with full debug...`);
            
            for (let i = 0; i < productsToDebug.length; i++) {
                const product = productsToDebug[i];
                console.log(`\n📦 [${i+1}/${productsToDebug.length}] ${product.name}`);
                
                const result = await debugProductPage(page, product.url, product.id, product.name);
                
                // Collect all debug files
                if (result.debugFiles) {
                    allDebugFiles.push(...result.debugFiles);
                }
                
                debugResults.push({
                    name: product.name,
                    url: product.url,
                    inStock: result.inStock,
                    stockInfo: result.stockInfo
                });
                
                // Mark as seen
                seen[product.id] = Date.now();
                
                // Small delay
                await new Promise(r => setTimeout(r, 2000));
            }
            
            // Send debug summary to Telegram
            await sendDebugSummary(debugResults);
            
            // Save seen products
            saveSeenProducts(seen);
            
            console.log(`\n📊 DEBUG COMPLETE - Generated ${allDebugFiles.length} debug files`);
            console.log(`📁 Files will be available in Artifacts section`);
            
        } else {
            console.log('⚠️ No products found on listing');
        }
        
        return true;
        
    } catch (error) {
        console.log(`❌ Proxy failed: ${error.message}`);
        return false;
    } finally {
        if (browser) await browser.close();
        
        // List all debug files created
        console.log('\n📁 Debug files created:');
        allDebugFiles.forEach(f => console.log(`   - ${f}`));
    }
}

async function runSniper() {
    console.log('🚀 Starting SHEINVERSE Sniper (DEBUG MODE - WILL CREATE ARTIFACTS)...', new Date().toLocaleString());
    console.log(`📡 Target URL: ${TARGET_URL}`);
    console.log(`📡 Loaded ${WEBSHARE_PROXIES.length} proxies`);
    
    for (let attempt = 0; attempt < WEBSHARE_PROXIES.length; attempt++) {
        const proxy = getNextProxy();
        console.log(`\n📡 Attempt ${attempt + 1}/${WEBSHARE_PROXIES.length}`);
        
        const success = await scrapeWithProxy(proxy);
        if (success) {
            console.log('✅ Debug completed! Check Artifacts section for debug files.');
            return;
        }
        
        console.log('⏳ Waiting 5 seconds before next proxy...');
        await new Promise(r => setTimeout(r, 5000));
    }
    
    console.log('❌ All proxies failed');
}

runSniper();
