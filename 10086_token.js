// =========================================
// 中国移动 10086 Token 获取脚本 (Quantumult X)
// 适用: MITM 重写 - 自动捕获 x-token/r-token 和 Cookie
// =========================================
// Quantumult X 配置:
// [rewrite_remote]
// https://raw.githubusercontent.com/1009394958/10086-quantumultx/main/10086_token.js, tag=移动10086_获取Token, enabled=true
// [MITM]
// hostname = *.10086.cn, *.coc.10086.cn, *.clientaccess.10086.cn

// =========================================
// ⚠️ 使用说明:
// 1. 在 Quantumult X 的 [rewrite_local] 或 [rewrite_remote] 中添加此脚本
// 2. 在 [MITM] 中添加 hostname = *.10086.cn
// 3. 打开中国移动 App，脚本会自动捕获 token
// 4. 捕获成功后会在通知栏显示
// =========================================

const KEY_TOKEN = "10086_x_token";
const KEY_COOKIE = "10086_cookie";
const KEY_RTOKEN = "10086_r_token";

// ============ 从请求中捕获 ============
if ($request) {
    let headers = $request.headers;
    let url = $request.url;

    // 只处理 10086.cn 相关域名的请求
    if (/\.10086\.cn/i.test(url) || /\.coc\.10086\.cn/i.test(url)) {
        
        // 从请求头中提取 x-token
        if (headers["x-token"]) {
            let token = headers["x-token"];
            $prefs.setValueForKey(token, KEY_TOKEN);
            console.log("✅ 捕获 x-token: " + token.substring(0, 50) + "...");
        }

        // 从请求头中提取 Cookie (JSESSIONID + UID)
        if (headers["Cookie"]) {
            let cookie = headers["Cookie"];
            $prefs.setValueForKey(cookie, KEY_COOKIE);
            console.log("✅ 捕获 Cookie: " + cookie.substring(0, 80) + "...");
        }
    }
}

// ============ 从响应中捕获 ============
if ($response) {
    let respHeaders = $response.headers;
    let url = $response.url;
    
    if (/\.10086\.cn/i.test(url) || /\.coc\.10086\.cn/i.test(url)) {
        
        // 从响应头中提取 r-token (服务端返回的更新token)
        if (respHeaders["r-token"]) {
            let rToken = respHeaders["r-token"];
            $prefs.setValueForKey(rToken, KEY_RTOKEN);
            console.log("✅ 捕获 r-token: " + rToken);
            
            // 用 r-token 更新 x-token (r-token 是服务端下发的更新凭证)
            let oldToken = $prefs.valueForKey(KEY_TOKEN);
            if (oldToken) {
                // 部分场景下 r-token 需要拼接到 x-token 中使用
                // 这里保留原始 x-token，r-token 单独存储
            }
        }
        
        // 从 Set-Cookie 响应头中提取 Cookie
        if (respHeaders["Set-Cookie"]) {
            let setCookie = respHeaders["Set-Cookie"];
            // 提取 JSESSIONID 和 UID
            let matches = setCookie.match(/(JSESSIONID|UID)=([^;]+)/g);
            if (matches) {
                let cookieStr = matches.join("; ");
                let existingCookie = $prefs.valueForKey(KEY_COOKIE) || "";
                // 更新 cookie 中的值
                if (cookieStr) {
                    // 合并新旧 cookie
                    let newCookie = cookieStr;
                    if (existingCookie) {
                        let parts = existingCookie.split("; ");
                        for (let p of parts) {
                            let key = p.split("=")[0];
                            if (!cookieStr.includes(key + "=")) {
                                newCookie += "; " + p;
                            }
                        }
                    }
                    $prefs.setValueForKey(newCookie, KEY_COOKIE);
                    console.log("✅ 更新 Cookie: " + newCookie.substring(0, 80) + "...");
                }
            }
        }
    }
}

// 发送通知汇总捕获结果
let hasToken = $prefs.valueForKey(KEY_TOKEN);
let hasCookie = $prefs.valueForKey(KEY_COOKIE);
if (hasToken && hasCookie) {
    $notification.post(
        "📶 移动10086",
        "✅ Token & Cookie 已捕获",
        "Token: " + hasToken.substring(0, 20) + "... | Cookie: " + (hasCookie.includes("JSESSIONID") ? "✓" : "✗")
    );
}

$done({});
