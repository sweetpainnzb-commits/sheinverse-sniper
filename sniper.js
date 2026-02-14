const puppeteer = require('puppeteer');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';

// Your Webshare proxies from the file
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

// Rotate through proxies
let currentProxyIndex = 0;
function getNextProxy() {
    const proxy = WEBSHARE_PROXIES[currentProxyIndex];
    currentProxyIndex = (currentProxyIndex + 1) % WEBSHARE_PROXIES.length;
    return proxy;
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
            console.log(`✅ Alert sent with image: ${product.name.substring(0, 30)}...`);
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
            console.log(`✅ Alert sent: ${product.name.substring(0, 30)}...`);
        }
    } catch (error) {
        console.error('❌ Telegram failed:', error.message);
    }
}

async function scrapeWithProxy(proxy) {
    console.log(`🔄 Trying proxy: ${proxy.substring(0, 30)}...`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
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

        const page = await browser.newPage();
        
        // Set realistic viewport
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Random user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Authenticate with proxy
        await page.authenticate({
            username: 'vtlrnieh',
            password: '3cl0gw8tlcsy'
        });
        
        console.log('📱 Loading SHEINVERSE page...');
        
        await page.goto('https://www.sheinindia.in/c/sverse-5939-37961', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        console.log('✅ Page loaded, waiting for data...');
        
        // Wait for the page to fully render
        await new Promise(r => setTimeout(r, 5000));
        
        // Extract products from the preloaded state (MOST RELIABLE METHOD)
        const products = await page.evaluate(() => {
            const items = [];
            
            // Check if preloaded state exists
            if (window.__PRELOADED_STATE__ && 
                window.__PRELOADED_STATE__.grid && 
                window.__PRELOADED_STATE__.grid.entities) {
                
                const entities = window.__PRELOADED_STATE__.grid.entities;
                
                // Loop through all product entities
                Object.keys(entities).forEach(key => {
                    try {
                        const product = entities[key];
                        if (product && product.name && product.url) {
                            // Get price (either offer price or original price)
                            let price = 'Price N/A';
                            if (product.offerPrice && product.offerPrice.displayformattedValue) {
                                price = product.offerPrice.displayformattedValue;
                            } else if (product.price && product.price.displayformattedValue) {
                                price = product.price.displayformattedValue;
                            }
                            
                            // Get image URL
                            let imageUrl = '';
                            if (product.images && product.images.length > 0) {
                                imageUrl = product.images[0].url;
                                if (imageUrl && !imageUrl.startsWith('http')) {
                                    imageUrl = 'https:' + imageUrl;
                                }
                            }
                            
                            // Extract ID from URL
                            const id = product.url.split('-p-')[1]?.split('_')[0] || 
                                      product.url.split('/p/')[1] || 
                                      key;
                            
                            // Build full URL
                            const url = product.url.startsWith('http') ? 
                                        product.url : 
                                        `https://www.sheinindia.in${product.url}`;
                            
                            items.push({
                                id: id,
                                name: product.name || 'Shein Product',
                                price: price,
                                url: url,
                                imageUrl: imageUrl
                            });
                        }
                    } catch (e) {
                        // Skip errors
                    }
                });
            }
            
            // If no products from preloaded state, try extracting from HTML
            if (items.length === 0) {
                // Look for product links
                const links = document.querySelectorAll('a[href*="/p-"], a[href*="-p-"]');
                
                links.forEach(link => {
                    try {
                        const href = link.getAttribute('href');
                        const id = href.match(/-p-(\d+)/)?.[1] || href;
                        
                        // Try to find product container
                        const container = link.closest('.item, .rilrtl-products-list__item, [class*="product"]');
                        if (!container) return;
                        
                        const img = container.querySelector('img');
                        if (!img) return;
                        
                        const name = img.getAttribute('alt') || 'Shein Product';
                        
                        // Find price
                        let price = 'Price N/A';
                        const priceEl = container.querySelector('.price, [class*="price"]');
                        if (priceEl) {
                            price = priceEl.innerText;
                        } else {
                            const match = container.innerText.match(/[₹]\s*([0-9,]+)/);
                            if (match) price = `₹${match[1]}`;
                        }
                        
                        // Get image URL
                        let imageUrl = img.getAttribute('src') || img.getAttribute('data-src');
                        if (imageUrl && imageUrl.startsWith('//')) {
                            imageUrl = 'https:' + imageUrl;
                        }
                        
                        // Build full URL
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
            }
            
            return items;
        });
        
        console.log(`📦 Found ${products.length} products`);
        
        if (products.length === 0) {
            console.log('⚠️ No products found! Taking screenshot...');
            const screenshot = await page.screenshot({ fullPage: true });
            fs.writeFileSync('debug-screenshot.jpg', screenshot);
            console.log('✅ Screenshot saved for debugging');
            return false;
        }
        
        const seen = loadSeenProducts();
        const newProducts = products.filter(p => p.id && !seen[p.id]);
        
        console.log(`📊 Previously seen: ${Object.keys(seen).length} products`);
        console.log(`🎯 New products found: ${newProducts.length}`);
        
        if (newProducts.length > 0) {
            console.log('📤 Sending Telegram alerts...');
            
            // Send first 5 products (avoid rate limiting)
            for (const product of newProducts.slice(0, 5)) {
                await sendTelegramAlert(product);
                seen[product.id] = Date.now();
                await new Promise(r => setTimeout(r, 2000));
            }
            
            if (newProducts.length > 5) {
                console.log(`   ... and ${newProducts.length - 5} more products`);
                // Mark remaining as seen without sending alerts
                newProducts.slice(5).forEach(p => {
                    seen[p.id] = Date.now();
                });
            }
            
            saveSeenProducts(seen);
        } else {
            console.log('❌ No new products found');
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
    console.log('🚀 Starting SHEINVERSE Sniper...', new Date().toLocaleString());
    console.log(`📡 Loaded ${WEBSHARE_PROXIES.length} proxies`);
    
    // Try each proxy until one works
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
