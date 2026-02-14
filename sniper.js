const puppeteer = require('puppeteer');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';

// Your Webshare proxies that worked
const WEBSHARE_PROXIES = [
    'http://vtlrnieh:3cl0gw8tlcsy@31.59.20.176:6754',
    'http://vtlrnieh:3cl0gw8tlcsy@23.95.150.145:6114',
    'http://vtlrnieh:3cl0gw8tlcsy@198.23.239.134:6540',
    'http://vtlrnieh:3cl0gw8tlcsy@45.38.107.97:6014',
    'http://vtlrnieh:3cl0gw8tlcsy@107.172.163.27:6543',
    'http://vtlrnieh:3cl0gw8tlcsy@198.105.121.200:6462',
    'http://vtlrnieh:3cl0gw8tlcsy@64.137.96.74:6641',
    'http://vtlrnieh:3cl0gw8tlcsy@216.10.27.159:6837',
    'http://vtlrnieh:3cl0gw8tlcsy@23.26.71.145:5628',
    'http://vtlrnieh:3cl0gw8tlcsy@23.229.19.94:8689'
];

// Simple rotation
let currentProxyIndex = 0;
function getNextProxy() {
    return WEBSHARE_PROXIES[currentProxyIndex++ % WEBSHARE_PROXIES.length];
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
        console.error('❌ Telegram failed:', error.message);
    }
}

async function runSniper() {
    console.log('🚀 Starting SHEINVERSE Sniper...', new Date().toLocaleString());
    
    const proxy = getNextProxy();
    console.log(`📡 Using proxy: ${proxy.substring(0, 30)}...`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome-stable',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                `--proxy-server=${proxy}`
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('📱 Loading SHEINVERSE page...');
        
        await page.goto('https://www.sheinindia.in/c/sverse-5939-37961', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        console.log('✅ Page loaded');
        
        await new Promise(r => setTimeout(r, 5000));
        
        // Extract products from preloaded state
        const products = await page.evaluate(() => {
            const items = [];
            
            if (window.__PRELOADED_STATE__?.grid?.entities) {
                Object.values(window.__PRELOADED_STATE__.grid.entities).forEach(product => {
                    if (product?.name && product?.url) {
                        items.push({
                            id: product.url.split('-p-')[1]?.split('_')[0] || Date.now(),
                            name: product.name,
                            price: product.offerPrice?.displayformattedValue || 
                                   product.price?.displayformattedValue || 
                                   'Price N/A',
                            url: product.url.startsWith('http') ? 
                                 product.url : 
                                 `https://www.sheinindia.in${product.url}`,
                            imageUrl: product.images?.[0]?.url ? 
                                     'https:' + product.images[0].url : 
                                     null
                        });
                    }
                });
            }
            
            return items;
        });
        
        console.log(`📦 Found ${products.length} products`);
        
        if (products.length > 0) {
            const seen = loadSeenProducts();
            const newProducts = products.filter(p => p.id && !seen[p.id]);
            
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
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    } finally {
        if (browser) await browser.close();
    }
}

runSniper();
