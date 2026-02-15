/**
 * 🚀 SHEINVERSE SNIPER - COMPLETE WORKING VERSION
 * Scans Men's SHEINVERSE and sends Telegram alerts
 */

import puppeteer from 'puppeteer';
import fs from 'fs';

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';

// Men's SHEINVERSE URL
const TARGET_URL = 'https://www.sheinindia.in/c/sverse-5939-37961?query=%3Arelevance%3Agenderfilter%3AMen&gridColumns=2&segmentIds=23%2C17%2C18%2C9&customerType=Existing&includeUnratedProducts=false';

// Load previously seen products
function loadSeenProducts() {
    try {
        if (fs.existsSync(SEEN_FILE)) {
            const data = fs.readFileSync(SEEN_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log('⚠️ Error loading seen products:', e.message);
    }
    console.log('📂 No seen_products.json found - first run');
    return {};
}

// Save seen products
function saveSeenProducts(seen) {
    try {
        fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
        console.log(`✅ Saved ${Object.keys(seen).length} products to seen_products.json`);
    } catch (e) {
        console.log('❌ Error saving:', e.message);
    }
}

// Send alert to Telegram
async function sendTelegramAlert(product) {
    const caption = `🆕 <b>${product.name}</b>\n💰 ${product.price}\n🔗 <a href="${product.url}">VIEW PRODUCT</a>`;
    
    try {
        // Dynamically import fetch (ES module)
        const fetch = (await import('node-fetch')).default;
        
        // Try to send with image
        if (product.imageUrl) {
            const FormData = (await import('form-data')).default;
            const formData = new FormData();
            formData.append('chat_id', TELEGRAM_CHAT_ID);
            formData.append('photo', product.imageUrl);
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
            
            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                console.log(`   ✅ Alert sent: ${product.name.substring(0, 30)}...`);
                return;
            }
        }
        
        // Fallback to text only
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: caption,
                parse_mode: 'HTML'
            })
        });
        console.log(`   ✅ Text alert sent: ${product.name.substring(0, 30)}...`);
        
    } catch (error) {
        console.error(`   ❌ Telegram failed: ${error.message}`);
    }
}

// Main scraping function
async function scrapeSheinverse() {
    console.log('\n🚀 ========================================');
    console.log('   SHEINVERSE SNIPER');
    console.log('   ========================================\n');
    console.log(`📅 ${new Date().toLocaleString()}`);
    console.log(`🎯 Target: Men\'s SHEINVERSE\n`);
    
    let browser;
    try {
        console.log('🌐 Launching browser...');
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        
        // Set viewport
        await page.setViewport({ width: 1280, height: 800 });
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('📱 Loading SHEINVERSE page...');
        
        // Navigate to page
        await page.goto(TARGET_URL, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        console.log('✅ Page loaded, waiting for products...');
        
        // Wait for products to load
        await page.waitForSelector('.item.rilrtl-products-list__item', { timeout: 10000 });
        
        console.log('📜 Scrolling to load products...');
        
        // Scroll to load more products
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => window.scrollBy(0, 800));
            console.log(`   Scroll ${i + 1}/5`);
            await new Promise(r => setTimeout(r, 1000));
        }
        
        // Wait for lazy-loaded images
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('🔍 Extracting products...');
        
        // Extract product data
        const products = await page.evaluate(() => {
            const items = [];
            const productElements = document.querySelectorAll('.item.rilrtl-products-list__item');
            
            console.log(`Found ${productElements.length} product elements`);
            
            productElements.forEach((element) => {
                try {
                    // Find product link
                    const link = element.querySelector('a.rilrtl-products-list__link');
                    if (!link) return;
                    
                    const href = link.getAttribute('href');
                    const id = href?.match(/-p-(\d+)/)?.[1] || href;
                    
                    // Find image
                    const img = element.querySelector('img');
                    if (!img) return;
                    
                    // Get product name
                    let name = img.getAttribute('alt') || "Shein Product";
                    name = name.replace(/Shein\s*/i, '').trim();
                    if (name.length > 50) name = name.substring(0, 47) + '...';
                    
                    // Get price
                    let price = "Price N/A";
                    const priceElement = element.querySelector('.price strong, .offer-pricess, [class*="price"]');
                    if (priceElement) {
                        price = priceElement.innerText.trim();
                        if (!price.includes('₹')) price = '₹' + price;
                    } else {
                        const text = element.innerText;
                        const match = text.match(/₹\s*([0-9,]+)/);
                        if (match) price = `₹${match[1]}`;
                    }
                    
                    // Get image URL
                    let imageUrl = img.getAttribute('src') || img.getAttribute('data-src');
                    if (imageUrl) {
                        if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
                        else if (imageUrl.startsWith('/')) imageUrl = 'https://www.sheinindia.in' + imageUrl;
                        // Get higher quality image
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
        
        console.log(`\n📦 Found ${products.length} products total`);
        
        if (products.length === 0) {
            console.log('⚠️ No products found!');
            return;
        }
        
        // Load seen products
        const seen = loadSeenProducts();
        console.log(`📂 Previously seen: ${Object.keys(seen).length}`);
        
        // Find new products
        const newProducts = products.filter(p => p.id && !seen[p.id]);
        console.log(`🆕 NEW products found: ${newProducts.length}`);
        
        // Send alerts for new products
        if (newProducts.length > 0) {
            console.log('\n📢 Sending alerts...\n');
            
            // Limit to 10 per run to avoid rate limiting
            const alertsToSend = newProducts.slice(0, 10);
            
            for (let i = 0; i < alertsToSend.length; i++) {
                const product = alertsToSend[i];
                console.log(`${i + 1}/${alertsToSend.length}: ${product.name.substring(0, 40)}... - ${product.price}`);
                
                await sendTelegramAlert(product);
                
                // Mark as seen
                seen[product.id] = Date.now();
                
                // Small delay between alerts
                await new Promise(r => setTimeout(r, 1500));
            }
            
            // Mark remaining products as seen (without alerting)
            if (newProducts.length > 10) {
                console.log(`\n⏭️ Marking ${newProducts.length - 10} more products as seen (no alerts)`);
                newProducts.slice(10).forEach(p => {
                    seen[p.id] = Date.now();
                });
            }
            
            // Save updated seen list
            saveSeenProducts(seen);
            console.log(`\n✅ Alerted ${alertsToSend.length} new products!`);
            
        } else {
            console.log('\n😴 No new products found');
        }
        
        console.log('\n✅ Run complete!');
        console.log('========================================\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (browser) await browser.close();
    }
}

// Run the sniper
scrapeSheinverse().catch(console.error);
