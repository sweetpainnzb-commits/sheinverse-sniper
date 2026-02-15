/**
 * 🚀 SHEINVERSE SNIPER - PUPPETEER COOKIE GENERATION
 * Uses Puppeteer to get real Akamai cookies, then calls API
 */

const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1003320038050";
const SEEN_FILE = 'seen_products.json';
const COOKIES_FILE = 'cookies.json';

const API_URL = 'https://www.sheinindia.in/api/category/sverse-5939-37961';
const CATEGORY_PAGE = 'https://www.sheinindia.in/c/sverse-5939-37961';

const API_PARAMS = {
    fields: 'SITE',
    currentPage: '1',
    pageSize: '100',
    format: 'json',
    query: ':relevance',
    gridColumns: '2',
    advfilter: 'true',
    platform: 'Desktop',
    showAdsOnNextPage: 'false',
    is_ads_enable_plp: 'true',
    displayRatings: 'true',
    segmentIds: '',
    store: 'shein'
};

function loadSeenProducts() {
    try {
        if (fs.existsSync(SEEN_FILE)) {
            return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
        }
    } catch (e) {
        console.log('⚠️ Error loading seen products:', e.message);
    }
    return {};
}

function saveSeenProducts(seen) {
    try {
        fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
        console.log(`✅ Saved ${Object.keys(seen).length} products`);
    } catch (e) {
        console.log('❌ Error saving:', e.message);
    }
}

function loadCookies() {
    try {
        if (fs.existsSync(COOKIES_FILE)) {
            const data = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
            // Check if cookies are less than 2 hours old
            if (Date.now() - data.timestamp < 2 * 60 * 60 * 1000) {
                console.log('✅ Using cached cookies (age: ' + Math.round((Date.now() - data.timestamp) / 60000) + ' min)');
                return data.cookies;
            } else {
                console.log('⏰ Cached cookies expired');
            }
        }
    } catch (e) {
        console.log('⚠️ No valid cached cookies');
    }
    return null;
}

function saveCookies(cookies) {
    try {
        fs.writeFileSync(COOKIES_FILE, JSON.stringify({
            cookies: cookies,
            timestamp: Date.now()
        }, null, 2));
        console.log('💾 Cookies cached for 2 hours');
    } catch (e) {
        console.log('⚠️ Error saving cookies:', e.message);
    }
}

async function getFreshCookies() {
    console.log('🍪 Getting fresh cookies with Puppeteer...');
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        });
        
        const page = await browser.newPage();
        
        // Set realistic viewport
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('📄 Loading Shein category page...');
        
        // Navigate to the category page
        await page.goto(CATEGORY_PAGE, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        // Wait for Akamai bot protection to generate cookies
        console.log('⏳ Waiting for Akamai cookies to generate...');
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Get all cookies (including JS-generated Akamai ones!)
        const cookies = await page.cookies();
        
        await browser.close();
        
        if (cookies.length === 0) {
            console.log('❌ No cookies received');
            return null;
        }
        
        // Convert to cookie string
        const cookieString = cookies
            .map(c => `${c.name}=${c.value}`)
            .join('; ');
        
        // Show which important cookies we got
        const importantCookies = ['_abck', 'ak_bmsc', 'bm_sz', 'A', 'U'];
        const foundCookies = importantCookies.filter(name => 
            cookies.some(c => c.name === name)
        );
        
        console.log(`✅ Got ${cookies.length} cookies including: ${foundCookies.join(', ')}`);
        
        saveCookies(cookieString);
        return cookieString;
        
    } catch (error) {
        console.error('❌ Failed to get cookies:', error.message);
        if (browser) {
            await browser.close();
        }
        return null;
    }
}

async function sendTelegramAlert(product) {
    const caption = `🆕 <b>${product.name}</b>\n💰 ${product.price} 🔥 NEW DROP\n🔗 <a href="${product.url}">VIEW NOW</a>`;
    
    try {
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHAT_ID);
        formData.append('photo', product.imageUrl);
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
        
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: formData
        });
        
        console.log(`   📤 Alert sent: ${product.name.substring(0, 40)}...`);
    } catch (error) {
        console.error(`   ❌ Telegram failed: ${error.message}`);
    }
}

async function fetchSheinverseProducts(cookies) {
    console.log('🔍 Calling Shein API with cookies...');
    
    try {
        const url = new URL(API_URL);
        Object.keys(API_PARAMS).forEach(key => {
            url.searchParams.append(key, API_PARAMS[key]);
        });
        
        const headers = {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'DNT': '1',
            'Origin': 'https://www.sheinindia.in',
            'Pragma': 'no-cache',
            'Referer': 'https://www.sheinindia.in/c/sverse-5939-37961',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'X-TENANT-ID': 'SHEIN',
            'Cookie': cookies
        };
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: headers
        });
        
        console.log(`📡 API response: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.products || !Array.isArray(data.products)) {
            console.log('⚠️ Unexpected response structure');
            return [];
        }
        
        console.log(`✅ API returned ${data.products.length} products`);
        if (data.pagination) {
            console.log(`📊 Total in category: ${data.pagination.totalResults}`);
        }
        
        const products = data.products.map(p => ({
            id: p.code,
            name: (p.name || '').replace(/Shein\s*/i, '').trim(),
            price: p.offerPrice?.displayformattedValue || p.price?.displayformattedValue || 'N/A',
            url: 'https://www.sheinindia.in' + p.url,
            imageUrl: p.images?.[0]?.url || ''
        }));
        
        return products;
        
    } catch (error) {
        console.error('❌ API fetch failed:', error.message);
        return [];
    }
}

async function runSniper() {
    console.log('\n🚀 ========================================');
    console.log('   SHEINVERSE SNIPER - PUPPETEER COOKIES');
    console.log('   ========================================\n');
    console.log(`📅 ${new Date().toLocaleString()}\n`);
    
    // Try to load cached cookies first
    let cookies = loadCookies();
    
    // If no cached cookies or expired, get fresh ones with Puppeteer
    if (!cookies) {
        cookies = await getFreshCookies();
        if (!cookies) {
            console.log('❌ Failed to get cookies, cannot proceed');
            return;
        }
    }
    
    const allProducts = await fetchSheinverseProducts(cookies);
    
    // If 403, cookies might be invalid - refresh them
    if (allProducts.length === 0) {
        console.log('🔄 API failed, refreshing cookies...');
        cookies = await getFreshCookies();
        if (cookies) {
            const retryProducts = await fetchSheinverseProducts(cookies);
            if (retryProducts.length > 0) {
                allProducts.push(...retryProducts);
            }
        }
    }
    
    if (allProducts.length === 0) {
        console.log('❌ No products found');
        return;
    }
    
    console.log(`\n📦 Successfully fetched ${allProducts.length} products`);
    
    const seen = loadSeenProducts();
    console.log(`📂 Previously seen: ${Object.keys(seen).length}`);
    
    const newProducts = allProducts.filter(p => p.id && !seen[p.id]);
    console.log(`🆕 NEW products: ${newProducts.length}\n`);
    
    if (newProducts.length > 0) {
        console.log('📢 Sending alerts...\n');
        
        for (let i = 0; i < newProducts.length; i++) {
            const product = newProducts[i];
            console.log(`${i + 1}. ${product.name.substring(0, 40)}... - ${product.price}`);
            
            await sendTelegramAlert(product);
            seen[product.id] = Date.now();
            await new Promise(r => setTimeout(r, 1000));
        }
        
        saveSeenProducts(seen);
        console.log(`\n✅ Successfully alerted ${newProducts.length} new products!`);
        
    } else {
        allProducts.forEach(p => {
            if (!seen[p.id]) seen[p.id] = Date.now();
        });
        saveSeenProducts(seen);
        console.log('😴 No new products this round');
    }
    
    console.log('\n✅ Run complete!');
    console.log('========================================\n');
}

runSniper().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});
