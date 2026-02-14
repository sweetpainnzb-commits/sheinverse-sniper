const puppeteer = require('puppeteer');
const fs = require('fs');

// Your Telegram credentials
const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";

const SEEN_FILE = 'seen_products.json';

// --- LOAD SEEN PRODUCTS ---
function loadSeenProducts() {
    try {
        if (fs.existsSync(SEEN_FILE)) {
            const data = fs.readFileSync(SEEN_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log('No previous data, starting fresh');
    }
    console.log('📝 First run - will learn all products');
    return {};  // Empty object for first run
}

// --- SAVE SEEN PRODUCTS ---
function saveSeenProducts(seen) {
    fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
    console.log('✅ Seen products saved to file');
}

// --- SEND TELEGRAM ALERT ---
async function sendTelegramAlert(product) {
    const caption = `🆕 <b>${product.name}</b>\n💰 ${product.price}\n🔗 <a href="${product.url}">VIEW PRODUCT</a>`;

    try {
        const fetch = await import('node-fetch');
        
        if (product.imageUrl) {
            const formData = new FormData();
            formData.append('chat_id', TELEGRAM_CHAT_ID);
            formData.append('photo', product.imageUrl);
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
            
            const response = await fetch.default(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                console.log(`✅ Alert sent with image: ${product.name.substring(0, 30)}...`);
            } else {
                console.log(`⚠️ Image failed, sending text only for: ${product.name.substring(0, 30)}...`);
                // Fallback to text only
                await fetch.default(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: caption,
                        parse_mode: 'HTML'
                    })
                });
            }
        } else {
            await fetch.default(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: caption,
                    parse_mode: 'HTML'
                })
            });
            console.log(`✅ Alert sent (text only): ${product.name.substring(0, 30)}...`);
        }
    } catch (error) {
        console.error('❌ Failed to send Telegram:', error.message);
    }
}

// --- MAIN SNIPER FUNCTION ---
async function runSniper() {
    console.log('🚀 Starting SHEINVERSE Sniper...', new Date().toLocaleString());
    console.log('🔧 Node version:', process.version);
    
    let browser;
    try {
        // Launch browser with more options for GitHub environment
        console.log('🌐 Launching browser...');
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome-stable',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080'
            ]
        });

        const page = await browser.newPage();
        
        // Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.setViewport({ width: 1280, height: 800 });
        
        console.log('📱 Loading SHEINVERSE page...');
        
        // Navigate with longer timeout
        await page.goto('https://www.sheinindia.in/c/sverse-5939-37961', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        console.log('✅ Page loaded, waiting for content...');
        
        // Wait for products to load
        await page.waitForSelector('a[href*="/p-"]', { timeout: 30000 });
        
        console.log('📜 Scrolling to load more products...');
        
        // Scroll multiple times
        for (let i = 0; i < 8; i++) {
            await page.evaluate(() => window.scrollBy(0, 1000));
            console.log(`   Scroll ${i + 1}/8`);
            await new Promise(r => setTimeout(r, 1000));
        }
        
        // Small pause for lazy loading
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('🔍 Extracting products...');
        
        const products = await page.evaluate(() => {
            const items = [];
            const links = document.querySelectorAll('a[href*="/p-"]');
            
            console.log(`Found ${links.length} product links`);
            
            links.forEach((link, index) => {
                try {
                    const href = link.getAttribute('href');
                    const id = href?.match(/-p-(\d+)/)?.[1] || href;
                    
                    const container = link.closest('div[class*="product"], div[class*="item"], div') || link.parentElement;
                    if (!container) return;
                    
                    const imgEl = container.querySelector('img');
                    if (!imgEl) return;
                    
                    // Get name
                    let name = imgEl?.getAttribute('alt') || "Shein Product";
                    name = name.replace(/Shop\s*|\s*\|\s*Shein India/i, '').trim();
                    if (name.length > 50) name = name.substring(0, 47) + '...';
                    
                    // Extract price
                    let price = "Price N/A";
                    const priceMatch = container.innerText.match(/₹\s*([0-9,]+)/);
                    if (priceMatch) price = `₹${priceMatch[1]}`;
                    
                    // Get image URL
                    let imageUrl = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src');
                    if (imageUrl) {
                        if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                        else if (imageUrl.startsWith('/')) imageUrl = 'https://www.sheinindia.in' + imageUrl;
                        // Clean up image URL
                        imageUrl = imageUrl.replace('_110x146', '_500x750').replace('_220x293', '_500x750');
                    }
                    
                    // Get product URL
                    const url = href.startsWith('http') ? href : `https://www.sheinindia.in${href}`;
                    
                    items.push({
                        id,
                        name,
                        price,
                        url,
                        imageUrl,
                        index
                    });
                } catch (e) {
                    console.log('Error parsing product:', e.message);
                }
            });
            
            return items;
        });
        
        console.log(`📦 Found ${products.length} products total`);
        
        if (products.length === 0) {
            console.log('⚠️ No products found! Page might have changed structure.');
            return;
        }
        
        const seen = loadSeenProducts();
        const newProducts = products.filter(p => p.id && !seen[p.id]);
        
        console.log(`📊 Previously seen: ${Object.keys(seen).length} products`);
        console.log(`🎯 New products found: ${newProducts.length}`);
        
        if (newProducts.length > 0) {
            console.log('📤 Sending Telegram alerts...');
            
            // Send first 10 products (to avoid rate limiting)
            const productsToSend = newProducts.slice(0, 10);
            for (const product of productsToSend) {
                console.log(`   Alerting: ${product.name}`);
                await sendTelegramAlert(product);
                seen[product.id] = Date.now();
                await new Promise(r => setTimeout(r, 2000)); // 2 second delay between messages
            }
            
            if (newProducts.length > 10) {
                console.log(`   ... and ${newProducts.length - 10} more products (will alert next run)`);
                // Still mark them as seen to avoid re-alerting
                newProducts.slice(10).forEach(p => {
                    seen[p.id] = Date.now();
                });
            }
            
            saveSeenProducts(seen);
            console.log('✅ Seen products saved');
        } else {
            console.log('❌ No new products found');
        }
        
    } catch (error) {
        console.error('❌ Error in runSniper:', error.message);
        console.error(error.stack);
    } finally {
        if (browser) {
            await browser.close();
            console.log('🏁 Browser closed');
        }
        console.log('🏁 Run completed at', new Date().toLocaleString());
    }
}

// Run the sniper
runSniper().catch(console.error);
