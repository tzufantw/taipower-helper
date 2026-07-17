const GAS_URL = "https://script.google.com/macros/s/AKfycbzq2ywkhggukhdVMcKaEb37mi8tFGM-DmysCOBX_cvX9MCfXp8t-yA7we-xkyVi9dQK/exec";

const ACCOUNTS = {
  A001:{password:"1234",name:"師傅A001"}, A002:{password:"1234",name:"師傅A002"},
  A003:{password:"1234",name:"師傅A003"}, A004:{password:"1234",name:"師傅A004"},
  A005:{password:"1234",name:"師傅A005"}, A006:{password:"1234",name:"師傅A006"},
  A007:{password:"1234",name:"師傅A007"}, A008:{password:"1234",name:"師傅A008"},
  A009:{password:"1234",name:"師傅A009"}, A010:{password:"1234",name:"師傅A010"},
  A011:{password:"1234",name:"師傅A011"}, A012:{password:"1234",name:"師傅A012"},
  A013:{password:"1234",name:"師傅A013"}, A014:{password:"1234",name:"師傅A014"},
  A015:{password:"1234",name:"師傅A015"}, A016:{password:"1234",name:"師傅A016"},
  A017:{password:"1234",name:"師傅A017"}, A018:{password:"1234",name:"師傅A018"},
  A019:{password:"1234",name:"師傅A019"}, A020:{password:"1234",name:"師傅A020"}
};

const $ = s => document.querySelector(s);

let scanner = null;
let user = JSON.parse(localStorage.getItem("tph_user") || "null");
let lastRaw = "";
let lastTime = 0;
let isProcessing = false;
let todayCount = Number(localStorage.getItem("tph_count_" + todayKey()) || "0");

function todayKey(){
  return new Date().toISOString().slice(0,10);
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
  setStatus("已登入");
}

function showLogin(){
  $("#loginCard").classList.remove("hidden");
  $("#scanCard").classList.add("hidden");
  setStatus("請登入");
}

if (user) showApp();

$("#loginBtn").onclick = () => {
  const id = $("#username").value.trim().toUpperCase();
  const pwd = $("#password").value.trim();

  if (!ACCOUNTS[id]) return alert("帳號不存在");
  if (ACCOUNTS[id].password !== pwd) return alert("密碼錯誤");

  user = { id, name: ACCOUNTS[id].name };
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

  isProcessing = true;
  lastRaw = raw;
  lastTime = now;

  const parsed = parseQR(raw);

  if (!parsed) {
    notice("err", "QR 解析失敗<br>請重新掃描");
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

  scanner = new Html5Qrcode("reader");

  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      text => handleScan(text)
    );

    setResult("掃描中，請對準 QR Code");

  } catch(e) {
    scanner = null;
    notice("err", "開啟相機失敗<br>請檢查相機權限");
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

$("#startBtn").onclick = startScan;
$("#stopBtn").onclick = stopScan;
