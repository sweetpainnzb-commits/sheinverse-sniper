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
                '--disable-dev-shm-usage',
                '--window-size=1920,1080'
            ]
        });

        const page = await browser.newPage();
        
        // Set desktop viewport
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Use desktop user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('📱 Loading SHEINVERSE page (desktop mode)...');
        
        // Go to page and wait for content
        await page.goto('https://www.sheinindia.in/c/sverse-5939-37961', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        console.log('✅ Page loaded, waiting for product grid...');
        
        // Wait for desktop-specific selectors
        await page.waitForFunction(() => {
            // Common desktop product grid selectors
            const selectors = [
                '.S-product-item',
                '.product-card',
                '.c-product-item',
                '[data-spm="product"]',
                '.product-list-item',
                '.goods-item'
            ];
            
            for (const selector of selectors) {
                if (document.querySelector(selector)) return true;
            }
            return document.querySelectorAll('img').length > 20;
        }, { timeout: 30000 });
        
        console.log('📜 Scrolling to load more products...');
        
        // Scroll multiple times for desktop infinite scroll
        for (let i = 0; i < 15; i++) {
            await page.evaluate(() => {
                window.scrollBy(0, 500);
            });
            console.log(`   Scroll ${i + 1}/15`);
            await new Promise(r => setTimeout(r, 1000));
        }
        
        // Wait for any lazy-loaded images
        await new Promise(r => setTimeout(r, 3000));
        
        console.log('🔍 Extracting products...');
        
        // Extract products using desktop-specific selectors
        const products = await page.evaluate(() => {
            const items = [];
            
            // Try multiple desktop selectors
            const productSelectors = [
                '.S-product-item',
                '.product-card',
                '.c-product-item',
                '[data-spm="product"]',
                '.product-list-item',
                '.goods-item',
                '.product-item'
            ];
            
            let productElements = [];
            for (const selector of productSelectors) {
                const found = document.querySelectorAll(selector);
                if (found.length > 0) {
                    console.log(`Found ${found.length} products with selector: ${selector}`);
                    productElements = found;
                    break;
                }
            }
            
            // If no specific product elements found, look for links with product patterns
            if (productElements.length === 0) {
                const links = document.querySelectorAll('a[href*="/p-"], a[href*="-p-"]');
                links.forEach(link => {
                    const container = link.closest('div[class*="product"], div[class*="item"]') || link.parentElement;
                    if (container) productElements.push(container);
                });
            }
            
            productElements.forEach((element, index) => {
                try {
                    // Find product link
                    const link = element.querySelector('a[href*="/p-"], a[href*="-p-"]');
                    if (!link) return;
                    
                    const href = link.getAttribute('href');
                    const id = href.match(/-p-(\d+)/)?.[1] || href;
                    
                    // Find image
                    const img = element.querySelector('img');
                    if (!img) return;
                    
                    // Get name
                    let name = img.getAttribute('alt') || 
                              element.innerText.split('\n')[0] || 
                              "Shein Product";
                    name = name.replace(/Shop\s*|\s*\|\s*Shein India/i, '').trim();
                    if (name.length > 60) name = name.substring(0, 57) + '...';
                    
                    // Get price - desktop often has different price structure
                    let price = "Price N/A";
                    const priceElement = element.querySelector('.price, [class*="price"], .S-price, .product-price');
                    if (priceElement) {
                        const priceText = priceElement.innerText;
                        const match = priceText.match(/[₹]\s*([0-9,]+)/);
                        if (match) price = `₹${match[1]}`;
                    } else {
                        const textMatch = element.innerText.match(/[₹]\s*([0-9,]+)/);
                        if (textMatch) price = `₹${textMatch[1]}`;
                    }
                    
                    // Get image URL
                    let imageUrl = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
                    if (imageUrl) {
                        if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                        else if (imageUrl.startsWith('/')) imageUrl = 'https://www.sheinindia.in' + imageUrl;
                        // Clean up URL for better quality
                        imageUrl = imageUrl.replace(/_\d+x\d+/, '_1000x1500');
                    }
                    
                    // Build full URL
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
                    // Skip errors
                }
            });
            
            return items;
        });
        
        console.log(`📦 Found ${products.length} products total`);
        
        if (products.length === 0) {
            console.log('⚠️ No products found! Taking screenshot...');
            const screenshot = await page.screenshot({ fullPage: true, path: 'debug-screenshot.jpg' });
            fs.writeFileSync('debug-screenshot.jpg', screenshot);
            console.log('✅ Screenshot saved as debug-screenshot.jpg');
            
            // Also save page HTML for debugging
            const html = await page.content();
            fs.writeFileSync('debug-page.html', html);
            console.log('✅ Page HTML saved');
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
        console.error(error.stack);
    } finally {
        if (browser) await browser.close();
        console.log('🏁 Run completed at', new Date().toLocaleString());
    }
}

runSniper();
