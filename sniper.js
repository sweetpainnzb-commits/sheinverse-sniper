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
        } catch (e) {
            console.log('❌ Error loading seen products:', e.message);
        }
    }
    console.log('📂 No seen_products.json file found - first run');
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

function getSafeFilename(productId) {
    // Extract just the product code (the part after /p/)
    const match = productId.match(/\/p\/([^\/]+)/);
    if (match && match[1]) {
        return match[1]; // Returns something like "443326049_darkblue"
    }
    // Fallback: remove special characters
    return productId.replace(/[\/\\:*?"<>|]/g, '_').substring(0, 50);
}

async function checkProductStockWithDebug(page, product, index) {
    try {
        const safeId = getSafeFilename(product.id);
        console.log(`\n   🔍 [Product ${index + 1}] Checking: ${product.name.substring(0, 50)}...`);
        console.log(`      URL: ${product.url}`);
        console.log(`      Product Code: ${safeId}`);
        
        await page.goto(product.url, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        console.log(`      ⏳ Waiting 5 seconds for page to render...`);
        await new Promise(r => setTimeout(r, 5000));
        
        // Take screenshot - use product code for filename
        const screenshotPath = `product_${index+1}_${safeId}.jpg`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`      📸 Saved screenshot: ${screenshotPath}`);
        
        // Save HTML - use product code for filename
        const htmlPath = `product_${index+1}_${safeId}.html`;
        const html = await page.content();
        fs.writeFileSync(htmlPath, html);
        console.log(`      📄 Saved HTML: ${htmlPath}`);
        
        // Check stock status
        const stockStatus = await page.evaluate(() => {
            const pageText = document.body.innerText?.toLowerCase() || '';
            const pageHtml = document.body.innerHTML?.toLowerCase() || '';
            
            // Look for "Add to Bag" button
            const buttons = Array.from(document.querySelectorAll('button, .btn, [class*="add"], [class*="bag"]'));
            let addButton = null;
            for (const btn of buttons) {
                const text = (btn.innerText || '').toLowerCase();
                if (text.includes('add to bag') || text.includes('buy now')) {
                    addButton = btn;
                    break;
                }
            }
            
            const hasAddButton = !!addButton;
            const isButtonDisabled = addButton ? 
                (addButton.disabled || addButton.hasAttribute('disabled')) : true;
            
            // Check for out of stock text
            const outOfStockPhrases = ['out of stock', 'sold out', 'coming soon', 'unavailable'];
            const hasOutOfStock = outOfStockPhrases.some(p => pageText.includes(p));
            
            // Check for "In Stock" text
            const hasInStock = pageText.includes('in stock') || pageText.includes('available');
            
            // Make determination
            let inStock = false;
            let reason = '';
            
            if (hasAddButton && !isButtonDisabled) {
                inStock = true;
                reason = 'Enabled Add to Bag button';
            } else if (hasInStock) {
                inStock = true;
                reason = '"In Stock" text found';
            } else if (hasOutOfStock) {
                inStock = false;
                reason = 'Out of stock text found';
            } else {
                inStock = false;
                reason = 'No clear stock indicators';
            }
            
            return { inStock, reason, hasAddButton, isButtonDisabled };
        });
        
        console.log(`      📊 Result: ${stockStatus.inStock ? '✅ IN STOCK' : '❌ OUT OF STOCK'}`);
        console.log(`      📝 Reason: ${stockStatus.reason}`);
        
        return stockStatus.inStock;
        
    } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
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
            const newProducts = products.filter(p => p.id && !seen[p.id]);
            console.log(`🎯 New products to check: ${newProducts.length}`);
            
            if (newProducts.length > 0) {
                console.log(`\n🔬 Checking ONLY FIRST 5 products for debugging...`);
                console.log(`📸 Will save screenshots & HTML with product codes\n`);
                
                const productsToCheck = newProducts.slice(0, 5);
                const savedFiles = [];
                
                for (let i = 0; i < productsToCheck.length; i++) {
                    const product = productsToCheck[i];
                    const safeId = getSafeFilename(product.id);
                    
                    await checkProductStockWithDebug(page, product, i);
                    
                    // Track saved files
                    savedFiles.push(`product_${i+1}_${safeId}.jpg`);
                    savedFiles.push(`product_${i+1}_${safeId}.html`);
                }
                
                // Save a list of all generated files
                fs.writeFileSync('generated_files.txt', savedFiles.join('\n'));
                console.log(`📋 Saved list of generated files`);
                
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
    console.log(`📸 Will save screenshots & HTML for first 5 products ONLY`);
    console.log(`📁 Files will be named with product codes (e.g., product_1_443326049_darkblue.jpg)\n`);
    
    for (let attempt = 0; attempt < WEBSHARE_PROXIES.length; attempt++) {
        const proxy = getNextProxy();
        console.log(`\n📡 Attempt ${attempt + 1}/${WEBSHARE_PROXIES.length}`);
        
        const success = await scrapeWithProxy(proxy);
        if (success) {
            console.log('✅ Debug run completed!');
            console.log('📁 Check artifacts for the following files:');
            console.log('   - product_1_*.jpg and .html');
            console.log('   - product_2_*.jpg and .html');
            console.log('   - product_3_*.jpg and .html');
            console.log('   - product_4_*.jpg and .html');
            console.log('   - product_5_*.jpg and .html');
            console.log('   - generated_files.txt');
            return;
        }
        
        console.log('⏳ Waiting 5 seconds before next proxy...');
        await new Promise(r => setTimeout(r, 5000));
    }
    
    console.log('❌ All proxies failed');
}

runSniper();
