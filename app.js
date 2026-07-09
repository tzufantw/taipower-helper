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
let todayCount = Number(localStorage.getItem("tph_count_" + todayKey()) || "0");

function todayKey(){ return new Date().toISOString().slice(0,10); }
function setStatus(t){ $("#status").textContent = t; }

function showApp(){
  $("#loginCard").classList.add("hidden");
  $("#scanCard").classList.remove("hidden");
  $("#engineerName").textContent = `${user.name}（${user.id}）`;
  $("#todayCount").textContent = todayCount;
  setStatus("已登入");
}
function showLogin(){
  $("#loginCard").classList.remove("hidden");
  $("#scanCard").classList.add("hidden");
  setStatus("未登入");
}
if(user) showApp();

$("#loginBtn").onclick = () => {
  const id = $("#username").value.trim();
  const pwd = $("#password").value.trim();
  if(!ACCOUNTS[id]) return alert("帳號不存在");
  if(ACCOUNTS[id].password !== pwd) return alert("密碼錯誤");
  user = { id, name: ACCOUNTS[id].name };
  localStorage.setItem("tph_user", JSON.stringify(user));
  showApp();
};

$("#logoutBtn").onclick = () => {
  localStorage.removeItem("tph_user");
  user = null;
  showLogin();
};

function showCenter(type, html){
  let box = $("#centerMsg");
  if(!box){
    box = document.createElement("div");
    box.id = "centerMsg";
    document.body.appendChild(box);
  }
  box.className = "centerMsg " + type;
  box.innerHTML = html;
  box.style.display = "block";
  clearTimeout(window.msgTimer);
  window.msgTimer = setTimeout(()=>{ box.style.display = "none"; }, 1000);
}

function beep(type){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === "dup" ? 350 : type === "err" ? 220 : 900;
    gain.gain.value = 0.2;
    osc.start();
    setTimeout(()=>{ osc.stop(); ctx.close(); }, type === "err" ? 350 : 180);
  }catch(e){}
}

function vibrate(type){
  if(!navigator.vibrate) return;
  if(type === "dup") navigator.vibrate([120,80,120]);
  else if(type === "err") navigator.vibrate([300]);
  else navigator.vibrate([120]);
}

function notice(type, html){
  beep(type);
  vibrate(type);
  showCenter(type, html);
}

function parseQR(raw){
  raw = String(raw || "").trim();
  const clean = raw.replace(/^L[o0]LA/i, "");
  const parts = clean.split(";").map(x=>x.trim()).filter(Boolean);

  if(parts.length >= 2){
    return {
      verify_no: parts[0],
      meter_no: parts[1],
      qr_raw: raw
    };
  }

  const nums = raw.match(/\d{5,12}/g) || [];
  if(nums.length >= 2){
    return {
      verify_no: nums[0],
      meter_no: nums[1],
      qr_raw: raw
    };
  }

  return null;
}

function jsonp(params){
  return new Promise((resolve, reject)=>{
    const cb = "cb_" + Date.now() + "_" + Math.floor(Math.random()*999999);
    params.callback = cb;
    const url = GAS_URL + "?" + new URLSearchParams(params).toString();
    const s = document.createElement("script");
    window[cb] = data => {
      delete window[cb];
      s.remove();
      resolve(data);
    };
    s.onerror = () => {
      delete window[cb];
      s.remove();
      reject(new Error("連線失敗"));
    };
    s.src = url;
    document.body.appendChild(s);
  });
}

async function handleScan(raw){
  const now = Date.now();
  if(raw === lastRaw && now - lastTime < 10000) return;

  lastRaw = raw;
  lastTime = now;

  const parsed = parseQR(raw);
  if(!parsed){
    notice("err", "❌ QR 格式錯誤<br>請重新掃描");
    return;
  }

  try{
    const res = await jsonp({
      action: "uploadSimple",
      account: user.id,
      name: user.name,
      meter_no: parsed.meter_no,
      verify_no: parsed.verify_no,
      qr_raw: parsed.qr_raw
    });

    if(res.status === "duplicate"){
      notice("dup", `⚠️ 今天已掃過<br>不重複寫入 Excel<br>電表：${parsed.meter_no}<br>檢定：${parsed.verify_no}`);
      return;
    }

    if(res.status === "ok"){
      todayCount++;
      localStorage.setItem("tph_count_" + todayKey(), String(todayCount));
      $("#todayCount").textContent = todayCount;
      notice("ok", `✅ 上傳成功<br>電表：${parsed.meter_no}<br>檢定：${parsed.verify_no}`);
      return;
    }

    notice("err", "❌ 上傳失敗<br>" + (res.message || "未知錯誤"));
  }catch(e){
    notice("err", "❌ 上傳失敗<br>" + e.message);
  }
}

async function startScan(){
  if(!user) return alert("請先登入");
  if(!window.Html5Qrcode) return alert("QR 掃描套件尚未載入，請確認網路。");
  if(scanner) return;

  scanner = new Html5Qrcode("reader");

  try{
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      text => handleScan(text)
    );
  }catch(e){
    scanner = null;
    notice("err", "❌ 相機啟動失敗<br>請允許相機權限");
  }
}

async function stopScan(){
  if(scanner){
    await scanner.stop().catch(()=>{});
    scanner.clear();
    scanner = null;
  }
}

$("#startBtn").onclick = startScan;
$("#stopBtn").onclick = stopScan;
