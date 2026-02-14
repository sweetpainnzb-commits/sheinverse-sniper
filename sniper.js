const puppeteer = require('puppeteer');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';

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
    console.log('✅ Seen products saved');
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

async function runSniper() {
    console.log('🚀 Starting...', new Date().toLocaleString());
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome-stable',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('📱 Loading page...');
        await page.goto('https://www.sheinindia.in/c/sverse-5939-37961', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // Wait for page to settle
        await new Promise(r => setTimeout(r, 5000));
        
        // Take screenshot (ALWAYS save this)
        console.log('📸 Taking screenshot...');
        const screenshot = await page.screenshot({ fullPage: true });
        fs.writeFileSync('debug-screenshot.jpg', screenshot);
        console.log('✅ Screenshot saved');
        
        // Save HTML (ALWAYS save this)
        console.log('📄 Saving page HTML...');
        const html = await page.content();
        fs.writeFileSync('debug-page.html', html);
        console.log('✅ HTML saved');
        
        // Also save a simple text file to verify artifacts work
        fs.writeFileSync('debug-info.txt', `Run at: ${new Date().toISOString()}\nURL: ${page.url()}`);
        
        // Try to find products
        const productCount = await page.evaluate(() => {
            return document.querySelectorAll('a[href*="/p-"], img').length;
        });
        console.log(`📊 Found approximately ${productCount} potential product elements`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        // Even on error, try to save screenshot
        if (browser) {
            try {
                const page = (await browser.pages())[0];
                if (page) {
                    const screenshot = await page.screenshot({ fullPage: true });
                    fs.writeFileSync('debug-screenshot.jpg', screenshot);
                    fs.writeFileSync('debug-error.txt', error.message);
                }
            } catch (e) {}
        }
    } finally {
        if (browser) await browser.close();
        console.log('🏁 Run completed');
        
        // List files created
        console.log('📁 Files created:');
        const files = fs.readdirSync('.');
        files.forEach(f => console.log(`   - ${f}`));
    }
}

runSniper();
