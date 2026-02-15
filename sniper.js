/**
 * 🚀 SHEINVERSE SNIPER - PUBLIC API VERSION
 * Uses public endpoints that don't need cookies
 */

import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';

// Try different API endpoints (public)
const API_ENDPOINTS = [
    'https://www.sheinindia.in/api/category/sverse-5939-37961',
    'https://www.sheinindia.in/api/category/sverse-5939-37961/products',
    'https://www.sheinindia.in/api/products/list',
    'https://www.sheinindia.in/api/search'
];

const API_PARAMS = {
    fields: 'SITE',
    currentPage: '1',
    pageSize: '100',
    format: 'json',
    query: ':relevance',
    gridColumns: '2',
    store: 'shein'
};

const API_HEADERS = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-TENANT-ID': 'SHEIN'
};

function loadSeenProducts() {
    try {
        if (fs.existsSync(SEEN_FILE)) {
            const data = fs.readFileSync(SEEN_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log('⚠️ Error loading seen products:', e.message);
    }
    console.log('📂 No seen_products.json file found - first run');
    return {};
}

function saveSeenProducts(seen) {
    try {
        fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
        console.log(`✅ Saved ${Object.keys(seen).length} products to seen_products.json`);
    } catch (e) {
        console.log('❌ Error saving:', e.message);
    }
}

async function sendTelegramAlert(product) {
    const caption = `🆕 <b>${product.name}</b>\n💰 ${product.price}\n🔗 <a href="${product.url}">VIEW PRODUCT</a>`;
    
    try {
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
        
        // Fallback to text-only
        try {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: caption,
                    parse_mode: 'HTML'
                })
            });
            console.log(`   📤 Text alert sent: ${product.name.substring(0, 40)}...`);
        } catch (e) {}
    }
}

async function fetchProducts() {
    console.log('🔍 Trying different API endpoints...');
    
    // Try each endpoint until one works
    for (const endpoint of API_ENDPOINTS) {
        try {
            console.log(`\n📡 Trying: ${endpoint}`);
            
            const url = new URL(endpoint);
            Object.keys(API_PARAMS).forEach(key => {
                url.searchParams.append(key, API_PARAMS[key]);
            });
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: API_HEADERS
            });
            
            console.log(`📊 Response status: ${response.status}`);
            
            if (response.ok) {
                const data = await response.json();
                
                // Try to extract products from different response structures
                let products = [];
                
                if (data.products && Array.isArray(data.products)) {
                    products = data.products;
                } else if (data.data && Array.isArray(data.data)) {
                    products = data.data;
                } else if (data.items && Array.isArray(data.items)) {
                    products = data.items;
                } else if (data.result && Array.isArray(data.result)) {
                    products = data.result;
                }
                
                if (products.length > 0) {
                    console.log(`✅ Success! Found ${products.length} products`);
                    
                    return products.map(p => ({
                        id: p.code || p.id || p.productId,
                        name: (p.name || p.title || '').replace(/Shein\s*/i, '').trim(),
                        price: p.offerPrice?.displayformattedValue || p.price?.displayformattedValue || p.price || 'N/A',
                        url: p.url ? 'https://www.sheinindia.in' + p.url : `https://www.sheinindia.in/p/${p.code || p.id}`,
                        imageUrl: p.images?.[0]?.url || p.image || '',
                    }));
                }
            }
        } catch (error) {
            console.log(`❌ Failed: ${error.message}`);
        }
    }
    
    // If all API attempts fail, fall back to scraping the webpage
    console.log('\n⚠️ All APIs failed, trying to scrape webpage...');
    return await scrapeWebpage();
}

async function scrapeWebpage() {
    try {
        const response = await fetch('https://www.sheinindia.in/c/sverse-5939-37961', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const html = await response.text();
        
        // Look for JSON data in the HTML (often in __PRELOADED_STATE__)
        const preloadedStateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({.+?});/);
        
        if (preloadedStateMatch) {
            try {
                const data = JSON.parse(preloadedStateMatch[1]);
                
                // Extract products from various possible locations
                let products = [];
                
                if (data.products?.products) {
                    products = data.products.products;
                } else if (data.products?.results) {
                    const productIds = data.products.results;
                    products = productIds.map(id => data.products.entities?.[id]).filter(Boolean);
                } else if (data.grid?.entities) {
                    products = Object.values(data.grid.entities);
                }
                
                if (products.length > 0) {
                    console.log(`✅ Extracted ${products.length} products from page data`);
                    
                    return products.map(p => ({
                        id: p.code || p.id,
                        name: (p.name || '').replace(/Shein\s*/i, '').trim(),
                        price: p.offerPrice?.displayformattedValue || p.price?.displayformattedValue || 'N/A',
                        url: p.url ? 'https://www.sheinindia.in' + p.url : `https://www.sheinindia.in/p/${p.code || p.id}`,
                        imageUrl: p.images?.[0]?.url || p.imageUrl || '',
                    }));
                }
            } catch (e) {
                console.log('❌ Failed to parse preloaded state:', e.message);
            }
        }
        
        // Simple regex fallback
        const productMatches = html.matchAll(/<a[^>]*href="([^"]*\/p\/[^"]*)"[^>]*>[\s\S]*?<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>[\s\S]*?₹([0-9,]+)/g);
        
        const products = [];
        for (const match of productMatches) {
            products.push({
                id: match[1].split('/p/')[1] || match[1],
                name: match[2].replace(/Shein\s*/i, '').trim().substring(0, 50),
                price: `₹${match[4]}`,
                url: match[1].startsWith('http') ? match[1] : 'https://www.sheinindia.in' + match[1],
                imageUrl: match[3].startsWith('http') ? match[3] : 'https:' + match[3],
            });
        }
        
        if (products.length > 0) {
            console.log(`✅ Extracted ${products.length} products via regex`);
            return products;
        }
        
        return [];
        
    } catch (error) {
        console.error('❌ Webpage scrape failed:', error.message);
        return [];
    }
}

async function runSniper() {
    console.log('\n🚀 ========================================');
    console.log('   SHEINVERSE SNIPER - PUBLIC VERSION');
    console.log('   ========================================\n');
    console.log(`📅 ${new Date().toLocaleString()}`);
    
    const allProducts = await fetchProducts();
    
    if (allProducts.length === 0) {
        console.log('❌ No products found');
        return;
    }
    
    console.log(`\n📦 Total products found: ${allProducts.length}`);
    
    const seen = loadSeenProducts();
    console.log(`📂 Previously seen: ${Object.keys(seen).length}`);
    
    const newProducts = allProducts.filter(p => p.id && !seen[p.id]);
    console.log(`🆕 NEW products found: ${newProducts.length}`);
    
    if (newProducts.length > 0) {
        console.log('\n📢 Sending alerts...\n');
        
        for (let i = 0; i < newProducts.length; i++) {
            const product = newProducts[i];
            console.log(`${i + 1}/${newProducts.length}: ${product.name.substring(0, 40)}... - ${product.price}`);
            
            await sendTelegramAlert(product);
            seen[product.id] = Date.now();
            
            await new Promise(r => setTimeout(r, 1000));
        }
        
        saveSeenProducts(seen);
        console.log(`\n✅ Alerted ${newProducts.length} new products!`);
        
    } else {
        console.log('\n😴 No new products this round');
    }
    
    console.log('\n✅ Run complete!');
    console.log('========================================\n');
}

runSniper().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});        });
        
        console.log(`   📤 Alert sent: ${product.name.substring(0, 40)}...`);
    } catch (error) {
        console.error(`   ❌ Telegram alert failed: ${error.message}`);
        
        // Fallback to text-only
        try {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: caption,
                    parse_mode: 'HTML'
                })
            });
            console.log(`   📤 Text alert sent: ${product.name.substring(0, 40)}...`);
        } catch (e) {}
    }
}

async function fetchProducts() {
    console.log('🔍 Calling Shein API with cookies...');
    
    try {
        const url = new URL(API_URL);
        Object.keys(API_PARAMS).forEach(key => {
            url.searchParams.append(key, API_PARAMS[key]);
        });
        
        console.log(`📡 Request URL: ${url.toString()}`);
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: API_HEADERS
        });
        
        console.log(`📊 Response status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            // Try to get more error info
            const errorText = await response.text();
            console.log('❌ Error response:', errorText.substring(0, 200));
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.products || !Array.isArray(data.products)) {
            console.log('⚠️ Unexpected API response structure');
            console.log('Response keys:', Object.keys(data));
            return [];
        }
        
        console.log(`✅ API returned ${data.products.length} products`);
        
        if (data.pagination) {
            console.log(`📊 Total products in category: ${data.pagination.totalResults}`);
        }
        
        const products = data.products.map(p => ({
            id: p.code,
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
    
    const allProducts = await fetchProducts();
    
    if (allProducts.length === 0) {
        console.log('❌ No products found or API error');
        return;
    }
    
    console.log(`📦 Found ${allProducts.length} products in API response`);
    
    const seen = loadSeenProducts();
    console.log(`📂 Previously seen: ${Object.keys(seen).length}`);
    
    const newProducts = allProducts.filter(p => p.id && !seen[p.id]);
    console.log(`🆕 NEW products found: ${newProducts.length}`);
    
    if (newProducts.length > 0) {
        console.log('\n📢 Sending alerts...\n');
        
        for (let i = 0; i < newProducts.length; i++) {
            const product = newProducts[i];
            console.log(`${i + 1}/${newProducts.length}: ${product.name.substring(0, 40)}... - ${product.price}`);
            
            await sendTelegramAlert(product);
            seen[product.id] = Date.now();
            
            await new Promise(r => setTimeout(r, 1000));
        }
        
        saveSeenProducts(seen);
        console.log(`\n✅ Alerted ${newProducts.length} new products!`);
        
    } else {
        console.log('\n😴 No new products this round');
    }
    
    console.log('\n✅ Run complete!');
    console.log('========================================\n');
}

// Check for first run
if (process.env.FIRST_RUN === 'true') {
    console.log('🎯 FIRST RUN MODE - Marking all products as seen...');
    fetchProducts().then(products => {
        const seen = {};
        products.forEach(p => seen[p.id] = Date.now());
        saveSeenProducts(seen);
        console.log(`✅ Initialized with ${Object.keys(seen).length} products`);
    }).catch(console.error);
} else {
    runSniper().catch(error => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });
}
