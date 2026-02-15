/**
 * 🚀 SHEINVERSE SNIPER - AUTO-COOKIE REFRESH VERSION
 * Automatically gets fresh cookies before each API call
 */

import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';
import { HttpsProxyAgent } from 'https-proxy-agent';

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';
const COOKIE_FILE = 'cookies.json';

// Men's SHEINVERSE URLs
const MAIN_URL = 'https://www.sheinindia.in/c/sverse-5939-37961';
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

// Browser-like headers
const BROWSER_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'sec-ch-ua': '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1'
};

// Function to save cookies
function saveCookies(cookieString) {
    try {
        fs.writeFileSync(COOKIE_FILE, JSON.stringify({
            cookies: cookieString,
            timestamp: Date.now()
        }, null, 2));
        console.log('✅ Cookies saved for future use');
        return cookieString;
    } catch (e) {
        console.log('⚠️ Could not save cookies:', e.message);
        return cookieString;
    }
}

// Function to load cookies
function loadCookies() {
    try {
        if (fs.existsSync(COOKIE_FILE)) {
            const data = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
            // Check if cookies are less than 1 hour old
            if (Date.now() - data.timestamp < 60 * 60 * 1000) {
                console.log('📂 Using cached cookies from', new Date(data.timestamp).toLocaleString());
                return data.cookies;
            } else {
                console.log('⏰ Cookies expired, will fetch fresh ones');
            }
        }
    } catch (e) {
        console.log('⚠️ Could not load cookies:', e.message);
    }
    return null;
}

// Function to extract cookies from response headers
function extractCookies(response) {
    const cookies = response.headers.raw()['set-cookie'] || [];
    const cookieParts = [];
    
    cookies.forEach(cookie => {
        // Take only the name=value part, ignore path/expires
        const match = cookie.match(/^([^=]+=[^;]+)/);
        if (match) {
            cookieParts.push(match[1]);
        }
    });
    
    return cookieParts.join('; ');
}

// Function to get fresh cookies by visiting the main page
async function getFreshCookies() {
    console.log('🍪 Getting fresh cookies from main page...');
    
    try {
        const response = await fetch(MAIN_URL, {
            method: 'GET',
            headers: BROWSER_HEADERS,
            redirect: 'follow'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get cookies: ${response.status}`);
        }
        
        // Extract cookies from response
        const cookieString = extractCookies(response);
        
        if (!cookieString) {
            throw new Error('No cookies received');
        }
        
        console.log('✅ Got fresh cookies successfully');
        return saveCookies(cookieString);
        
    } catch (error) {
        console.error('❌ Failed to get fresh cookies:', error.message);
        
        // Try one more time with a different approach
        console.log('🔄 Trying alternative method...');
        try {
            const altResponse = await fetch('https://www.sheinindia.in/', {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const altCookies = extractCookies(altResponse);
            if (altCookies) {
                console.log('✅ Got cookies from homepage');
                return saveCookies(altCookies);
            }
        } catch (e) {}
        
        return null;
    }
}

// Function to build API headers with cookies
async function getApiHeaders() {
    // Try to load cached cookies first
    let cookieString = loadCookies();
    
    // If no cached cookies, get fresh ones
    if (!cookieString) {
        cookieString = await getFreshCookies();
    }
    
    // Build headers for API request
    return {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
        'X-TENANT-ID': 'SHEIN',
        'Referer': MAIN_URL,
        'Origin': 'https://www.sheinindia.in',
        'sec-ch-ua': '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Cookie': cookieString || ''
    };
}

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
    console.log('🔍 Calling Shein API with fresh headers...');
    
    try {
        // Get headers with fresh cookies
        const headers = await getApiHeaders();
        
        const url = new URL(API_URL);
        Object.keys(API_PARAMS).forEach(key => {
            url.searchParams.append(key, API_PARAMS[key]);
        });
        
        console.log(`📡 Request URL: ${url.toString()}`);
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: headers
        });
        
        console.log(`📊 Response status: ${response.status} ${response.statusText}`);
        
        // If we get 403, cookies might be expired - try once more with fresh cookies
        if (response.status === 403) {
            console.log('🔄 Got 403, refreshing cookies and retrying...');
            
            // Force refresh cookies
            const freshCookies = await getFreshCookies();
            if (freshCookies) {
                headers.Cookie = freshCookies;
                
                const retryResponse = await fetch(url.toString(), {
                    method: 'GET',
                    headers: headers
                });
                
                console.log(`📊 Retry response: ${retryResponse.status}`);
                
                if (retryResponse.ok) {
                    const data = await retryResponse.json();
                    return processProductData(data);
                }
            }
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log('❌ Error response:', errorText.substring(0, 200));
            return [];
        }
        
        const data = await response.json();
        return processProductData(data);
        
    } catch (error) {
        console.error('❌ API fetch failed:', error.message);
        return [];
    }
}

function processProductData(data) {
    if (!data.products || !Array.isArray(data.products)) {
        console.log('⚠️ Unexpected API response structure');
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
}

async function runSniper() {
    console.log('\n🚀 ========================================');
    console.log('   SHEINVERSE API SNIPER - AUTO COOKIE REFRESH');
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
