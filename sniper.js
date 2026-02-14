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
            return JSON.parse(data);
        }
    } catch (e) {}
    return {};
}

function saveSeenProducts(seen) {
    fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

// SIMPLE DEBUG FUNCTION - Just saves HTML and screenshot
async function debugProductPage(page, productUrl, productId, productName) {
    console.log(`\n🔍 DEBUGGING: ${productName.substring(0, 50)}`);
    
    try {
        // Create safe filename (remove special characters)
        const safeId = productId.replace(/[^a-zA-Z0-9]/g, '_');
        
        // Navigate to product page
        console.log(`   📱 Loading product page...`);
        await page.goto(productUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        // Wait a bit for everything to load
        await new Promise(r => setTimeout(r, 5000));
        
        // 1. Take screenshot
        const screenshotPath = `debug_${safeId}_screen.jpg`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`   ✅ Screenshot saved: ${screenshotPath}`);
        
        // 2. Save FULL HTML
        const htmlPath = `debug_${safeId}_page.html`;
        const html = await page.content();
        fs.writeFileSync(htmlPath, html);
        console.log(`   ✅ HTML saved: ${htmlPath} (${html.length} bytes)`);
        
        // 3. Also save just the text for quick checking
        const textPath = `debug_${safeId}_text.txt`;
        const text = await page.evaluate(() => document.body.innerText);
        fs.writeFileSync(textPath, text);
        console.log(`   ✅ Text saved: ${textPath}`);
        
        // 4. Quick stock check for logging
        const hasAddToBag = text.toLowerCase().includes('add to bag');
        const hasOutOfStock = text.toLowerCase().includes('out of stock');
        
        console.log(`   📊 Quick check: Add to Bag found: ${hasAddToBag}, Out of Stock found: ${hasOutOfStock}`);
        
        return {
            screenshot: screenshotPath,
            html: htmlPath,
            text: textPath
        };
        
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        // Save error info
        const errorPath = `debug_${safeId}_error.txt`;
        fs.writeFileSync(errorPath, `Error: ${error.message}\nStack: ${error.stack}`);
        return { error: errorPath };
    }
}

async function scrapeWithProxy(proxy) {
    console.log(`🔄 Trying proxy: ${proxy.ip}:${proxy.port}`);
    
    let browser;
    const debugFiles = [];
    
    try {
        const proxyUrl = formatProxyForPuppeteer(proxy);
        
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome-stable',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                `--proxy-server=${proxyUrl}`
            ]
        });

        const page = await browser.newPage();
        
        await page.authenticate({
            username: proxy.username,
            password: proxy.password
        });
        
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('📱 Loading Men\'s SHEINVERSE page...');
        
        await page.goto(TARGET_URL, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        await page.waitForSelector('.item.rilrtl-products-list__item', { timeout: 30000 });
        
        console.log('📜 Scrolling to load products...');
        for (let i = 0; i < 10; i++) {
            await page.evaluate(() => window.scrollBy(0, 800));
            await new Promise(r => setTimeout(r, 1000));
        }
        
        console.log('🔍 Extracting first 5 products...');
        
        const products = await page.evaluate(() => {
            const items = [];
            const productElements = document.querySelectorAll('.item.rilrtl-products-list__item');
            
            for (let i = 0; i < Math.min(5, productElements.length); i++) {
                const element = productElements[i];
                try {
                    const link = element.querySelector('a.rilrtl-products-list__link');
                    if (!link) continue;
                    
                    const href = link.getAttribute('href');
                    const id = href?.match(/-p-(\d+)/)?.[1] || href;
                    
                    const img = element.querySelector('img.rilrtl-lazy-img');
                    const name = img?.getAttribute('alt') || "Shein Product";
                    
                    const url = href.startsWith('http') ? href : `https://www.sheinindia.in${href}`;
                    
                    items.push({
                        id,
                        name: name.replace(/Shein\s*/i, '').trim(),
                        url
                    });
                } catch (e) {}
            }
            return items;
        });
        
        console.log(`📦 Found ${products.length} products to debug`);
        
        // Debug each product
        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            console.log(`\n🔍 Product ${i+1}/${products.length}: ${product.name}`);
            
            const debug = await debugProductPage(page, product.url, product.id, product.name);
            
            // Track all debug files
            if (debug.screenshot) debugFiles.push(debug.screenshot);
            if (debug.html) debugFiles.push(debug.html);
            if (debug.text) debugFiles.push(debug.text);
            if (debug.error) debugFiles.push(debug.error);
            
            // Mark as seen
            const seen = loadSeenProducts();
            seen[product.id] = Date.now();
            saveSeenProducts(seen);
            
            // Wait between products
            await new Promise(r => setTimeout(r, 2000));
        }
        
        console.log(`\n✅ Debug complete! Generated ${debugFiles.length} debug files:`);
        debugFiles.forEach(f => console.log(`   - ${f}`));
        
        return true;
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        return false;
    } finally {
        if (browser) await browser.close();
    }
}

async function runSniper() {
    console.log('🚀 DEBUG MODE - Will generate HTML for 5 products');
    
    for (let attempt = 0; attempt < WEBSHARE_PROXIES.length; attempt++) {
        const proxy = getNextProxy();
        console.log(`\n📡 Attempt ${attempt + 1}/${WEBSHARE_PROXIES.length}`);
        
        const success = await scrapeWithProxy(proxy);
        if (success) {
            console.log('✅ Debug complete! Check Artifacts section for HTML files.');
            return;
        }
        
        await new Promise(r => setTimeout(r, 5000));
    }
}

runSniper();
