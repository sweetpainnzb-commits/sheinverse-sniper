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

async function checkProductStock(page, productUrl) {
    try {
        console.log(`   🔍 Checking stock for: ${productUrl.split('/').pop()}`);
        
        // Go to product page
        await page.goto(productUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        // Wait for page to load
        await new Promise(r => setTimeout(r, 2000));
        
        // Check for out of stock indicators
        const stockStatus = await page.evaluate(() => {
            const pageText = document.body.innerText || '';
            const pageHtml = document.body.innerHTML || '';
            
            // Common out of stock indicators
            const outOfStockPhrases = [
                'out of stock',
                'out-of-stock',
                'sold out',
                'currently unavailable',
                'coming soon',
                'not available',
                'oos'
            ];
            
            // Check if any out of stock phrase exists
            const isOutOfStock = outOfStockPhrases.some(phrase => 
                pageText.toLowerCase().includes(phrase) ||
                pageHtml.toLowerCase().includes(phrase)
            );
            
            // Also check for disabled add to bag button
            const addToBagButton = Array.from(document.querySelectorAll('button')).find(btn => 
                btn.innerText.toLowerCase().includes('add to bag') ||
                btn.innerText.toLowerCase().includes('add to cart') ||
                btn.innerText.toLowerCase().includes('buy now')
            );
            
            const isButtonDisabled = addToBagButton ? 
                (addToBagButton.disabled || 
                 addToBagButton.hasAttribute('disabled') ||
                 addToBagButton.classList.contains('disabled')) : 
                false;
            
            // If no add to bag button found, might be out of stock
            const hasAddToBagButton = addToBagButton !== undefined;
            
            return {
                inStock: !isOutOfStock && (hasAddToBagButton && !isButtonDisabled),
                hasButton: hasAddToBagButton,
                buttonDisabled: isButtonDisabled
            };
        });
        
        console.log(`   📊 Stock check: ${stockStatus.inStock ? '✅ IN STOCK' : '❌ OUT OF STOCK'}`);
        return stockStatus.inStock;
        
    } catch (error) {
        console.log(`   ❌ Error checking stock: ${error.message}`);
        return false; // Assume out of stock on error
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

async function sendBatchSummary(stats) {
    try {
        const fetch = (await import('node-fetch')).default;
        
        let message = `📊 <b>BATCH SUMMARY</b>\n`;
        message += `━━━━━━━━━━━━━━\n`;
        message += `✅ In-stock new products: ${stats.inStock}\n`;
        message += `❌ Out of stock (checked): ${stats.outOfStock}\n`;
        message += `⏭️ Already seen: ${stats.alreadySeen}\n`;
        message += `\n<b>First 10 in-stock products:</b>\n`;
        
        stats.firstTen.forEach((p, i) => {
            message += `${i+1}. <a href="${p.url}">${p.name.substring(0, 40)}</a> - ${p.price}\n`;
        });
        
        if (stats.inStock > 10) {
            message += `\n... and ${stats.inStock - 10} more in-stock products`;
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
                console.log(`🔍 Checking stock status for ${newProducts.length} products...`);
                
                const inStockProducts = [];
                const outOfStockProducts = [];
                
                for (let i = 0; i < newProducts.length; i++) {
                    const product = newProducts[i];
                    console.log(`\n📦 Product ${i+1}/${newProducts.length}: ${product.name.substring(0, 40)}...`);
                    
                    // Check actual stock on product page
                    const isInStock = await checkProductStock(page, product.url);
                    
                    if (isInStock) {
                        inStockProducts.push(product);
                        console.log(`   ✅ Added to in-stock list`);
                    } else {
                        outOfStockProducts.push(product);
                        console.log(`   ❌ Added to out-of-stock list`);
                    }
                    
                    // Small delay between checks
                    await new Promise(r => setTimeout(r, 1000));
                }
                
                console.log(`\n📊 Stock check complete:`);
                console.log(`   ✅ In stock: ${inStockProducts.length}`);
                console.log(`   ❌ Out of stock: ${outOfStockProducts.length}`);
                
                // Send alerts for in-stock products
                if (inStockProducts.length > 0) {
                    console.log(`\n📤 Sending ${inStockProducts.length} in-stock alerts at MAXIMUM SPEED...`);
                    
                    for (let i = 0; i < inStockProducts.length; i++) {
                        const product = inStockProducts[i];
                        console.log(`   ${i+1}/${inStockProducts.length}: ${product.name.substring(0, 30)}...`);
                        await sendTelegramAlert(product);
                        seen[product.id] = Date.now();
                        await new Promise(r => setTimeout(r, 300));
                    }
                    
                    // Send summary
                    await sendBatchSummary({
                        inStock: inStockProducts.length,
                        outOfStock: outOfStockProducts.length,
                        alreadySeen: products.length - newProducts.length,
                        firstTen: inStockProducts.slice(0, 10)
                    });
                }
                
                // Mark out-of-stock products as seen so they don't get checked again
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
    console.log('🚀 Starting SHEINVERSE Sniper (ACCURATE STOCK CHECKING)...', new Date().toLocaleString());
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
