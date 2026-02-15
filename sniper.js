/**
 * 🚀 SHEINVERSE SNIPER - API VERSION WITH PROXIES
 * Uses Shein India API through Webshare proxies
 */

const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');
const fs = require('fs');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1003320038050";
const SEEN_FILE = 'seen_products.json';

// Webshare Proxies
const PROXIES = [
    '31.59.20.176:6754:vtlrnieh:3cl0gw8tlcsy',
    '185.199.117.226:6754:vtlrnieh:3cl0gw8tlcsy',
    '185.199.116.67:6754:vtlrnieh:3cl0gw8tlcsy',
    '185.130.226.167:6754:vtlrnieh:3cl0gw8tlcsy',
    '91.107.235.170:6754:vtlrnieh:3cl0gw8tlcsy',
    '185.199.115.186:6754:vtlrnieh:3cl0gw8tlcsy',
    '185.163.47.71:6754:vtlrnieh:3cl0gw8tlcsy',
    '194.59.214.243:6754:vtlrnieh:3cl0gw8tlcsy',
    '185.201.59.20:6754:vtlrnieh:3cl0gw8tlcsy',
    '185.201.60.142:6754:vtlrnieh:3cl0gw8tlcsy'
];

let currentProxyIndex = 0;

function getRandomProxy() {
    const proxy = PROXIES[currentProxyIndex];
    currentProxyIndex = (currentProxyIndex + 1) % PROXIES.length;
    const [ip, port, username, password] = proxy.split(':');
    return `http://${username}:${password}@${ip}:${port}`;
}

const API_URL = 'https://www.sheinindia.in/api/category/sverse-5939-37961';

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

const API_HEADERS = {
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
    'X-TENANT-ID': 'SHEIN'
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

async function fetchSheinverseProducts() {
    console.log('🔍 Calling Shein API through proxy...');
    
    try {
        const proxyUrl = getRandomProxy();
        const agent = new HttpsProxyAgent(proxyUrl);
        
        console.log(`🌐 Using proxy: ${proxyUrl.split('@')[1]}`);
        
        const url = new URL(API_URL);
        Object.keys(API_PARAMS).forEach(key => {
            url.searchParams.append(key, API_PARAMS[key]);
        });
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: API_HEADERS,
            agent: agent
        });
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.products || !Array.isArray(data.products)) {
            console.log('⚠️ Unexpected response');
            return [];
        }
        
        console.log(`✅ API returned ${data.products.length} products`);
        if (data.pagination) {
            console.log(`📊 Total: ${data.pagination.totalResults}`);
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
    console.log('\n🚀 SHEINVERSE API SNIPER WITH PROXIES\n');
    console.log(`📅 ${new Date().toLocaleString()}\n`);
    
    const allProducts = await fetchSheinverseProducts();
    
    if (allProducts.length === 0) {
        console.log('❌ No products found');
        return;
    }
    
    console.log(`📦 Fetched ${allProducts.length} products`);
    
    const seen = loadSeenProducts();
    console.log(`📂 Previously seen: ${Object.keys(seen).length}`);
    
    const newProducts = allProducts.filter(p => p.id && !seen[p.id]);
    console.log(`🆕 NEW products: ${newProducts.length}\n`);
    
    if (newProducts.length > 0) {
        for (let i = 0; i < newProducts.length; i++) {
            const product = newProducts[i];
            console.log(`${i + 1}. ${product.name.substring(0, 40)}... - ${product.price}`);
            
            await sendTelegramAlert(product);
            seen[product.id] = Date.now();
            await new Promise(r => setTimeout(r, 1000));
        }
        
        saveSeenProducts(seen);
        console.log(`\n✅ Alerted ${newProducts.length} new products!`);
        
    } else {
        allProducts.forEach(p => {
            if (!seen[p.id]) seen[p.id] = Date.now();
        });
        saveSeenProducts(seen);
        console.log('😴 No new products\n');
    }
}

runSniper().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});
