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

// SIMPLE stock check with minimal debug
async function checkProductStock(page, productUrl, productId, productName) {
    console.log(`   🔍 Checking: ${productName.substring(0, 40)}...`);
    
    try {
        // Try to load the page with a shorter timeout
        const response = await page.goto(productUrl, {
            waitUntil: 'domcontentloaded', // Faster than networkidle2
            timeout: 15000
        }).catch(e => {
            console.log(`   ⚠️ Page load error: ${e.message}`);
            return null;
        });
        
        if (!response) {
            console.log(`   ❌ Failed to load page - marking out of stock`);
            return false;
        }
        
        console.log(`   📊 Status: ${response.status()}`);
        
        // Quick check for out of stock indicators
        const pageText = await page.evaluate(() => document.body.innerText?.toLowerCase() || '');
        
        const outOfStockPhrases = [
            'out of stock', 'sold out', 'coming soon', 'unavailable'
        ];
        
        const hasOutOfStock = outOfStockPhrases.some(phrase => pageText.includes(phrase));
        
        // Check for add to bag button
        const hasButton = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.some(b => 
                b.innerText.toLowerCase().includes('add to bag') ||
                b.innerText.toLowerCase().includes('buy now')
            );
        });
        
        const inStock = hasButton && !hasOutOfStock;
        console.log(`   📊 Has button: ${hasButton}, Out of stock text: ${hasOutOfStock}`);
        console.log(`   📊 Result: ${inStock ? '✅ IN STOCK' : '❌ OUT OF STOCK'}`);
        
        return inStock;
        
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
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
                `--proxy-server=${proxyUrl}`
            ]
        });

        const page = await browser.newPage();
        
        await page.authenticate({
            username: proxy.username,
            password: proxy.password
        });
        
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('📱 Loading listing page...');
        
        const response = await page.goto(TARGET_URL, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        console.log(`📊 Listing status: ${response.status()}`);
        
        await page.waitForSelector('.item.rilrtl-products-list__item', { timeout: 10000 });
        
        console.log('📜 Scrolling...');
        for (let i = 0; i < 10; i++) {
            await page.evaluate(() => window.scrollBy(0, 800));
            await new Promise(r => setTimeout(r, 1000));
        }
        
        console.log('🔍 Extracting products...');
        
        const products = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.item.rilrtl-products-list__item').forEach(el => {
                const link = el.querySelector('a');
                if (!link) return;
                const href = link.getAttribute('href');
                const id = href?.match(/-p-(\d+)/)?.[1] || href;
                const img = el.querySelector('img');
                const name = img?.getAttribute('alt') || 'Product';
                items.push({ id, name, url: `https://www.sheinindia.in${href}` });
            });
            return items;
        });
        
        console.log(`📦 Found ${products.length} products`);
        
        const seen = loadSeenProducts();
        const newProducts = products.filter(p => p.id && !seen[p.id]);
        console.log(`🎯 New products: ${newProducts.length}`);
        
        if (newProducts.length > 0) {
            // Only check first 2 products for debug
            const toCheck = newProducts.slice(0, 2);
            
            for (const product of toCheck) {
                console.log(`\n📦 Checking: ${product.name}`);
                const inStock = await checkProductStock(page, product.url, product.id, product.name);
                
                if (inStock) {
                    console.log(`   ✅ WOULD SEND ALERT (but skipping for debug)`);
                }
                
                seen[product.id] = Date.now();
                await new Promise(r => setTimeout(r, 2000));
            }
            
            saveSeenProducts(seen);
        }
        
        return true;
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        return false;
    } finally {
        if (browser) await browser.close();
    }
}

async function runSniper() {
    console.log('🚀 Starting MINIMAL DEBUG...');
    
    for (let attempt = 0; attempt < WEBSHARE_PROXIES.length; attempt++) {
        const proxy = getNextProxy();
        console.log(`\n📡 Attempt ${attempt + 1}`);
        
        const success = await scrapeWithProxy(proxy);
        if (success) break;
        
        await new Promise(r => setTimeout(r, 5000));
    }
}

runSniper();
