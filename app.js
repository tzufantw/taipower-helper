const GAS_URL = "https://script.google.com/macros/s/AKfycbzq2ywkhggukhdVMcKaEb37mi8tFGM-DmysCOBX_cvX9MCfXp8t-yA7we-xkyVi9dQK/exec";

const ACCOUNTS = {
  A001:"四爺", A002:"古德福", A003:"鄭福寶", A004:"阿清",
  A005:"雲虎", A006:"鴻志", A007:"沈定禾", A008:"師傅A008",
  A009:"師傅A009", A010:"師傅A010", A011:"師傅A011", A012:"師傅A012",
  A013:"師傅A013", A014:"師傅A014", A015:"師傅A015", A016:"師傅A016",
  A017:"師傅A017", A018:"師傅A018", A019:"師傅A019", A020:"師傅A020"
};

const $ = s => document.querySelector(s);
const APP_VERSION = "37";
const SCANNED_KEYS_STORAGE = "taipower_helper_scanned_keys_v35";
const MAX_SCANNED_KEYS = 20000;
const QR_SCAN_CONFIG = {
  // Reducing scan load gives the phone camera more time to autofocus.
  fps: 12,
  qrbox: (viewfinderWidth, viewfinderHeight) => {
    const shortestSide = Math.min(viewfinderWidth, viewfinderHeight);
    const size = Math.max(210, Math.min(330, Math.floor(shortestSide * 0.68)));
    return { width: size, height: size };
  },
  aspectRatio: 4 / 3,
  disableFlip: true,
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true
  }
};

const CAMERA_START_CONFIG = { facingMode: "environment" };

let scanner = null;
let user = JSON.parse(localStorage.getItem("tph_user") || "null");
let lastRaw = "";
let lastTime = 0;
let isProcessing = false;
let scannedKeys = loadScannedKeys();
let pendingDuplicateKey = "";
let todayCount = Number(localStorage.getItem("tph_count_" + todayKey()) || "0");

function todayKey(){
  return new Date().toISOString().slice(0,10);
}

function loadScannedKeys(){
  try {
    const saved = JSON.parse(localStorage.getItem(SCANNED_KEYS_STORAGE) || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch (error) {
    return new Set();
  }
}

function makeDuplicateKey(parsed){
  const meterNo = String(parsed && parsed.meter_no || "").replace(/\D/g, "");
  const verifyNo = String(parsed && parsed.verify_no || "").replace(/\D/g, "");
  return meterNo && verifyNo ? meterNo + "|" + verifyNo : "";
}

function rememberScannedKey(key){
  if (!key) return;

  scannedKeys.add(key);
  const saved = Array.from(scannedKeys);

  if (saved.length > MAX_SCANNED_KEYS) {
    saved.splice(0, saved.length - MAX_SCANNED_KEYS);
    scannedKeys = new Set(saved);
  }

  try {
    localStorage.setItem(SCANNED_KEYS_STORAGE, JSON.stringify(saved));
  } catch (error) {
    // A storage problem must not stop normal uploads.
  }
}

function forgetScannedKey(key){
  if (!key || !scannedKeys.has(key)) return false;

  scannedKeys.delete(key);

  try {
    localStorage.setItem(
      SCANNED_KEYS_STORAGE,
      JSON.stringify(Array.from(scannedKeys))
    );
  } catch (error) {
    scannedKeys.add(key);
    return false;
  }

  return true;
}

function showDuplicateUnlock(key){
  pendingDuplicateKey = key || "";

  const box = $("#unlockDuplicateBox");

  if (box && pendingDuplicateKey) {
    box.classList.remove("hidden");
  }
}

function hideDuplicateUnlock(){
  pendingDuplicateKey = "";

  const box = $("#unlockDuplicateBox");

  if (box) {
    box.classList.add("hidden");
  }
}

function setStatus(text){
  $("#status").textContent = text;
}

function getCodeKey(){
  if (!user) return "tph_meter_code";
  return "tph_meter_code_" + user.id;
}

function formatCode(value){
  value = String(value || "").replace(/[^\d]/g, "");

  if (!value) return "";

  while (value.length < 4) {
    value = "0" + value;
  }

  if (value.length > 4) {
    value = value.slice(-4);
  }

  return value;
}

function plusOneCode(value){
  const code = formatCode(value);

  if (!code) return "";

  let numberValue = parseInt(code, 10);

  if (isNaN(numberValue)) return "";

  numberValue = numberValue + 1;

  if (numberValue > 9999) {
    numberValue = 9999;
  }

  return formatCode(String(numberValue));
}

function getMeterCodeInput(){
  return document.getElementById("meterCode");
}

function setMeterCode(value){
  const input = getMeterCodeInput();
  const code = formatCode(value);

  if (input) {
    input.value = code;
    input.setAttribute("value", code);
  }

  if (code) {
    localStorage.setItem(getCodeKey(), code);
  }

  return code;
}

function getMeterCode(){
  const input = getMeterCodeInput();

  if (!input) return "";

  return formatCode(input.value);
}

function ensureMeterCodeInput(){
  if (getMeterCodeInput()) {
    const saved = localStorage.getItem(getCodeKey()) || "";

    if (saved && !getMeterCodeInput().value) {
      setMeterCode(saved);
    }

    return;
  }

  const scanCard = $("#scanCard");

  if (!scanCard) return;

  const box = document.createElement("div");
  box.className = "meter-code-box";
  box.innerHTML = `
    <label for="meterCode" style="display:block;font-weight:bold;margin:10px 0 6px;">
      電表編碼
    </label>
    <input
      id="meterCode"
      type="tel"
      inputmode="numeric"
      maxlength="4"
      placeholder="例如 0001"
      style="width:100%;box-sizing:border-box;font-size:22px;padding:10px;border:1px solid #bbb;border-radius:8px;text-align:center;"
    >
    <div style="font-size:13px;color:#666;margin-top:6px;">
      掃描成功後會自動跳下一碼
    </div>
  `;

  const reader = $("#reader");

  if (reader && reader.parentNode) {
    reader.parentNode.insertBefore(box, reader);
  } else {
    scanCard.insertBefore(box, scanCard.firstChild);
  }

  const input = getMeterCodeInput();
  const saved = localStorage.getItem(getCodeKey()) || "";

  if (saved) {
    setMeterCode(saved);
  }

  input.addEventListener("input", function(){
    this.value = this.value.replace(/[^\d]/g, "").slice(0, 4);
  });

  input.addEventListener("blur", function(){
    setMeterCode(this.value);
  });
}

function showApp(){
  $("#loginCard").classList.add("hidden");
  $("#scanCard").classList.remove("hidden");
  $("#engineerName").textContent = `${user.name}（${user.id}）`;
  $("#todayCount").textContent = todayCount;
  ensureMeterCodeInput();
  setStatus(`已登入・V${APP_VERSION}`);
}

function showLogin(){
  hideDuplicateUnlock();
  $("#loginCard").classList.remove("hidden");
  $("#scanCard").classList.add("hidden");
  setStatus("請登入");
}

if (user) showApp();

$("#loginBtn").onclick = () => {
  const id = $("#username").value.trim().toUpperCase();

  if (!ACCOUNTS[id]) return alert("帳號不存在");

  user = { id, name: ACCOUNTS[id] };
  localStorage.setItem("tph_user", JSON.stringify(user));
  showApp();
};

$("#logoutBtn").onclick = () => {
  localStorage.removeItem("tph_user");
  user = null;
  showLogin();
};

function setResult(html){
  const el = $("#result");

  if (el) {
    el.innerHTML = html;
  }
}

function showCenter(type, html){
  let box = $("#centerMsg");

  if (!box) {
    box = document.createElement("div");
    box.id = "centerMsg";
    document.body.appendChild(box);
  }

  box.className = "centerMsg " + type;
  box.innerHTML = html;
  box.style.display = "block";

  clearTimeout(window.msgTimer);

  window.msgTimer = setTimeout(() => {
    box.style.display = "none";
  }, 1000);
}

function beep(type){
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = type === "dup" ? 350 : type === "err" ? 220 : 900;
    gain.gain.value = 0.2;

    osc.start();

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, type === "err" ? 350 : 180);

  } catch(e) {}
}

function vibrate(type){
  if (!navigator.vibrate) return;

  if (type === "dup") {
    navigator.vibrate([120,80,120]);
  } else if (type === "err") {
    navigator.vibrate([300]);
  } else {
    navigator.vibrate([120]);
  }
}

function notice(type, html){
  beep(type);
  vibrate(type);
  showCenter(type, html);
  setResult(html);
}

function parseQR(raw){
  raw = String(raw || "").trim();

  const clean = raw.replace(/^L[o0]LA/i, "");
  const parts = clean.split(";").map(x => x.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      verify_no: parts[0],
      meter_no: parts[1],
      qr_raw: raw
    };
  }

  const nums = raw.match(/\d{5,12}/g) || [];

  if (nums.length >= 2) {
    return {
      verify_no: nums[0],
      meter_no: nums[1],
      qr_raw: raw
    };
  }

  return null;
}

function jsonp(params){
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Date.now() + "_" + Math.floor(Math.random() * 999999);

    params.callback = cb;

    const url = GAS_URL + "?" + new URLSearchParams(params).toString();
    const script = document.createElement("script");

    const timer = setTimeout(() => {
      delete window[cb];
      script.remove();
      reject(new Error("連線逾時"));
    }, 10000);

    window[cb] = data => {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      reject(new Error("連線失敗"));
    };

    script.src = url;
    document.body.appendChild(script);
  });
}

async function handleScan(raw){
  const now = Date.now();

  if (isProcessing) return;

  if (raw === lastRaw && now - lastTime < 3000) return;

  const meterCode = getMeterCode();

  if (!meterCode) {
    notice("err", "請先輸入電表編碼<br>例如：0001");

    const input = getMeterCodeInput();
    if (input) input.focus();

    return;
  }

  setMeterCode(meterCode);
  hideDuplicateUnlock();

  isProcessing = true;
  lastRaw = raw;
  lastTime = now;

  const parsed = parseQR(raw);

  if (!parsed) {
    notice("err", "QR 解析失敗<br>請重新掃描");
    isProcessing = false;
    return;
  }

  const duplicateKey = makeDuplicateKey(parsed);

  if (duplicateKey && scannedKeys.has(duplicateKey)) {
    showDuplicateUnlock(duplicateKey);
    notice(
      "dup",
      `此電表已掃描過，禁止重複上傳<br>` +
      `電表號碼：${parsed.meter_no}<br>` +
      `檢定號碼：${parsed.verify_no}<br>` +
      `請先改正電表編碼，再按下方解除按鈕`
    );
    isProcessing = false;
    return;
  }

  setResult(
    `上傳中...<br>` +
    `電表編碼：${meterCode}<br>` +
    `電表號碼：${parsed.meter_no}<br>` +
    `檢定號碼：${parsed.verify_no}`
  );

  try {
    const res = await jsonp({
      action: "uploadSimple",
      account: user.id,
      name: user.name,
      meter_code: meterCode,
      meter_no: parsed.meter_no,
      verify_no: parsed.verify_no,
      qr_raw: parsed.qr_raw
    });

    if (res.status === "duplicate") {
      rememberScannedKey(duplicateKey);
      notice(
        "dup",
        `今天已掃過<br>` +
        `電表編碼：${meterCode}<br>` +
        `電表號碼：${parsed.meter_no}<br>` +
        `檢定號碼：${parsed.verify_no}`
      );

      isProcessing = false;
      return;
    }

    if (res.status === "ok") {
      rememberScannedKey(duplicateKey);
      todayCount++;
      localStorage.setItem("tph_count_" + todayKey(), String(todayCount));
      $("#todayCount").textContent = todayCount;

      const nextCode = plusOneCode(meterCode);
      setMeterCode(nextCode);

      notice(
        "ok",
        `上傳成功<br>` +
        `本筆編碼：${meterCode}<br>` +
        `下一筆編碼：${nextCode}<br>` +
        `電表號碼：${parsed.meter_no}<br>` +
        `檢定號碼：${parsed.verify_no}`
      );

      isProcessing = false;
      return;
    }

    notice("err", "上傳失敗<br>" + (res.message || "未知錯誤"));
    isProcessing = false;

  } catch(e) {
    notice("err", "上傳失敗<br>" + e.message);
    isProcessing = false;
  }
}

async function handleDecodedText(text){
  if (isProcessing) return;

  try {
    if (scanner && scanner.pause) {
      scanner.pause(true);
    }
  } catch (_) {}

  setResult("已掃描 QR Code，正在上傳...");

  try {
    await handleScan(text);
  } finally {
    try {
      if (scanner && scanner.resume && !pendingDuplicateKey) {
        scanner.resume();
      }
    } catch (_) {}
  }
}

async function startScan(){
  if (!user) return alert("請先登入");

  if (!getMeterCode()) {
    alert("請先輸入電表編碼，例如 0001");

    const input = getMeterCodeInput();
    if (input) input.focus();

    return;
  }

  if (!window.Html5Qrcode) {
    return alert("QR 掃描器尚未載入，請重新整理頁面");
  }

  if (scanner) return;

  const scannerOptions = { verbose: false };

  if (window.Html5QrcodeSupportedFormats) {
    scannerOptions.formatsToSupport = [
      Html5QrcodeSupportedFormats.QR_CODE
    ];
  }

  scanner = new Html5Qrcode("reader", scannerOptions);

  try {
    await scanner.start(
      CAMERA_START_CONFIG,
      QR_SCAN_CONFIG,
      text => handleDecodedText(text)
    );

    // Use continuous autofocus where the mobile browser exposes it.
    try {
      const capabilities = scanner.getRunningTrackCapabilities
        ? scanner.getRunningTrackCapabilities()
        : {};

      const advanced = {};

      if (capabilities && Array.isArray(capabilities.focusMode) &&
          capabilities.focusMode.includes("continuous")) {
        advanced.focusMode = "continuous";
      }

      // Keep the visible scan box unchanged. On phones that expose camera
      // zoom, enlarge a distant QR code inside the camera image instead.
      if (capabilities && capabilities.zoom) {
        const minimumZoom = Number(capabilities.zoom.min || 1);
        const maximumZoom = Number(capabilities.zoom.max || 1);
        advanced.zoom = Math.min(maximumZoom, Math.max(minimumZoom, 1.5));
      }

      if (Object.keys(advanced).length) {
        await scanner.applyVideoConstraints({
          advanced: [advanced]
        });
      }
    } catch (_) {
      // iPhone Safari may not expose focus controls; scanning still works.
    }

    setResult("V37 相容掃描中，請保持約 15～25 公分距離");

  } catch(e) {
    try {
      if (scanner) {
        await scanner.stop().catch(() => {});
        scanner.clear();
      }
    } catch (_) {}

    scanner = null;
    notice(
      "err",
      "開啟相機失敗<br>" +
      "請允許相機權限後重新整理<br>" +
      `<small>${e && e.message ? e.message : String(e || "")}</small>`
    );
  }
}

async function stopScan(){
  if (scanner) {
    await scanner.stop().catch(() => {});
    scanner.clear();
    scanner = null;
    setResult("掃描已停止");
  }
}

$("#unlockDuplicateBtn").onclick = () => {
  const key = pendingDuplicateKey;

  if (!key) {
    hideDuplicateUnlock();
    return;
  }

  const unlocked = forgetScannedKey(key);
  hideDuplicateUnlock();
  lastRaw = "";
  lastTime = 0;

  if (!unlocked) {
    notice("err", "解除失敗<br>請重新整理後再試一次");
    return;
  }

  notice(
    "ok",
    "已解除這一顆電表鎖定<br>" +
    "其他電表紀錄沒有被清除<br>" +
    "請重新掃描"
  );

  setTimeout(() => {
    try {
      if (scanner && scanner.resume) {
        scanner.resume();
      }
    } catch (_) {}
  }, 700);
};

$("#startBtn").onclick = startScan;
$("#stopBtn").onclick = stopScan;
