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

// BATCH SIZE - Higher = faster but more resource intensive
const BATCH_SIZE = 10; // Check 10 products at once!

// DEBUG MODE - Save first 5 products for analysis
const DEBUG_MODE = true;
const DEBUG_COUNT = 5;
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

async function checkProductStockFast(page, productUrl) {
    try {
        // Use a more efficient approach - check just the essentials
        await page.goto(productUrl, {
            waitUntil: 'domcontentloaded', // Faster than networkidle2
            timeout: 15000 // 15 second timeout
        });
        
        // Quick check for out of stock indicators
        const stockStatus = await page.evaluate(() => {
            const pageText = document.body.innerText?.toLowerCase() || '';
            
            // Ultra-fast out of stock detection
            if (pageText.includes('out of stock') || 
                pageText.includes('sold out') || 
                pageText.includes('coming soon')) {
                return false;
            }
            
            // Check if add to bag button exists and is enabled
            const buttons = Array.from(document.querySelectorAll('button'));
            const addButton = buttons.find(btn => 
                btn.innerText.toLowerCase().includes('add to bag') ||
                btn.innerText.toLowerCase().includes('buy now')
            );
            
            return addButton && !addButton.disabled;
        });
        
        return stockStatus;
    } catch (error) {
        console.log(`   ⚡ Fast check failed, assuming out of stock`);
        return false;
    }
}

async function saveDebugFiles(page, product, index) {
    try {
        // Create debug directory if it doesn't exist
        if (!fs.existsSync(DEBUG_DIR)) {
            fs.mkdirSync(DEBUG_DIR, { recursive: true });
            console.log(`📁 Created ${DEBUG_DIR} directory`);
        }
        
        // Generate safe filename from product ID
        const safeId = product.id.toString().replace(/[^a-z0-9]/gi, '_');
        const baseName = `product_${index + 1}_${safeId}`;
        
        // Save screenshot
        const screenshotPath = `${DEBUG_DIR}/${baseName}.jpg`;
        await page.screenshot({ 
            path: screenshotPath,
            fullPage: true,
            type: 'jpeg',
            quality: 80
        });
        console.log(`   📸 Screenshot: ${screenshotPath}`);
        
        // Save HTML
        const htmlPath = `${DEBUG_DIR}/${baseName}.html`;
        const html = await page.content();
        fs.writeFileSync(htmlPath, html);
        console.log(`   📄 HTML: ${htmlPath}`);
        
        // Verify files were created
        if (fs.existsSync(screenshotPath) && fs.existsSync(htmlPath)) {
            const screenshotSize = fs.statSync(screenshotPath).size;
            const htmlSize = fs.statSync(htmlPath).size;
            console.log(`   ✅ Files verified: Screenshot ${screenshotSize} bytes, HTML ${htmlSize} bytes`);
            return true;
        } else {
            console.log(`   ❌ Files not found after creation!`);
            return false;
        }
        
    } catch (error) {
        console.log(`   ❌ Debug save failed: ${error.message}`);
        return false;
    }
}

async function checkBatchStock(page, products, isFirstBatch = false) {
    const results = [];
    
    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        
        try {
            console.log(`   ⚡ Quick check: ${product.name.substring(0, 30)}...`);
            
            // Navigate to product page
            await page.goto(product.url, {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });
            
            // Wait a bit for dynamic content to load
            await new Promise(r => setTimeout(r, 2000));
            
            // Save debug files for first 5 products in first batch
            if (DEBUG_MODE && isFirstBatch && i < DEBUG_COUNT) {
                console.log(`   🔍 DEBUG MODE: Saving files for product ${i + 1}/${DEBUG_COUNT}`);
                await saveDebugFiles(page, product, i);
            }
            
            // Quick stock check
            const inStock = await page.evaluate(() => {
                const text = document.body.innerText?.toLowerCase() || '';
                if (text.includes('out of stock') || text.includes('sold out')) return false;
                
                const addBtn = Array.from(document.querySelectorAll('button')).find(b => 
                    b.innerText.toLowerCase().includes('add to bag')
                );
                return addBtn && !addBtn.disabled;
            });
            
            results.push({
                product,
                inStock
            });
            
            // Minimal delay between checks
            await new Promise(r => setTimeout(r, 500));
            
        } catch (e) {
            console.log(`   ❌ Error checking product: ${e.message}`);
            results.push({ product, inStock: false });
        }
    }
    
    return results;
}

async function sendTelegramAlert(product) {
    const caption = `🆕 <b>${product.name}</b>\n💰 ${product.price} ✅ IN STOCK\n🔗 <a href="${product.url}">VIEW PRODUCT</a>`;
    
    try {
        const fetch = (await import('node-fetch')).default;
        
        if (product.imageUrl) {
            const FormData = (await import('form-data')).default;
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

async function sendBatchSummary(inStock, outOfStock, alreadySeen) {
    try {
        const fetch = (await import('node-fetch')).default;
        
        let message = `📊 <b>BATCH SUMMARY</b>\n`;
        message += `━━━━━━━━━━━━━━\n`;
        message += `✅ In-stock: ${inStock.length}\n`;
        message += `❌ Out of stock: ${outOfStock.length}\n`;
        message += `⏭️ Already seen: ${alreadySeen}\n`;
        
        if (inStock.length > 0) {
            message += `\n<b>First 5 products:</b>\n`;
            inStock.slice(0, 5).forEach((p, i) => {
                message += `${i+1}. <a href="${p.url}">${p.name.substring(0, 40)}</a> - ${p.price}\n`;
            });
        }
        
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
        console.error('❌ Batch summary failed:', error.message);
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
            
            // Filter out already seen products
            const newProducts = products.filter(p => p.id && !seen[p.id]);
            console.log(`🎯 New products to check: ${newProducts.length}`);
            
            if (newProducts.length > 0) {
                console.log(`⚡ Checking stock in batches of ${BATCH_SIZE} (this is FAST!)...`);
                
                if (DEBUG_MODE) {
                    console.log(`\n🔍 DEBUG MODE ENABLED: Will save first ${DEBUG_COUNT} products to ${DEBUG_DIR}/`);
                }
                
                const inStockProducts = [];
                const outOfStockProducts = [];
                
                // Process in batches
                for (let i = 0; i < newProducts.length; i += BATCH_SIZE) {
                    const batch = newProducts.slice(i, i + BATCH_SIZE);
                    const batchNum = Math.floor(i/BATCH_SIZE) + 1;
                    const totalBatches = Math.ceil(newProducts.length/BATCH_SIZE);
                    
                    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} products)`);
                    
                    // Pass flag if this is first batch for debug mode
                    const isFirstBatch = (i === 0);
                    const batchResults = await checkBatchStock(page, batch, isFirstBatch);
                    
                    batchResults.forEach(result => {
                        if (result.inStock) {
                            inStockProducts.push(result.product);
                        } else {
                            outOfStockProducts.push(result.product);
                        }
                    });
                    
                    console.log(`   Batch complete: ✅ ${batchResults.filter(r => r.inStock).length} in stock, ❌ ${batchResults.filter(r => !r.inStock).length} out of stock`);
                }
                
                console.log(`\n📊 FINAL STOCK CHECK:`);
                console.log(`   ✅ In stock: ${inStockProducts.length}`);
                console.log(`   ❌ Out of stock: ${outOfStockProducts.length}`);
                
                // Check if debug files were created
                if (DEBUG_MODE && fs.existsSync(DEBUG_DIR)) {
                    const debugFiles = fs.readdirSync(DEBUG_DIR);
                    console.log(`\n📁 Debug artifacts created: ${debugFiles.length} files`);
                    debugFiles.forEach(f => console.log(`   - ${DEBUG_DIR}/${f}`));
                }
                
                // Send alerts for in-stock products
                if (inStockProducts.length > 0) {
                    console.log(`\n📤 Sending ${inStockProducts.length} in-stock alerts...`);
                    
                    for (let i = 0; i < inStockProducts.length; i++) {
                        const product = inStockProducts[i];
                        console.log(`   ${i+1}/${inStockProducts.length}: ${product.name.substring(0, 30)}...`);
                        await sendTelegramAlert(product);
                        seen[product.id] = Date.now();
                        await new Promise(r => setTimeout(r, 300));
                    }
                    
                    // Send summary
                    await sendBatchSummary(inStockProducts, outOfStockProducts, products.length - newProducts.length);
                }
                
                // Mark out-of-stock products as seen
                outOfStockProducts.forEach(p => {
                    seen[p.id] = Date.now();
                });
                
                saveSeenProducts(seen);
                console.log(`✅ All products processed and saved`);
                
            } else {
                console.log('❌ No new products found to check');
            }
        } else {
            console.log('⚠️ No products found on listing');
            const screenshot = await page.screenshot({ fullPage: true });
            fs.writeFileSync('debug-screenshot.jpg', screenshot);
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
    console.log('🚀 Starting FAST SHEINVERSE Sniper (BATCH MODE + DEBUG)...', new Date().toLocaleString());
    console.log(`📡 Target URL: ${TARGET_URL}`);
    console.log(`📡 Loaded ${WEBSHARE_PROXIES.length} proxies`);
    console.log(`⚡ Batch size: ${BATCH_SIZE} products at once`);
    
    console.log('📁 Files in current directory:');
    const files = fs.readdirSync('.');
    files.forEach(f => console.log(`   - ${f}`));
    
    for (let attempt = 0; attempt < WEBSHARE_PROXIES.length; attempt++) {
        const proxy = getNextProxy();
        console.log(`\n📡 Attempt ${attempt + 1}/${WEBSHARE_PROXIES.length}`);
        
        const success = await scrapeWithProxy(proxy);
        if (success) {
            console.log('✅ Successfully scraped!');
            
            // Final verification of debug files
            if (DEBUG_MODE && fs.existsSync(DEBUG_DIR)) {
                const debugFiles = fs.readdirSync(DEBUG_DIR);
                console.log(`\n✅ FINAL VERIFICATION: ${debugFiles.length} debug files in ${DEBUG_DIR}/`);
                debugFiles.forEach(file => {
                    const path = `${DEBUG_DIR}/${file}`;
                    const size = fs.statSync(path).size;
                    console.log(`   ${file}: ${size} bytes`);
                });
            }
            
            return;
        }
        
        console.log('⏳ Waiting 5 seconds before next proxy...');
        await new Promise(r => setTimeout(r, 5000));
    }
    
    console.log('❌ All proxies failed');
}

runSniper();
