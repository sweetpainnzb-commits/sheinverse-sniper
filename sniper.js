const puppeteer = require('puppeteer');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';

// Free proxy list - Updated frequently with working proxies
const PROXY_LIST = [
    'http://20.111.54.16:8123',
    'http://47.88.32.48:8080', 
    'http://103.152.112.120:80',
    'http://20.204.212.25:3128',
    'http://185.217.137.42:80',
    'http://45.14.174.130:80',
    'http://20.27.86.185:8080',
    'http://51.89.255.67:80',
    'http://20.199.81.189:3128',
    'http://188.166.56.247:80',
    'http://20.105.191.131:8181',
    'http://20.116.91.72:3128',
    'http://185.217.136.116:80',
    'http://20.71.116.145:3128',
    'http://20.111.54.16:8123'
];

// Rotate through proxies
function getRandomProxy() {
    return PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
}

function loadSeenProducts() {
    try {
        if (fs.existsSync(SEEN_FILE)) {
            const data = fs.readFileSync(SEEN_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log('No previous data, starting fresh');
    }
    return {};
}

function saveSeenProducts(seen) {
    fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

async function sendTelegramAlert(product) {
    const caption = `🆕 <b>${product.name}</b>\n💰 ${product.price}\n🔗 <a href="${product.url}">VIEW PRODUCT</a>`;
    try {
        const fetch = (await import('node-fetch')).default;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: caption,
                parse_mode: 'HTML'
            })
        });
        console.log(`✅ Alert sent: ${product.name.substring(0, 30)}...`);
    } catch (error) {
        console.error('❌ Telegram failed:', error.message);
    }
}

async function tryWithProxy(proxy) {
    console.log(`🔄 Trying proxy: ${proxy}`);
    
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/google-chrome-stable',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            `--proxy-server=${proxy}`
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Randomize viewport
        await page.setViewport({
            width: 1920 + Math.floor(Math.random() * 100),
            height: 1080 + Math.floor(Math.random() * 100)
        });
        
        // Random user agent
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
        
        // Add extra headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        });
        
        console.log('📱 Loading page...');
        
        const response = await page.goto('https://www.sheinindia.in/c/sverse-5939-37961', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        console.log(`📊 Response status: ${response.status()}`);
        
        // Check page content
        const content = await page.content();
        if (content.includes('Access Denied') || content.includes('blocked')) {
            console.log('❌ Blocked with this proxy');
            return false;
        }
        
        console.log('✅ Success! Page loaded');
        
        // Wait for content
        await new Promise(r => setTimeout(r, 5000));
        
        // Take screenshot
        const screenshot = await page.screenshot({ fullPage: true });
        fs.writeFileSync('debug-screenshot.jpg', screenshot);
        
        // Save HTML
        const html = await page.content();
        fs.writeFileSync('debug-page.html', html);
        
        console.log('✅ Debug files saved');
        
        // Extract products
        const products = await page.evaluate(() => {
            const items = [];
            const productSelectors = [
                '.S-product-item',
                '.product-card',
                '.c-product-item',
                '[data-spm="product"]',
                '.product-list-item'
            ];
            
            let productElements = [];
            for (const selector of productSelectors) {
                const found = document.querySelectorAll(selector);
                if (found.length > 0) {
                    productElements = found;
                    break;
                }
            }
            
            productElements.forEach(el => {
                const link = el.querySelector('a[href*="/p-"]');
                if (!link) return;
                
                const href = link.getAttribute('href');
                const id = href?.match(/-p-(\d+)/)?.[1] || href;
                const img = el.querySelector('img');
                const name = img?.getAttribute('alt') || 'Product';
                const priceEl = el.querySelector('.price, [class*="price"]');
                const price = priceEl ? priceEl.innerText : 'Price N/A';
                
                items.push({
                    id,
                    name: name.substring(0, 50),
                    price,
                    url: href.startsWith('http') ? href : `https://www.sheinindia.in${href}`,
                    imageUrl: img?.src
                });
            });
            
            return items;
        });
        
        console.log(`📦 Found ${products.length} products`);
        
        if (products.length > 0) {
            const seen = loadSeenProducts();
            const newProducts = products.filter(p => p.id && !seen[p.id]);
            
            if (newProducts.length > 0) {
                console.log(`🎯 New products: ${newProducts.length}`);
                for (const product of newProducts.slice(0, 5)) {
                    await sendTelegramAlert(product);
                    seen[product.id] = Date.now();
                    await new Promise(r => setTimeout(r, 2000));
                }
                saveSeenProducts(seen);
            }
        }
        
        return true;
        
    } finally {
        await browser.close();
    }
}

async function runSniper() {
    console.log('🚀 Starting sniper with proxy rotation...', new Date().toLocaleString());
    
    // Try each proxy until one works
    for (const proxy of PROXY_LIST) {
        try {
            const success = await tryWithProxy(proxy);
            if (success) {
                console.log('✅ Successfully scraped with proxy');
                return;
            }
        } catch (error) {
            console.log(`❌ Proxy failed: ${error.message}`);
        }
        
        // Wait before trying next proxy
        await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('❌ All proxies failed');
}

runSniper();
