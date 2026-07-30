const GAS_URL = "https://script.google.com/macros/s/AKfycbzq2ywkhggukhdVMcKaEb37mi8tFGM-DmysCOBX_cvX9MCfXp8t-yA7we-xkyVi9dQK/exec";

const ACCOUNTS = {
  A001:"四爺", A002:"古德福", A003:"鄭福寶", A004:"阿清",
  A005:"雲虎", A006:"鴻志", A007:"沈定禾", A008:"師傅A008",
  A009:"師傅A009", A010:"師傅A010", A011:"師傅A011", A012:"師傅A012",
  A013:"師傅A013", A014:"師傅A014", A015:"師傅A015", A016:"師傅A016",
  A017:"師傅A017", A018:"師傅A018", A019:"師傅A019", A020:"師傅A020"
};

const $ = s => document.querySelector(s);
const APP_VERSION = "43";
const SCANNED_KEYS_STORAGE = "taipower_helper_scanned_keys_v35";
const UPLOAD_QUEUE_STORAGE = "taipower_helper_upload_queue_v40";
const MAX_SCANNED_KEYS = 20000;
const MAX_UPLOAD_QUEUE = 5000;
const UPLOAD_RETRY_DELAY = 5000;
const QR_SCAN_CONFIG = {
  // Reducing scan load gives the phone camera more time to autofocus.
  fps: 12,
  qrbox: (viewfinderWidth, viewfinderHeight) => {
    const shortestSide = Math.min(viewfinderWidth, viewfinderHeight);
    const size = Math.max(170, Math.min(270, Math.floor(shortestSide * 0.54)));
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
let torchEnabled = false;
let user = JSON.parse(localStorage.getItem("tph_user") || "null");
let lastRaw = "";
let lastTime = 0;
let isProcessing = false;
let uploadQueue = loadUploadQueue();
let isUploading = false;
let uploadRetryTimer = null;
let lastUploadError = "";
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

function isAndroidDevice(){
  return /Android/i.test(navigator.userAgent || "");
}

function isAndroidLineBrowser(){
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua) && /Line\//i.test(ua);
}

function showExternalBrowserHelp(permissionDenied){
  const box = $("#androidBrowserBox");
  const text = $("#androidBrowserText");

  if (!box || !isAndroidDevice()) return;

  box.classList.remove("hidden");

  if (text) {
    text.textContent = permissionDenied
      ? "安卓 LINE 已拒絕網頁相機權限，請改用 Chrome 開啟。"
      : "安卓 LINE 可能無法開啟相機；若失敗，請按下方按鈕改用 Chrome。";
  }
}

function hideExternalBrowserHelp(){
  const box = $("#androidBrowserBox");
  if (box) box.classList.add("hidden");
}

function openInChrome(){
  const fallbackUrl = "https://tzufantw.github.io/taipower-helper/?v=43";
  const encodedFallback = encodeURIComponent(fallbackUrl);
  const intentUrl =
    "intent://tzufantw.github.io/taipower-helper/?v=43" +
    "#Intent;scheme=https;package=com.android.chrome;" +
    "S.browser_fallback_url=" + encodedFallback + ";end";

  if (isAndroidDevice()) {
    window.location.href = intentUrl;
  } else {
    window.location.href = fallbackUrl;
  }
}

function resetCameraControls(){
  torchEnabled = false;

  const controls = $("#cameraControls");
  const zoomControl = $("#zoomControl");
  const torchBtn = $("#torchBtn");

  if (controls) controls.classList.add("hidden");
  if (zoomControl) zoomControl.classList.add("hidden");

  document.querySelectorAll(".zoom-btn").forEach(button => {
    button.classList.add("hidden");
    button.classList.remove("active");
  });

  if (torchBtn) {
    torchBtn.classList.add("hidden");
    torchBtn.classList.remove("torch-on");
    torchBtn.textContent = "開啟手電筒";
  }
}

async function configureCameraControls(){
  resetCameraControls();

  if (!scanner || !scanner.getRunningTrackCapabilities) return;

  const capabilities = scanner.getRunningTrackCapabilities() || {};
  const controls = $("#cameraControls");
  const zoomControl = $("#zoomControl");
  const torchBtn = $("#torchBtn");
  const advanced = {};
  let hasZoomButtons = false;

  if (Array.isArray(capabilities.focusMode) &&
      capabilities.focusMode.includes("continuous")) {
    advanced.focusMode = "continuous";
  }

  if (capabilities.zoom && zoomControl) {
    const minimumZoom = Number(capabilities.zoom.min || 1);
    const maximumZoom = Number(capabilities.zoom.max || 1);
    const initialZoom = Math.min(maximumZoom, Math.max(minimumZoom, 2));

    document.querySelectorAll(".zoom-btn").forEach(button => {
      const targetZoom = Number(button.dataset.zoom);
      const supported = targetZoom >= minimumZoom && targetZoom <= maximumZoom;

      button.classList.toggle("hidden", !supported);
      button.classList.toggle("active", supported && Math.abs(targetZoom - initialZoom) < 0.05);

      if (supported) hasZoomButtons = true;
    });

    if (hasZoomButtons) {
      zoomControl.classList.remove("hidden");
    }

    advanced.zoom = initialZoom;
  }

  if (capabilities.torch === true && torchBtn) {
    torchBtn.classList.remove("hidden");
  }

  if (controls &&
      (hasZoomButtons || (torchBtn && !torchBtn.classList.contains("hidden")))) {
    controls.classList.remove("hidden");
  }

  if (Object.keys(advanced).length) {
    await scanner.applyVideoConstraints({ advanced: [advanced] });
  }
}

async function applyCameraZoom(value){
  if (!scanner || !scanner.applyVideoConstraints) return;

  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return;

  try {
    await scanner.applyVideoConstraints({ advanced: [{ zoom }] });

    document.querySelectorAll(".zoom-btn").forEach(button => {
      button.classList.toggle(
        "active",
        Math.abs(Number(button.dataset.zoom) - zoom) < 0.05
      );
    });
  } catch (_) {
    notice("err", "這支手機或瀏覽器無法調整倍率");
  }
}

async function toggleTorch(){
  if (!scanner || !scanner.applyVideoConstraints) return;

  const nextValue = !torchEnabled;

  try {
    await scanner.applyVideoConstraints({
      advanced: [{ torch: nextValue }]
    });

    torchEnabled = nextValue;

    const button = $("#torchBtn");
    if (button) {
      button.textContent = torchEnabled ? "關閉手電筒" : "開啟手電筒";
      button.classList.toggle("torch-on", torchEnabled);
    }
  } catch (_) {
    notice("err", "這支手機或瀏覽器無法控制手電筒");
  }
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
  updateQueueStatus();
  processUploadQueue();

  if (isAndroidLineBrowser()) {
    showExternalBrowserHelp(false);
  }

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

function extractQRNumber(value){
  const matches = String(value || "").match(/\d{5,12}/g) || [];
  return matches.length ? matches[matches.length - 1] : "";
}

function parseQR(raw){
  raw = String(raw || "").trim();

  const parts = raw.split(";").map(x => x.trim()).filter(Boolean);

  if (parts.length >= 2) {
    const verifyNo = extractQRNumber(parts[0]);
    const meterNo = extractQRNumber(parts[1]);

    if (verifyNo && meterNo) {
      return {
        verify_no: verifyNo,
        meter_no: meterNo,
        qr_raw: raw
      };
    }
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


function loadUploadQueue(){
  try {
    const saved = JSON.parse(localStorage.getItem(UPLOAD_QUEUE_STORAGE) || "[]");

    if (!Array.isArray(saved)) return [];

    return saved.filter(item =>
      item &&
      item.account &&
      item.name &&
      item.meter_code &&
      item.meter_no &&
      item.verify_no &&
      item.qr_raw
    ).slice(0, MAX_UPLOAD_QUEUE);
  } catch (error) {
    return [];
  }
}

function saveUploadQueue(){
  try {
    localStorage.setItem(UPLOAD_QUEUE_STORAGE, JSON.stringify(uploadQueue));
    return true;
  } catch (error) {
    return false;
  }
}

function queueHasDuplicateKey(key){
  return Boolean(key) && uploadQueue.some(item => item.duplicate_key === key);
}

function updateQueueStatus(){
  const el = $("#queueStatus");

  if (!el) return;

  const count = uploadQueue.length;

  if (isUploading && count) {
    el.className = "queue-status uploading";
    el.textContent = `背景上傳中・待上傳 ${count} 筆`;
  } else if (lastUploadError && count) {
    el.className = "queue-status error";
    el.textContent = `網路暫時失敗・保留 ${count} 筆，將自動重試`;
  } else if (count) {
    el.className = "queue-status pending";
    el.textContent = `待上傳 ${count} 筆`;
  } else {
    el.className = "queue-status complete";
    el.textContent = "待上傳 0 筆・全部完成";
  }
}

function scheduleUploadRetry(){
  clearTimeout(uploadRetryTimer);
  uploadRetryTimer = setTimeout(() => {
    uploadRetryTimer = null;
    processUploadQueue();
  }, UPLOAD_RETRY_DELAY);
}

async function processUploadQueue(){
  if (isUploading || !uploadQueue.length) {
    updateQueueStatus();
    return;
  }

  clearTimeout(uploadRetryTimer);
  uploadRetryTimer = null;
  isUploading = true;
  lastUploadError = "";
  updateQueueStatus();

  const item = uploadQueue[0];

  try {
    const res = await jsonp({
      action: "uploadSimple",
      account: item.account,
      name: item.name,
      meter_code: item.meter_code,
      meter_no: item.meter_no,
      verify_no: item.verify_no,
      qr_raw: item.qr_raw
    });

    if (!res || (res.status !== "ok" && res.status !== "duplicate")) {
      throw new Error(res && res.message ? res.message : "未知錯誤");
    }

    uploadQueue.shift();
    saveUploadQueue();
    rememberScannedKey(item.duplicate_key);

    if (res.status === "ok" && item.day_key === todayKey()) {
      todayCount++;
      localStorage.setItem("tph_count_" + todayKey(), String(todayCount));

      const countEl = $("#todayCount");
      if (countEl) countEl.textContent = todayCount;
    }

    lastUploadError = "";

  } catch (error) {
    item.attempts = Number(item.attempts || 0) + 1;
    item.last_error = error && error.message ? error.message : String(error || "上傳失敗");
    saveUploadQueue();
    lastUploadError = item.last_error;
  } finally {
    isUploading = false;
    updateQueueStatus();

    if (lastUploadError) {
      scheduleUploadRetry();
    } else if (uploadQueue.length) {
      setTimeout(processUploadQueue, 0);
    }
  }
}

async function handleScan(raw){
  const now = Date.now();

  if (isProcessing) return;
  if (raw === lastRaw && now - lastTime < 5000) return;

  isProcessing = true;

  try {
    const meterCode = getMeterCode();

    if (!meterCode) {
      notice("err", "請先輸入電表編碼<br>例如：0001");

      const input = getMeterCodeInput();
      if (input) input.focus();

      return;
    }

    setMeterCode(meterCode);
    hideDuplicateUnlock();
    lastRaw = raw;
    lastTime = now;

    const parsed = parseQR(raw);

    if (!parsed) {
      notice("err", "QR 解析失敗<br>請重新掃描");
      return;
    }

    const duplicateKey = makeDuplicateKey(parsed);

    if (duplicateKey && scannedKeys.has(duplicateKey)) {
      showDuplicateUnlock(duplicateKey);

      const queuedText = queueHasDuplicateKey(duplicateKey)
        ? "這筆已在待上傳隊列中"
        : "此電表已掃描過，禁止重複上傳";

      notice(
        "dup",
        `${queuedText}<br>` +
        `電表號碼：${parsed.meter_no}<br>` +
        `檢定號碼：${parsed.verify_no}<br>` +
        `換另一顆新表可直接繼續掃描`
      );
      return;
    }

    if (uploadQueue.length >= MAX_UPLOAD_QUEUE) {
      notice("err", "待上傳資料已達上限<br>請連線完成上傳後再掃描");
      return;
    }

    const item = {
      id: Date.now() + "_" + Math.floor(Math.random() * 999999),
      account: user.id,
      name: user.name,
      meter_code: meterCode,
      meter_no: parsed.meter_no,
      verify_no: parsed.verify_no,
      qr_raw: parsed.qr_raw,
      duplicate_key: duplicateKey,
      day_key: todayKey(),
      created_at: new Date().toISOString(),
      attempts: 0
    };

    uploadQueue.push(item);

    if (!saveUploadQueue()) {
      uploadQueue.pop();
      notice("err", "手機儲存空間不足<br>本筆尚未加入，請勿換表");
      updateQueueStatus();
      return;
    }

    rememberScannedKey(duplicateKey);

    const nextCode = plusOneCode(meterCode);
    setMeterCode(nextCode);
    updateQueueStatus();

    notice(
      "ok",
      `已收件・請掃下一顆<br>` +
      `本筆編碼：${meterCode}<br>` +
      `下一筆編碼：${nextCode}<br>` +
      `待上傳：${uploadQueue.length} 筆`
    );

    processUploadQueue();

  } finally {
    isProcessing = false;
  }
}

async function handleDecodedText(text){
  if (isProcessing) return;
  await handleScan(text);
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

    try {
      await configureCameraControls();
    } catch (_) {
      resetCameraControls();
    }

    hideExternalBrowserHelp();
    setResult("V43 小型 QR 掃描中・請讓貼紙對準縮小後的白框");

  } catch(e) {
    try {
      if (scanner) {
        await scanner.stop().catch(() => {});
        scanner.clear();
      }
    } catch (_) {}

    scanner = null;
    resetCameraControls();

    const errorText = e && e.message ? e.message : String(e || "");
    const permissionDenied =
      (e && e.name === "NotAllowedError") ||
      /NotAllowedError|Permission denied|permission/i.test(errorText);

    if (isAndroidDevice() && permissionDenied) {
      showExternalBrowserHelp(true);
      notice(
        "err",
        "安卓 LINE 無法取得相機權限<br>" +
        "請按下方「使用 Chrome 開啟」"
      );
    } else {
      notice(
        "err",
        "開啟相機失敗<br>" +
        "請允許相機權限後重新整理<br>" +
        `<small>${errorText}</small>`
      );
    }
  }
}

async function stopScan(){
  if (scanner) {
    await scanner.stop().catch(() => {});
    scanner.clear();
    scanner = null;
    resetCameraControls();
    setResult("掃描已停止");
  }
}

$("#unlockDuplicateBtn").onclick = () => {
  const key = pendingDuplicateKey;

  if (!key) {
    hideDuplicateUnlock();
    return;
  }

  if (queueHasDuplicateKey(key)) {
    notice("err", "這筆仍在待上傳隊列中<br>完成上傳前不能解除");
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

};

$("#startBtn").onclick = startScan;
$("#stopBtn").onclick = stopScan;
$("#openChromeBtn").onclick = openInChrome;

const torchButton = $("#torchBtn");
if (torchButton) torchButton.onclick = toggleTorch;

document.querySelectorAll(".zoom-btn").forEach(button => {
  button.onclick = () => applyCameraZoom(button.dataset.zoom);
});

window.addEventListener("online", processUploadQueue);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) processUploadQueue();
});
updateQueueStatus();
processUploadQueue();
