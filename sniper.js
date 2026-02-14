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
    } catch (e) {
        console.log('❌ Error saving seen products:', e.message);
    }
}

async function checkProductStockWithDebug(page, product, index) {
    try {
        console.log(`\n   🔍 [Product ${index + 1}] Checking: ${product.name.substring(0, 50)}...`);
        console.log(`      URL: ${product.url}`);
        
        // Navigate to product page with longer timeout
        await page.goto(product.url, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // CRITICAL: Wait longer for page to fully render
        console.log(`      ⏳ Waiting 5 seconds for page to render...`);
        await new Promise(r => setTimeout(r, 5000));
        
        // Take screenshot - ALWAYS save for first 5
        if (index < 5) {
            const screenshotPath = `debug_product_${index+1}_${product.id}.jpg`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`      📸 Saved screenshot: ${screenshotPath}`);
        }
        
        // Save HTML - ALWAYS save for first 5
        if (index < 5) {
            const htmlPath = `debug_product_${index+1}_${product.id}.html`;
            const html = await page.content();
            fs.writeFileSync(htmlPath, html);
            console.log(`      📄 Saved HTML: ${htmlPath}`);
        }
        
        // Check stock status thoroughly
        const stockStatus = await page.evaluate(() => {
            const pageText = document.body.innerText || '';
            const pageHtml = document.body.innerHTML || '';
            
            // Log what we're seeing (this will appear in GitHub logs)
            console.log('      🔎 Looking for stock indicators...');
            
            // Look for "Add to Bag" button with multiple possible texts
            const buttons = Array.from(document.querySelectorAll('button, .btn, [class*="add"], [class*="bag"], [class*="cart"]'));
            
            let addToBagButton = null;
            for (const btn of buttons) {
                const btnText = (btn.innerText || '').toLowerCase();
                const btnHtml = (btn.outerHTML || '').toLowerCase();
                
                if (btnText.includes('add to bag') || 
                    btnText.includes('add to cart') || 
                    btnText.includes('buy now') ||
                    btnText.includes('add to bag') ||
                    btnHtml.includes('add-to-bag') ||
                    btnHtml.includes('addtobag')) {
                    addToBagButton = btn;
                    break;
                }
            }
            
            const hasAddButton = !!addToBagButton;
            const isButtonDisabled = addToBagButton ? 
                (addToBagButton.disabled || 
                 addToBagButton.hasAttribute('disabled') ||
                 addToBagButton.classList.contains('disabled') ||
                 addToBagButton.getAttribute('aria-disabled') === 'true') : 
                true;
            
            // Check for out of stock text
            const lowerText = pageText.toLowerCase();
            const outOfStockPhrases = [
                'out of stock', 'sold out', 'coming soon', 
                'currently unavailable', 'not available', 'oos',
                'temporarily unavailable', 'out of stock'
            ];
            
            const hasOutOfStockText = outOfStockPhrases.some(phrase => 
                lowerText.includes(phrase)
            );
            
            // Check for "In Stock" text
            const hasInStockText = lowerText.includes('in stock') || 
                                   lowerText.includes('available');
            
            // Look for price
            const hasPrice = lowerText.includes('₹') || pageHtml.includes('₹');
            
            // Make stock determination
            let inStock = false;
            let reason = '';
            
            if (hasAddButton && !isButtonDisabled) {
                inStock = true;
                reason = 'Enabled Add to Bag button found';
            } else if (hasAddButton && isButtonDisabled && !hasOutOfStockText) {
                // Button disabled but no OOS text - might be loading issue
                inStock = false;
                reason = 'Button disabled but no OOS text';
            } else if (hasOutOfStockText) {
                inStock = false;
                reason = 'Out of stock text found';
            } else if (hasInStockText && hasPrice) {
                inStock = true;
                reason = 'In stock text found';
            } else {
                inStock = false;
                reason = 'No clear indicators';
            }
            
            return {
                inStock,
                reason,
                debug: {
                    hasAddButton,
                    isButtonDisabled,
                    hasOutOfStockText,
                    hasInStockText,
                    hasPrice,
                    buttonText: addToBagButton?.innerText?.substring(0, 50) || 'none'
                }
            };
        });
        
        console.log(`      📊 Result: ${stockStatus.inStock ? '✅ IN STOCK' : '❌ OUT OF STOCK'}`);
        console.log(`      📝 Reason: ${stockStatus.reason}`);
        console.log(`      🔧 Debug: AddBtn=${stockStatus.debug.hasAddButton}, Disabled=${stockStatus.debug.isButtonDisabled}, OOSText=${stockStatus.debug.hasOutOfStockText}`);
        
        return stockStatus.inStock;
        
    } catch (error) {
        console.log(`      ❌ Error checking stock: ${error.message}`);
        
        // Save error screenshot for first 5
        if (index < 5) {
            try {
                const errorPath = `debug_error_${index+1}_${product.id}.jpg`;
                await page.screenshot({ path: errorPath, fullPage: true });
                console.log(`      📸 Saved error screenshot: ${errorPath}`);
                
                const errorHtmlPath = `debug_error_${index+1}_${product.id}.html`;
                const html = await page.content();
                fs.writeFileSync(errorHtmlPath, html);
                console.log(`      📄 Saved error HTML: ${errorHtmlPath}`);
            } catch (e) {}
        }
        
        return false;
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
        
        await page.goto(TARGET_URL, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
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
                } catch (e) {}
            });
            
            return items;
        });
        
        console.log(`📦 Found ${products.length} total products on listing`);
        
        if (products.length > 0) {
            const seen = loadSeenProducts();
            
            // Filter out already seen products
            const newProducts = products.filter(p => p.id && !seen[p.id]);
            console.log(`🎯 New products to check: ${newProducts.length}`);
            
            if (newProducts.length > 0) {
                console.log(`\n🔬 Checking ONLY FIRST 5 products for debugging...`);
                console.log(`📸 Will save screenshots & HTML for each\n`);
                
                const productsToCheck = newProducts.slice(0, 5); // ONLY CHECK FIRST 5
                const inStockProducts = [];
                const outOfStockProducts = [];
                
                for (let i = 0; i < productsToCheck.length; i++) {
                    const product = productsToCheck[i];
                    const inStock = await checkProductStockWithDebug(page, product, i);
                    
                    if (inStock) {
                        inStockProducts.push(product);
                    } else {
                        outOfStockProducts.push(product);
                    }
                    
                    // Don't mark as seen yet - we're just debugging
                }
                
                console.log(`\n📊 DEBUG RESULTS (First 5 products only):`);
                console.log(`   ✅ In stock: ${inStockProducts.length}`);
                console.log(`   ❌ Out of stock: ${outOfStockProducts.length}`);
                
                // Save a summary file
                const summary = {
                    timestamp: Date.now(),
                    inStock: inStockProducts.map(p => ({ id: p.id, name: p.name })),
                    outOfStock: outOfStockProducts.map(p => ({ id: p.id, name: p.name }))
                };
                fs.writeFileSync('debug_summary.json', JSON.stringify(summary, null, 2));
                console.log(`📊 Saved debug_summary.json`);
                
            } else {
                console.log('❌ No new products found to check');
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
    console.log('🚀 Starting DEBUG Sniper - Will check ONLY first 5 products', new Date().toLocaleString());
    console.log(`📡 Target URL: ${TARGET_URL}`);
    console.log(`📡 Loaded ${WEBSHARE_PROXIES.length} proxies`);
    console.log(`📸 Will save screenshots & HTML for first 5 products ONLY\n`);
    
    for (let attempt = 0; attempt < WEBSHARE_PROXIES.length; attempt++) {
        const proxy = getNextProxy();
        console.log(`\n📡 Attempt ${attempt + 1}/${WEBSHARE_PROXIES.length}`);
        
        const success = await scrapeWithProxy(proxy);
        if (success) {
            console.log('✅ Debug run completed! Check artifacts for screenshots and HTML.');
            return;
        }
        
        console.log('⏳ Waiting 5 seconds before next proxy...');
        await new Promise(r => setTimeout(r, 5000));
    }
    
    console.log('❌ All proxies failed');
}

runSniper();
