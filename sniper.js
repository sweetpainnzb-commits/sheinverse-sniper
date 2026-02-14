const puppeteer = require('puppeteer');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';

// Your Webshare proxies - FIXED FORMAT
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

// Parse proxy string into components
function parseProxy(proxyString) {
    const [ip, port, username, password] = proxyString.split(':');
    return { ip, port, username, password };
}

// Format proxy for Puppeteer
function formatProxyForPuppeteer(proxy) {
    // Puppeteer uses --proxy-server=http://IP:PORT
    return `http://${proxy.ip}:${proxy.port}`;
}

// Rotate through proxies
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
        console.log(`✅ Alert sent`);
    } catch (error) {
        console.error('❌ Telegram failed:', error.message);
    }
}

async function scrapeWithProxy(proxy) {
    console.log(`🔄 Trying proxy: ${proxy.ip}:${proxy.port}`);
    
    let browser;
    try {
        // Format proxy for Puppeteer
        const proxyUrl = formatProxyForPuppeteer(proxy);
        console.log(`📡 Proxy server: ${proxyUrl}`);
        
        // Launch browser with proxy
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
        
        // Authenticate with proxy
        await page.authenticate({
            username: proxy.username,
            password: proxy.password
        });
        
        // Randomize fingerprint
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
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });
        
        console.log('📱 Loading SHEINVERSE page...');
        
        const response = await page.goto('https://www.sheinindia.in/c/sverse-5939-37961', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        console.log(`📊 Response status: ${response.status()}`);
        
        // Check if blocked
        const content = await page.content();
        if (content.includes('Access Denied') || content.includes('blocked')) {
            console.log('❌ Blocked with this proxy');
            
            // Take screenshot of block page
            const screenshot = await page.screenshot({ fullPage: true });
            fs.writeFileSync(`blocked-${proxy.ip}.jpg`, screenshot);
            
            return false;
        }
        
        console.log('✅ Page loaded successfully');
        
        // Wait for content
        await new Promise(r => setTimeout(r, 5000));
        
        // Take screenshot
        const screenshot = await page.screenshot({ fullPage: true });
        fs.writeFileSync('debug-screenshot.jpg', screenshot);
        console.log('📸 Screenshot saved');
        
        // Save HTML
        const html = await page.content();
        fs.writeFileSync('debug-page.html', html);
        console.log('📄 HTML saved');
        
        // Extract products
        const products = await page.evaluate(() => {
            const items = [];
            const links = document.querySelectorAll('a[href*="/p-"]');
            
            links.forEach(link => {
                try {
                    const href = link.getAttribute('href');
                    const id = href?.match(/-p-(\d+)/)?.[1] || href;
                    
                    const container = link.closest('div') || link.parentElement;
                    const img = container?.querySelector('img');
                    
                    if (!img) return;
                    
                    const name = img.getAttribute('alt') || 'Shein Product';
                    
                    // Find price
                    let price = 'Price N/A';
                    const priceMatch = container?.innerText.match(/[₹]\s*([0-9,]+)/);
                    if (priceMatch) price = `₹${priceMatch[1]}`;
                    
                    // Get image URL
                    let imageUrl = img.getAttribute('src') || img.getAttribute('data-src');
                    if (imageUrl && imageUrl.startsWith('//')) {
                        imageUrl = 'https:' + imageUrl;
                    }
                    
                    // Build URL
                    const url = href.startsWith('http') ? href : `https://www.sheinindia.in${href}`;
                    
                    items.push({
                        id,
                        name: name.substring(0, 50),
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
        
        console.log(`📦 Found ${products.length} products`);
        
        if (products.length > 0) {
            const seen = loadSeenProducts();
            const newProducts = products.filter(p => p.id && !seen[p.id]);
            
            console.log(`📊 Previously seen: ${Object.keys(seen).length}`);
            console.log(`🎯 New products: ${newProducts.length}`);
            
            if (newProducts.length > 0) {
                for (const product of newProducts.slice(0, 5)) {
                    await sendTelegramAlert(product);
                    seen[product.id] = Date.now();
                    await new Promise(r => setTimeout(r, 2000));
                }
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
    console.log('🚀 Starting SHEINVERSE Sniper with Webshare proxies...', new Date().toLocaleString());
    console.log(`📡 Loaded ${WEBSHARE_PROXIES.length} proxies`);
    
    // Try each proxy
    for (let attempt = 0; attempt < WEBSHARE_PROXIES.length; attempt++) {
        const proxy = getNextProxy();
        console.log(`\n📡 Attempt ${attempt + 1}/${WEBSHARE_PROXIES.length}`);
        console.log(`📡 Using proxy: ${proxy.ip}:${proxy.port}`);
        
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
