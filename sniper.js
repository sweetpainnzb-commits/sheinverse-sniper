/**
 * 🚀 SHEINVERSE SNIPER - REAL API VERSION
 * 
 * Uses Shein India's actual category API
 * - 100% FREE forever
 * - Runs every 60 seconds
 * - No proxies needed (API doesn't block like website does)
 * - Gets all products instantly in JSON format
 */

const fetch = require('node-fetch');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';

// Shein India Category API - Men's SHEINVERSE
const API_URL = 'https://www.sheinindia.in/api/category/sverse-5939-37961';

const API_PARAMS = {
    fields: 'SITE',
    currentPage: '1',
    pageSize: '100',  // Get up to 100 products per request
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

const API_HEADERS = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; sdk_gphone64_x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36',
    'X-TENANT-ID': 'SHEIN',
    'Referer': 'https://www.sheinindia.in/c/sverse-5939-37961'
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
        console.log(`✅ Saved ${Object.keys(seen).length} products to tracking`);
    } catch (e) {
        console.log('❌ Error saving:', e.message);
    }
}

async function sendTelegramAlert(product) {
    const caption = `🆕 <b>${product.name}</b>\n💰 ${product.price} 🔥 NEW DROP\n🔗 <a href="${product.url}">VIEW NOW</a>`;
    
    try {
        const FormData = (await import('form-data')).default;
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
        console.error(`   ❌ Telegram alert failed: ${error.message}`);
    }
}

async function fetchSheinverseProducts() {
    console.log('🔍 Calling Shein API...');
    
    try {
        // Build URL with query parameters
        const url = new URL(API_URL);
        Object.keys(API_PARAMS).forEach(key => {
            url.searchParams.append(key, API_PARAMS[key]);
        });
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: API_HEADERS
        });
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Extract products array
        if (!data.products || !Array.isArray(data.products)) {
            console.log('⚠️ Unexpected API response structure');
            console.log('Response keys:', Object.keys(data));
            return [];
        }
        
        console.log(`✅ API returned ${data.products.length} products`);
        if (data.pagination) {
            console.log(`📊 Total products in category: ${data.pagination.totalResults}`);
        }
        
        // Transform API response to our format
        const products = data.products.map(p => ({
            id: p.code,  // Product code (e.g., "443326049004")
            name: (p.name || '').replace(/Shein\s*/i, '').trim(),
            price: p.offerPrice?.displayformattedValue || p.price?.displayformattedValue || 'N/A',
            priceValue: p.offerPrice?.value || p.price?.value || 0,
            url: 'https://www.sheinindia.in' + p.url,
            imageUrl: p.images?.[0]?.url || '',
            rating: p.averageRating || null,
            ratingCount: p.ratingCount || null
        }));
        
        return products;
        
    } catch (error) {
        console.error('❌ API fetch failed:', error.message);
        return [];
    }
}

async function runSniper() {
    console.log('\n🚀 ========================================');
    console.log('   SHEINVERSE API SNIPER - EVERY MINUTE');
    console.log('   ========================================\n');
    console.log(`📅 ${new Date().toLocaleString()}`);
    console.log(`⚡ Using real Shein India API - 100% FREE!\n`);
    
    // Step 1: Fetch products from API
    const allProducts = await fetchSheinverseProducts();
    
    if (allProducts.length === 0) {
        console.log('❌ No products found or API error');
        return;
    }
    
    console.log(`📦 Fetched ${allProducts.length} products from API`);
    
    // Step 2: Load seen products
    const seen = loadSeenProducts();
    console.log(`📂 Previously seen: ${Object.keys(seen).length}`);
    
    // Step 3: Filter NEW products
    const newProducts = allProducts.filter(p => p.id && !seen[p.id]);
    console.log(`🆕 NEW products found: ${newProducts.length}`);
    
    // Step 4: Alert for new products
    if (newProducts.length > 0) {
        console.log('\n📢 Sending alerts...\n');
        
        for (let i = 0; i < newProducts.length; i++) {
            const product = newProducts[i];
            console.log(`${i + 1}/${newProducts.length}: ${product.name.substring(0, 40)}... - ${product.price}`);
            
            // Send Telegram alert
            await sendTelegramAlert(product);
            
            // Mark as seen
            seen[product.id] = Date.now();
            
            // Small delay between alerts
            await new Promise(r => setTimeout(r, 1000));
        }
        
        saveSeenProducts(seen);
        console.log(`\n✅ Alerted ${newProducts.length} new products!`);
        
    } else {
        // Mark all as seen (even if no new products)
        allProducts.forEach(p => {
            if (!seen[p.id]) seen[p.id] = Date.now();
        });
        saveSeenProducts(seen);
        
        console.log('\n😴 No new products this round');
    }
    
    console.log('\n✅ Run complete!');
    console.log('========================================\n');
}

runSniper().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});
