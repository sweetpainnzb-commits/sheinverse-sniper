/**
 * 🚀 SHEINVERSE SNIPER - REAL API VERSION WITH COOKIES
 */

import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const TELEGRAM_BOT_TOKEN = "8367734034:AAETSFcPiMTyTvzyP3slc75-ndfGMenXK5U";
const TELEGRAM_CHAT_ID = "-1003320038050";
const SEEN_FILE = 'seen_products.json';

// Men's SHEINVERSE API URL
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

// CRITICAL: Cookies from your captured request
const COOKIES = 'bm_ss=ab8e18ef4e; bm_mi=96D3B43757CAF528C369E1D30A9CCF4E~YAAQBGo3F1EgmyGcAQAACmWKYB50f8oChMVrVikFIU42RU/Hdyrh/dE1QhydzERXp8mKuhomhrk6zE5G8Lqt0HbaUHcA48m2MZCtKumauXzwWOn5E73OWYYhrcpqUGDYBcR/ygSxAXMQ2PFA2q/YqsOCeEqY4Ffr4o247TQ0TL+u3JoVF1KaBvxOiZOhRybRriGaKG0x+LqNORbj30sZLH3WPo3wkNiR2WR1FW9ZvPdmlddZj1X/AWEDFQDQlw/Jg2P3R0M86g4Jnm77IFmOZWvkAc/4ZEM7RcrLnvwjs401cp8wPwxv/EXSME/feEnsOO+3Di+2t0hfxq0=~1; ak_bmsc=C908FDFD70E7865B64BB6A45A9475BE9~000000000000000000000000000000~YAAQBmo3FwvcaU+cAQAAJXqKYB40+oHjDaI51kxQVO4amYcdSdMDTLscTQaASJJbzU6+uPYPUHyl+toVL6nTvYGNeTOu4SKWou9uG7/hO7JUcomH/U9DFtufFCdBEKN58KtxlalO2Lffo//B598nG0Wj+gmVkIq7BxkhVV9zJ1Wa8e/GAv+guHbYldNVxgsbQl0iojZ+9YqY4dbV/aPOXDlunzBtfFTh+2toessZfa71QdJlNEDJSHjzu3g1kgGcU4nlEJKf/kk65ITnKOADAW5pFKBfsoV+dwB6678ifJX4K8Hhawsdy0zk5t9/KUI+1ldZkQ1VX1SA/nM6okjREP9eQ/xrNG/aojd1p69SxynY23heb6CG0uHcai47O3nkneuKI8VcuQQlP1aKvi2xXBcrBCStsu92/YLLYqEKAcBk62CSzfesbFzzEl6zlb14j8k+a+wjw25Yv2nRgBU5; _gid=GA1.2.1834522386.1771146224; _gac_G-D6SVDYBNVW=1.1771146223.EAIaIQobChMItZm8mZHbkgMVu6NmAh2KHwGDEAAYASAAEgJM_fD_BwE; WZRK_G=68bc1bf75e6249199e26698fc552835a; perf=true; navigation_cookie=false; V=1; _fbp=fb.1.1771146229180.7903128739525245; _fpuuid=6wtAt9RcQnWBPk9x9kwWo; deviceId=6wtAt9RcQnWBPk9x9kwWo; _gcl_au=1.1.814015120.1771146230; os=3; vr=WEB-2.0.11; ifa=96f4366f-68df-4b05-b838-f1679ae30bf1; jioAdsFeatureVariant=true; _gcl_aw=GCL.1771146245.EAIaIQobChMItZm8mZHbkgMVu6NmAh2KHwGDEAAYASAAEgJM_fD_BwE; _gcl_gs=2.1.k1$i1771146212$u63390829; storeTypes=shein; A=eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJjbGllbnQiLCJjbGllbnROYW1lIjoid2ViX2NsaWVudCIsInJvbGVzIjpbeyJuYW1lIjoiUk9MRV9UUlVTVEVEX0NMSUVOVCJ9XSwidGVuYW50SWQiOiJTSEVJTiIsImV4cCI6MTc3MTIyMzQwMSwiaWF0IjoxNzY4NjMxNDAxfQ.FY9vPRBvSpafwFhVi8mOfNxICabvtuqI7C5akYNRNfJrJ4z3GOaL_-tCoFD_PTpD_oZft9vBaJDbOZmar5JDAZShLf5V_WAaxRI5BLaLEHg-n_OHw-9tIrleSagDe4f5uUg1BDXMwbLfceb5p9cPLwCtREeXNU1lW2dzh3EiW6VjhnzvR64oqDJpufPpqr2S_3YUhgDpJ5QgaXG_86O0dJd8jzwL_ZpKH4E9-tKgp4xdTlBB6tPAQeq1i7tFT1-FxRQw5Hib7L74hm5tCvj6qrXpXxZbmu2jln6-uGvF7lb0Ssbf-L_OFJVkNcNHiLkjuLs8JIk3qW_GJIpy3h0H4w; U=anonymous; AGUID=b87f5cad-1390-44ea-b51f-9113814d1495; C=b87f5cad-1390-44ea-b51f-9113814d1495; M=b87f5cad-1390-44ea-b51f-9113814d1495; _abck=9EE1FB45AFB77551220DA48DDBBA8A1D~0~YAAQBmo3F/8wak+cAQAAmHGRYA8i/ww8GgjuQ3j8wTWqGfrQPVnSgUytHteBuq2DlM+GqcFc3S4qaDD+gaV6tnkcGDcrjw5w9vCdHOBf/gGfVywI+EE2+uq5BVn4KMoJRvGvhtQy2dhi4XB8e+4EYXPZhMiz7FSe/mN6enECjfhYCY6m1VIyTGU3elgXSfu8PkDJhvn72/puW29YKCDTPOg/dEizefOnLN/QPpG1m95BglYLcm2nIEObJwCFy28rImFit0qmJsfuA996ib7F7QIO9MpKbfGgjY75xP0Sw2NiYRWVRXaoesrojvYcH2A8Rep3tZWb2oT7h7BHXQXwUGV2M0zR7Qi7h0xeARNGuoHzVsyfAI5IRtaCsRIBFN6iAYc1/k4vNfS1GgVPWCUc3OggAyEcq+YHcrcGGjY5gfEVkxqWbwC9ysY2oXXHPYoTr/4BXNQKzq28emQK0laz0iqil+LUvH9pqbGsUt5IpyQ2JlFhKd08ld248ZmnNodDG7wPErkQBY1Wb+nwadaTASyDxkZc96qOsrKFJQD1TQ5s7Eu440FTNltIOYbNJazLr9YxYVv9eFeCggR1Agqw/8j0WaA3w9g+LvpTgP6b+TaUixkuTo6jdFEd0WR3U06XImUh+hnxqVPX0YxUBNUd5r7qPxylvJoo+Qjvbp41HVBbdCM3/8KfpDh00Mf3IWBxpzNWaPOI2s00qehcS0C6ak0p045h6QTBBx95pXIvm61qUGWhcoBg2yrg0wc1lscUv0IJGC1cp7IgbFIMsFZGhYny1Zim3ylVR6Qtn2+6vq42j1DxwSha25qts5MxWsesb+7psZm6KPrp8/+79HXq8bq654wiuiGjHCm7a83WnJvBEB5kGKQMkldfZ5RjE6t9jBnfeWa4qwcCkKbw5LuVtsg=~-1~-1~1771149810~AAQAAAAF%2f%2f%2f%2f%2fxz5G%2fosAalFOzsatQvWYby2dT64Orp2RorLmDYVb0AZHrJYKV9Jwql%2ftCCMnVr6i22VNQe19pjj72pD3BxmwcfozpkaVpSR7LXU~-1; bookingType=SHEIN; sessionId=sess_1771147528678_k35brir2z; mobilePLPScrollPosition=0; recentlyViewed=[{"id":"443392720_silver","store":0},{"id":"443388755_black","store":0},{"id":"443336864_multi","store":0},{"id":"443383011_grey","store":0},{"id":"443388591_beige","store":0}]; WZRK_S_8WR-85Z-WR7Z=%7B%22p%22%3A9%2C%22s%22%3A1771146219%2C%22t%22%3A1771147562%7D; bm_s=YAAQbyUPF2TbbR+cAQAA+RehYATOVV9f2GgTRmA+FtcBLv1igkRUskVqSvel6G0QmJ4OL8/rNRmHsGN4WHRHZCJQ5yo2DhntF+2D9AdKxckfK68yl4Z+7fHyHmGMbk8FsgANbGOzZHptlpFufk/3royy4z6RV96eHKl6qEfgrI40LcY5nsFrWaveLToAk5BVn2O5zu+vOGjzjLOvreXWNmjkQp3GxNRS655qVdZmEgsjedqzHOhopON0r3lA/21Lqa0Bj9v83pXRo8XRjdG8sJYb3wOrrRZhcfkp5SLt2gWQqwYuYdBrYGYSXkWi3aK8OFXcT721g7TAw7P/UX+sTs3OrhhVGyR45TfwEvkeZoawnuzCarkhGPqtmaDowVBA1tW7YAE5Z6TejT61eKD0E7bQDXoVCM78CJz3o1xTJ5y+0wYlAvAWJkTVIcOarks6oJA3FBItDB8Wo5QqaLpQLBZhwbJPUZTPD0wms+4IBKXpQlQRCEMQJMVdCTtOUzEUgSybg7/blYAvb+Z2YyVb4PE7Wo14WKDgG4C5fFLvuG5IwQg51xN8sMoGlnEj7aWIMrqABA7A3tE4146CLZI2lF4B; bm_so=12C39C9C0289F40E928F85A1BCABC1C01E167F86EC69170A9BD7EDCF6B13174F~YAAQbyUPF2XbbR+cAQAA+RehYAYNlAIwRlZTC/UHowb7arS3NMBphZ8FkeQD5b5n+txzmq4Z/T+6BUdwsuUGIeUlG+ciKtEGq/7WV2BEP1PlxM8691GPKK9WespT0t+1tukFv5SEwUqFTUOxeplR+Kc7zAGk8mqrFhLM0PXHDwAvNG8WJujTXLYIDbRQ3qxMonl7ji4j75HIizIYu7uJEtLc3mmInPBRGcxpX4DV1WoClAEXH1pR0WbzlYN5BZZiDUYGM69T5DJc/DuTm0nAqyck/MwctYIZkrkw2xEXD0KOTKyhsegMJ6E9nDXid4A6B+ideuqKsqshcob1gklgeKLK8kfb3kpDXiLWAOyL+Hs9TZRaInolwq+7uvjHcsCNjPch+GkHtmzEPl2b5so+uRTPQ6wZEn5g7rmMjd6MxHDptLEPmr64BOZN1NtKDdjB3FCavmYUbxS9jPud+v9p7GI=; bm_sz=E36D1543D7F68C1707778F2BFEDF3FCE~YAAQbyUPF2fbbR+cAQAA+RehYB5g7zblecxaVQzhs0bhRBt/qCIefVNoxyH9MDR/5Zuuitcogc0OT6CLhN08PO8UHU/XjhBd6xO6TN7a87MHTkCzxukBBgDR1iM1g9DKmnrehLkza5b6LcVyzJ3CANV83o+YQVUAFleIaOqImCVnFWP/pQFdBMc2tCL1c89D3OSFAmjDqBfqni4ceW3dBM2rfyka5qGiMbduz2CvyLa2+DtLU0slyUPVYvfRjKIjGKAUhdvGDNsuX2w+Bg0EcVYP2x+hallOCQzflrfwLbV0dhfJcGcoEDRLanyu8TO4eqA6QFbZydLC75CNwMxV1G2Olw/YiF8fjEbEkjTmTK+J/feuNuBo7iogngzPANGumjpAsgXZeYPAAT7JluaFnW830mR0qB5JkWf/T0VmYR3MZDDj6A/gD5/bd+XLIyHAQUV7qUS5+MqvQy3c/asmrczc3DAZK3uGH8Mf4bjmy+EfjMzu89/OsQwvG5MoJYzlZC6ILI6tNYZ5m8vD9KlNJE+ubUdSzlT1Tg==~3356229~4408626; bm_sv=B0DF2FC1413962A6A97663BDA18D9DB2~YAAQbyUPF0ncbR+cAQAAaCahYB7gr3LIhAjTbFGO8oXBqEDXM/bRV81NESYcDbXJswdN0JCjrAYYXV2dNOqSJL7YcMGZrtxtG/bU+xviZHZHaKvI/oK5V+Ll90hcDhV6/Hb1prZbFV25T7D0fWzfTu3fD/j3vKxEFKV/UkPkpbDq4l1nClHtyOQSKHfmy9+ypQr8EfMfFPC/cBFljwng3eSBZ8Xe5GRp1nz8+MWjz2P5zRWfmsvegGA8CINbUUVp/UmVmg==~1; _ga=GA1.1.345510162.1771146224; bm_lso=12C39C9C0289F40E928F85A1BCABC1C01E167F86EC69170A9BD7EDCF6B13174F~YAAQbyUPF2XbbR+cAQAA+RehYAYNlAIwRlZTC/UHowb7arS3NMBphZ8FkeQD5b5n+txzmq4Z/T+6BUdwsuUGIeUlG+ciKtEGq/7WV2BEP1PlxM8691GPKK9WespT0t+1tukFv5SEwUqFTUOxeplR+Kc7zAGk8mqrFhLM0PXHDwAvNG8WJujTXLYIDbRQ3qxMonl7ji4j75HIizIYu7uJEtLc3mmInPBRGcxpX4DV1WoClAEXH1pR0WbzlYN5BZZiDUYGM69T5DJc/DuTm0nAqyck/MwctYIZkrkw2xEXD0KOTKyhsegMJ6E9nDXid4A6B+ideuqKsqshcob1gklgeKLK8kfb3kpDXiLWAOyL+Hs9TZRaInolwq+7uvjHcsCNjPch+GkHtmzEPl2b5so+uRTPQ6wZEn5g7rmMjd6MxHDptLEPmr64BOZN1NtKDdjB3FCavmYUbxS9jPud+v9p7GI=~1771147709733; _ga_D6SVDYBNVW=GS2.1.s1771146230$o1$g1$t1771147716$j43$l0$h1660416475';

const API_HEADERS = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; sdk_gphone64_x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36',
    'X-TENANT-ID': 'SHEIN',
    'Referer': 'https://www.sheinindia.in/c/sverse-5939-37961',
    'Cookie': COOKIES  // Add the cookies here!
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
