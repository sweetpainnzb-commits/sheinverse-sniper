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
    return {};
}

// --- SAVE SEEN PRODUCTS ---
function saveSeenProducts(seen) {
    fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

// --- SEND TELEGRAM ALERT ---
async function sendTelegramAlert(product) {
    const caption = `🆕 <b>${product.name}</b>
💰 ${product.price}
🔗 <a href="${product.url}">VIEW PRODUCT</a>`;

    try {
        const fetch = await import('node-fetch');
        
        if (product.imageUrl) {
            const formData = new FormData();
            formData.append('chat_id', TELEGRAM_CHAT_ID);
            formData.append('photo', product.imageUrl);
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
            
            await fetch.default(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
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
        }
        console.log('✅ Alert sent');
    } catch (error) {
        console.error('❌ Failed to send Telegram:', error.message);
    }
}

// --- MAIN SNIPER FUNCTION ---
async function runSniper() {
    console.log('🚀 Starting SHEINVERSE Sniper...', new Date().toLocaleString());
    
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 375, height: 812 });
        
        console.log('📱 Loading SHEINVERSE page...');
        await page.goto('https://www.sheinindia.in/c/sverse-5939-37961', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        console.log('📜 Scrolling to load products...');
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => window.scrollBy(0, 1800));
            await new Promise(r => setTimeout(r, 600));
        }
        
        console.log('🔍 Extracting products...');
        
        const products = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('a[href*="/p-"]').forEach(link => {
                const href = link.getAttribute('href');
                const id = href?.match(/-p-(\d+)/)?.[1] || href;
                
                const container = link.closest('div');
                if (!container) return;
                
                const imgEl = container.querySelector('img');
                if (!imgEl) return;
                
                let name = imgEl?.getAttribute('alt') || "Shein Product";
                name = name.substring(0, 50);
                
                // Extract price
                let price = "Price N/A";
                const priceMatch = container.innerText.match(/₹\s*([0-9,]+)/);
                if (priceMatch) price = `₹${priceMatch[1]}`;
                
                // Get image URL
                let imageUrl = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src');
                if (imageUrl) {
                    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                    else if (imageUrl.startsWith('/')) imageUrl = 'https://www.sheinindia.in' + imageUrl;
                }
                
                // Get product URL
                const url = href.startsWith('http') ? href : `https://www.sheinindia.in${href}`;
                
                items.push({
                    id,
                    name,
                    price,
                    url,
                    imageUrl
                });
            });
            return items;
        });
        
        console.log(`📦 Found ${products.length} products total`);
        
        const seen = loadSeenProducts();
        const newProducts = products.filter(p => p.id && !seen[p.id]);
        
        if (newProducts.length > 0) {
            console.log(`🎯 Found ${newProducts.length} NEW products!`);
            
            for (const product of newProducts.slice(0, 5)) {
                await sendTelegramAlert(product);
                seen[product.id] = Date.now();
                await new Promise(r => setTimeout(r, 1000));
            }
            
            saveSeenProducts(seen);
        } else {
            console.log('❌ No new products found');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
        console.log('🏁 Run completed');
    }
}

runSniper();
