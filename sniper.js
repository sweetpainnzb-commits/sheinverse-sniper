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
    return {};
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
            console.log(`✅ Alert sent: ${product.name.substring(0, 30)}...`);
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
        console.error('❌ Failed to send Telegram:', error.message);
    }
}

// --- MAIN SNIPER FUNCTION ---
async function runSniper() {
    console.log('🚀 Starting SHEINVERSE Sniper...', new Date().toLocaleString());
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome-stable',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        console.log('📱 Loading SHEINVERSE page...');
        await page.goto('https://www.sheinindia.in/c/sverse-5939-37961', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        await page.waitForSelector('a[href*="/p-"]', { timeout: 30000 });
        
        console.log('📜 Scrolling to load products...');
        for (let i = 0; i < 8; i++) {
            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(r => setTimeout(r, 1000));
        }
        
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('🔍 Extracting products...');
        
        const products = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('a[href*="/p-"]').forEach(link => {
                const href = link.getAttribute('href');
                const id = href?.match(/-p-(\d+)/)?.[1] || href;
                
                const container = link.closest('div') || link.parentElement;
                if (!container) return;
                
                const imgEl = container.querySelector('img');
                if (!imgEl) return;
                
                let name = imgEl?.getAttribute('alt') || "Shein Product";
                name = name.substring(0, 50);
                
                let price = "Price N/A";
                const priceMatch = container.innerText.match(/₹\s*([0-9,]+)/);
                if (priceMatch) price = `₹${priceMatch[1]}`;
                
                let imageUrl = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src');
                if (imageUrl) {
                    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                    else if (imageUrl.startsWith('/')) imageUrl = 'https://www.sheinindia.in' + imageUrl;
                }
                
                const url = href.startsWith('http') ? href : `https://www.sheinindia.in${href}`;
                
                items.push({ id, name, price, url, imageUrl });
            });
            return items;
        });
        
        console.log(`📦 Found ${products.length} products`);
        
        const seen = loadSeenProducts();
        const newProducts = products.filter(p => p.id && !seen[p.id]);
        
        console.log(`🎯 New products: ${newProducts.length}`);
        
        if (newProducts.length > 0) {
            for (const product of newProducts.slice(0, 10)) {
                await sendTelegramAlert(product);
                seen[product.id] = Date.now();
                await new Promise(r => setTimeout(r, 2000));
            }
            saveSeenProducts(seen);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (browser) await browser.close();
        console.log('🏁 Run completed');
    }
}

runSniper();
