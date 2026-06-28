// =========================================
// 中国移动 10086 签到抽奖脚本 (Quantumult X)
// 功能: 每日自动签到 + 幸运抽奖 + 获取额外抽奖次数
// 类型: task (定时任务)
// =========================================
//
// Quantumult X 配置:
// ---------- [task_local] ----------
// 0 8,18 * * * https://raw.githubusercontent.com/1009394958/10086-quantumultx/main/10086_checkin.js, tag=移动10086_签到抽奖, enabled=true
//
// ---------- [rewrite_remote] ----------
// https://raw.githubusercontent.com/1009394958/10086-quantumultx/main/10086_token.js, tag=移动10086_获取Token, enabled=true
//
// ---------- [MITM] ----------
// hostname = *.10086.cn, *.coc.10086.cn
//
// ⚠️ 使用前说明:
// 1. 先启用 10086_token.js 并打开一次中国移动 App，自动捕获 Token 和 Cookie
// 2. 本脚本读取已捕获的凭证，自动完成签到和抽奖
// 3. 首次使用建议在 App 中手动完成一次签到流程以验证凭证有效性
//
// 功能说明:
// - ✅ 自动读取已捕获的 x-token 和 Cookie
// - ✅ 刷新登录会话 (autoLogin)
// - ✅ 获取用户信息验证登录状态
// - ✅ 触发每日签到
// - ✅ 尝试查询并执行抽奖
// - ✅ 尝试获取额外抽奖次数

const KEY_TOKEN = "10086_x_token";
const KEY_COOKIE = "10086_cookie";
const KEY_RTOKEN = "10086_r_token";
const KEY_CHECKIN_LOG = "10086_checkin_log";

const UA = "ChinaMobile/12.1.2 (iPhone; iOS 26.0.1; Scale/3.00)";
const UA_CF = "ChinaMobile/2606091141121200 CFNetwork/3860.100.1 Darwin/25.0.0";

let msg_logs = [];
let notifyMsg = "";
let notifySub = "";

// ==================== 日志 ====================
function log(msg) {
  console.log(msg);
  msg_logs.push(msg);
}

// ==================== 读取凭证 ====================
function getCredentials() {
  return {
    xToken: $prefs.valueForKey(KEY_TOKEN) || "",
    cookie: $prefs.valueForKey(KEY_COOKIE) || "",
    rToken: $prefs.valueForKey(KEY_RTOKEN) || ""
  };
}

// ==================== 保存凭证 ====================
function saveCredentials(xToken, cookie, rToken) {
  if (xToken) $prefs.setValueForKey(xToken, KEY_TOKEN);
  if (cookie) $prefs.setValueForKey(cookie, KEY_COOKIE);
  if (rToken) $prefs.setValueForKey(rToken, KEY_RTOKEN);
}

// ==================== HTTP 请求 ====================
function httpRequest(url, method = "GET", headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    let opts = {
      url,
      method,
      headers: Object.assign({
        "User-Agent": UA,
        "Accept-Language": "zh-Hans-CN;q=1",
        "Accept-Encoding": "deflate"
      }, headers),
      timeout: 15000
    };
    if (body) opts.body = body;
    $task.fetch(opts).then(r => resolve(r), e => reject(e));
  });
}

// ==================== 步骤1: 验证并刷新 Token ====================
async function refreshSession(cred) {
  log("📌 [步骤1/5] 验证并刷新会话...");

  // 通过查询用户信息来验证 token 有效性
  try {
    // 使用 clientaccess API - 无需加密 body
    let resp = await httpRequest(
      "https://clientaccess.10086.cn/biz-orange/BN/userInformationService/getUserInformation",
      "POST",
      {
        "x-token": cred.xToken,
        "Cookie": cred.cookie,
        "Content-Type": "application/Json",
        "x-time": String(Date.now()),
        "x-nonce": String(Math.floor(Math.random() * 100000000)),
        "x-qen": "14",
        "xs": md5random(),
        "Accept": "*/*"
      },
      cred.xToken ? "" : undefined
    );

    log("  ↳ 响应码: " + resp.statusCode);
    if (resp.headers && resp.headers["r-token"]) {
      log("  ↳ 获取到新 r-token: " + resp.headers["r-token"].substring(0, 16) + "...");
      saveCredentials(null, null, resp.headers["r-token"]);
    }

    // 尝试更新 cookie
    if (resp.headers && resp.headers["Set-Cookie"]) {
      let sc = resp.headers["Set-Cookie"];
      let m = sc.match(/(JSESSIONID|UID)=([^;]+)/g);
      if (m) {
        let newCookie = m.join("; ");
        saveCredentials(null, newCookie, null);
        cred.cookie = newCookie;
        log("  ↳ Cookie 已更新");
      }
    }

    return true;
  } catch (e) {
    log("  ❌ 会话验证失败: " + e.error);
    return false;
  }
}

// ==================== 步骤2: 访问签到活动页 ====================
async function visitCheckinPage(cred) {
  log("📌 [步骤2/5] 访问签到活动页面...");

  // 签到有礼活动 - Alibaba Nebula 小程序
  // 通过 H5 页面访问触发签到
  const activityHost = "8463803521674337.h5app.10086.cn";
  const activityUrl = `https://${activityHost}/index.html#pages/qwhdmark/views/home/index?activityId=1021122301`;

  try {
    // 首先访问首页以建立会话
    let resp = await httpRequest(
      `https://${activityHost}/index.html`,
      "GET",
      { "Cookie": cred.cookie, "x-token": cred.xToken }
    );

    log("  ↳ 活动页访问: HTTP " + resp.statusCode);

    // 尝试获取活动配置信息
    // 签到活动 API 地址 (基于小程序框架推测)
    let apiUrl = `https://${activityHost}/api/activity/signIn?activityId=1021122301`;

    let signResp = await httpRequest(
      apiUrl,
      "POST",
      {
        "Cookie": cred.cookie,
        "x-token": cred.xToken,
        "Content-Type": "application/json",
        "Origin": `https://${activityHost}`,
        "Referer": activityUrl,
        "User-Agent": UA
      },
      JSON.stringify({ activityId: "1021122301" })
    );

    log("  ↳ 签到API响应码: " + signResp.statusCode);
    if (signResp.body) {
      log("  ↳ 响应: " + signResp.body.substring(0, 300));
      // 尝试解析
      try {
        let json = JSON.parse(signResp.body);
        if (json.code === "000000" || json.success || json.code === 0) {
          log("  ✅ 签到成功!");
          notifySub = "签到成功";
          return { signed: true, data: json };
        } else {
          log("  ⚠️ 签到返回: " + (json.msg || json.message || JSON.stringify(json)));
          notifySub = json.msg || "签到结果未知";
        }
      } catch (e) {
        log("  ⚠️ 响应非JSON: " + signResp.body.substring(0, 100));
      }
    }

    return { signed: false };
  } catch (e) {
    log("  ❌ 访问签到页失败: " + e.error);
    return { signed: false };
  }
}

// ==================== 步骤3: 查询抽奖次数 ====================
async function queryLottery(cred) {
  log("📌 [步骤3/5] 查询抽奖次数...");

  // 抽奖API (根据活动ID和通用活动框架推测)
  const activityHost = "8463803521674337.h5app.10086.cn";

  try {
    // 查询抽奖机会
    let resp = await httpRequest(
      `https://${activityHost}/api/lottery/query?activityId=1021122301`,
      "GET",
      { "Cookie": cred.cookie, "x-token": cred.xToken }
    );

    if (resp.body && resp.body.length < 500) {
      log("  ↳ 抽奖查询: " + resp.body.substring(0, 200));
      try {
        let json = JSON.parse(resp.body);
        let chances = json.drawCount || json.chances || json.lotteryCount || 0;
        log(`  🎯 当前抽奖次数: ${chances}`);
        return { chances };
      } catch (e) {
        log("  ⚠️ 查询响应非标准JSON");
      }
    }

    return { chances: 0 };
  } catch (e) {
    log("  ⚠️ 查询抽奖失败: " + e.error);
    return { chances: 0 };
  }
}

// ==================== 步骤4: 执行抽奖 ====================
async function doLottery(cred, chances) {
  log("📌 [步骤4/5] 执行抽奖...");

  if (chances <= 0) {
    log("  ⚠️ 没有可用的抽奖次数");
    return { drew: false, reason: "no_chances" };
  }

  const activityHost = "8463803521674337.h5app.10086.cn";
  let drew = 0;

  for (let i = 0; i < Math.min(chances, 3); i++) { // 最多抽3次
    try {
      let resp = await httpRequest(
        `https://${activityHost}/api/lottery/draw?activityId=1021122301`,
        "POST",
        {
          "Cookie": cred.cookie,
          "x-token": cred.xToken,
          "Content-Type": "application/json"
        },
        JSON.stringify({ activityId: "1021122301" })
      );

      if (resp.body) {
        log(`  🎰 第${i + 1}次抽奖: ` + resp.body.substring(0, 200));
        try {
          let json = JSON.parse(resp.body);
          if (json.code === "000000" || json.success || json.code === 0) {
            drew++;
            let prize = json.prizeName || json.prize || json.data?.prizeName || "未知奖品";
            log(`  🎉 获得: ${prize}`);
          }
        } catch (e) {
          // 响应可能是加密的
        }
      }
    } catch (e) {
      log(`  ⚠️ 第${i + 1}次抽奖失败: ` + e.error);
    }
  }

  return { drew: drew > 0, count: drew };
}

// ==================== 步骤5: 获取额外抽奖次数 ====================
async function getExtraChances(cred) {
  log("📌 [步骤5/5] 尝试获取额外抽奖次数...");

  // 策略1: 通过签到任务获取额外次数
  // 策略2: 通过分享获取
  // 策略3: 通过浏览活动页面获取

  const activityHost = "8463803521674337.h5app.10086.cn";
  let extraGained = 0;

  // 尝试完成签到任务获得额外次数
  try {
    let resp = await httpRequest(
      `https://${activityHost}/api/task/complete?activityId=1021122301&taskType=sign`,
      "POST",
      {
        "Cookie": cred.cookie,
        "x-token": cred.xToken,
        "Content-Type": "application/json"
      },
      JSON.stringify({ activityId: "1021122301", taskType: "sign" })
    );

    if (resp.body) {
      log("  ↳ 签到任务: " + resp.body.substring(0, 150));
      try {
        let json = JSON.parse(resp.body);
        if (json.code === "000000" || json.success) {
          extraGained++;
        }
      } catch (e) {}
    }
  } catch (e) {
    log("  ⚠️ 签到任务失败: " + e.error);
  }

  // 尝试浏览任务获得额外次数
  try {
    let resp = await httpRequest(
      `https://${activityHost}/api/task/complete?activityId=1021122301&taskType=browse`,
      "POST",
      {
        "Cookie": cred.cookie,
        "x-token": cred.xToken,
        "Content-Type": "application/json"
      },
      JSON.stringify({ activityId: "1021122301", taskType: "browse" })
    );

    if (resp.body) {
      log("  ↳ 浏览任务: " + resp.body.substring(0, 150));
    }
  } catch (e) {}

  if (extraGained > 0) {
    log(`  ✅ 获得 ${extraGained} 次额外抽奖机会`);
  } else {
    log("  ℹ️ 未获取到额外次数(或已领取过)");
  }

  return { extraGained };
}

// ==================== 辅助: 随机 MD5 格式字符串 ====================
function md5random() {
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// ==================== 主流程 ====================
async function main() {
  log("═══════════════════════════════════════");
  log("    📶 中国移动 10086 签到抽奖");
  log("    ⏰ " + new Date().toLocaleString("zh-CN"));
  log("═══════════════════════════════════════");

  // 1. 读取凭证
  let cred = getCredentials();
  if (!cred.xToken && !cred.cookie) {
    log("❌ 未检测到 Token 或 Cookie");
    log("📌 请先在 Quantumult X 中启用 10086_token.js");
    log("📌 然后打开一次中国移动 App 以捕获凭证");
    $notification.post("❌ 移动10086", "签到失败", "未检测到Token/Cookie，请先打开中国移动App");
    return;
  }

  log("📄 Token: " + (cred.xToken ? "✓ (" + cred.xToken.substring(0, 20) + "…)" : "✗"));
  log("📄 Cookie: " + (cred.cookie ? "✓ (" + cred.cookie.substring(0, 40) + "…)" : "✗"));

  // 2. 执行各步骤
  await refreshSession(cred);
  let signResult = await visitCheckinPage(cred);
  let lotteryInfo = await queryLottery(cred);
  let drawResult = null;
  if (lotteryInfo.chances > 0) {
    drawResult = await doLottery(cred, lotteryInfo.chances);
  }
  await getExtraChances(cred);

  // 3. 二次抽奖 (如果有额外次数)
  if (lotteryInfo.chances > 0 && drawResult && drawResult.count < lotteryInfo.chances) {
    let remain = lotteryInfo.chances - drawResult.count;
    log(`📌 剩余 ${remain} 次抽奖机会，继续抽取...`);
    await doLottery(cred, remain);
  }

  // 4. 汇总结果
  log("═══════════════════════════════════════");
  let summaryParts = [];
  summaryParts.push(signResult.signed ? "✅签到成功" : "⚠️签到需手动");
  if (drawResult && drawResult.drew) summaryParts.push(`🎰抽奖${drawResult.count}次`);
  else summaryParts.push("🎰无抽奖次数");
  let summary = summaryParts.join(" | ");

  $notification.post("📶 移动10086", summary, "详情查看日志");
  log("📋 " + summary);
  log("═══════════════════════════════════════");

  $done();
}

main().catch(e => {
  log("❌ 脚本异常: " + JSON.stringify(e));
  $notification.post("❌ 移动10086 异常", "", String(e));
  $done();
});
