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
        
        console.log('✅ Page loaded, waiting for content...');
        
        // Wait for any product-related elements to load
        await page.waitForFunction(() => {
            return document.querySelectorAll('img').length > 10;
        }, { timeout: 30000 });
        
        console.log('📜 Scrolling to load products...');
        
        // Scroll multiple times
        for (let i = 0; i < 10; i++) {
            await page.evaluate(() => window.scrollBy(0, 1000));
            console.log(`   Scroll ${i + 1}/10`);
            await new Promise(r => setTimeout(r, 1500));
        }
        
        // Scroll back to top
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('🔍 Extracting products with multiple methods...');
        
        // Method 1: Try multiple selectors
        const products = await page.evaluate(() => {
            const items = [];
            
            // Try different possible product selectors
            const selectors = [
                'a[href*="/p-"]',
                'a[href*="-p-"]',
                '.product-card a',
                '.item a',
                '[class*="product"] a[href]',
                '[class*="item"] a[href]'
            ];
            
            let links = [];
            for (const selector of selectors) {
                const found = document.querySelectorAll(selector);
                if (found.length > 0) {
                    console.log(`Found ${found.length} links with selector: ${selector}`);
                    links = found;
                    break;
                }
            }
            
            if (links.length === 0) {
                // Last resort: look for any link with image
                links = document.querySelectorAll('a');
            }
            
            links.forEach((link) => {
                try {
                    const href = link.getAttribute('href');
                    if (!href || (!href.includes('/p-') && !href.includes('-p-'))) return;
                    
                    const id = href.match(/-p-(\d+)/)?.[1] || href;
                    
                    // Try to find the product container
                    const container = link.closest('div[class*="product"], div[class*="item"], li[class*="product"], div') || link.parentElement;
                    if (!container) return;
                    
                    // Find image
                    const imgEl = container.querySelector('img') || link.querySelector('img');
                    if (!imgEl) return;
                    
                    // Get product name
                    let name = imgEl.getAttribute('alt') || 
                              container.innerText.split('\n')[0] || 
                              "Shein Product";
                    name = name.replace(/Shop\s*|\s*\|\s*Shein India/i, '').trim();
                    if (name.length > 50) name = name.substring(0, 47) + '...';
                    
                    // Extract price
                    let price = "Price N/A";
                    const priceMatch = container.innerText.match(/[₹]\s*([0-9,]+)/);
                    if (priceMatch) price = `₹${priceMatch[1]}`;
                    
                    // Get image URL
                    let imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src');
                    if (imageUrl) {
                        if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                        else if (imageUrl.startsWith('/')) imageUrl = 'https://www.sheinindia.in' + imageUrl;
                        imageUrl = imageUrl.replace(/_\d+x\d+/, '_500x750');
                    }
                    
                    // Build full URL
                    const url = href.startsWith('http') ? href : `https://www.sheinindia.in${href}`;
                    
                    items.push({
                        id,
                        name,
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
        
        console.log(`📦 Found ${products.length} products total`);
        
        if (products.length === 0) {
            console.log('⚠️ No products found! Taking screenshot to debug...');
            await page.screenshot({ path: 'debug-screenshot.jpg', fullPage: true });
            
            // Upload screenshot as artifact
            fs.writeFileSync('debug-screenshot.jpg', await page.screenshot({ fullPage: true }));
            console.log('✅ Screenshot saved for debugging');
            return;
        }
        
        const seen = loadSeenProducts();
        const newProducts = products.filter(p => p.id && !seen[p.id]);
        
        console.log(`📊 Previously seen: ${Object.keys(seen).length} products`);
        console.log(`🎯 New products found: ${newProducts.length}`);
        
        if (newProducts.length > 0) {
            console.log('📤 Sending Telegram alerts...');
            
            for (const product of newProducts.slice(0, 5)) {
                console.log(`   Alerting: ${product.name}`);
                await sendTelegramAlert(product);
                seen[product.id] = Date.now();
                await new Promise(r => setTimeout(r, 2000));
            }
            
            if (newProducts.length > 5) {
                console.log(`   ... and ${newProducts.length - 5} more products`);
                newProducts.slice(5).forEach(p => {
                    seen[p.id] = Date.now();
                });
            }
            
            saveSeenProducts(seen);
        } else {
            console.log('❌ No new products found');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (browser) await browser.close();
        console.log('🏁 Run completed at', new Date().toLocaleString());
    }
}

runSniper();
