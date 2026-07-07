const GAS_URL = "https://script.google.com/macros/s/AKfycbzq2ywkhggukhdVMcKaEb37mi8tFGM-DmysCOBX_cvX9MCfXp8t-yA7we-xkyVi9dQK/exec";

const ACCOUNTS = {
  "A001": { password: "1234", name: "師傅A001" },
  "A002": { password: "1234", name: "師傅A002" },
  "A003": { password: "1234", name: "師傅A003" },
  "A004": { password: "1234", name: "師傅A004" },
  "A005": { password: "1234", name: "師傅A005" },
  "A006": { password: "1234", name: "師傅A006" },
  "A007": { password: "1234", name: "師傅A007" },
  "A008": { password: "1234", name: "師傅A008" },
  "A009": { password: "1234", name: "師傅A009" },
  "A010": { password: "1234", name: "師傅A010" }
};

const $ = s => document.querySelector(s);
let scanner = null;
let user = JSON.parse(localStorage.getItem("tph_team_user") || "null");
let localRows = JSON.parse(localStorage.getItem("tph_team_rows") || "[]");

function setStatus(text){ $("#net").textContent = text; }
function today(){ return new Date().toISOString().slice(0,10); }
function nowText(){ return new Date().toLocaleString("zh-TW"); }
function saveLocal(){ localStorage.setItem("tph_team_rows", JSON.stringify(localRows)); renderLocal(); }

function showApp(){
  $("#loginCard").classList.add("hidden");
  $("#appCard").classList.remove("hidden");
  $("#engineerName").textContent = `${user.name}（${user.id}）`;
  renderLocal();
}

function showLogin(){
  $("#loginCard").classList.remove("hidden");
  $("#appCard").classList.add("hidden");
}

if(user){ showApp(); setStatus("已登入"); }

$("#loginBtn").onclick = () => {
  const id = $("#username").value.trim();
  const pwd = $("#password").value.trim();
  if(!ACCOUNTS[id]) return alert("帳號不存在");
  if(ACCOUNTS[id].password !== pwd) return alert("密碼錯誤");
  user = { id, name: ACCOUNTS[id].name };
  localStorage.setItem("tph_team_user", JSON.stringify(user));
  setStatus("已登入");
  showApp();
};

$("#logoutBtn").onclick = () => {
  localStorage.removeItem("tph_team_user");
  user = null;
  setStatus("未登入");
  showLogin();
};

async function startScan(){
  if(!window.Html5Qrcode) return alert("QR 掃描套件尚未載入，請確認網路。");
  if(scanner) return;

  scanner = new Html5Qrcode("reader");

  try{
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      txt => {
        $("#qrRaw").value = txt;
        parseQR(txt);
        navigator.vibrate?.(120);
      }
    );
  }catch(e){
    alert("相機啟動失敗：" + e);
    scanner = null;
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

function parseQR(raw){
  raw = (raw || "").trim();
  if(!raw) return alert("沒有 QR 內容");

  let meter = "";
  let verify = "";

  try{
    const j = JSON.parse(raw);
    meter = j.meterNo || j.new_meter_no || j.電表號碼 || j.新電表號碼 || j.表號 || "";
    verify = j.verifyNo || j.verify_no || j.檢定號碼 || j.檢驗號碼 || j.檢號 || "";
  }catch(e){}

  if(!meter || !verify){
    raw.split(/[;\n,|]/).forEach(part => {
      const arr = part.split(/[:=：]/);
      if(arr.length < 2) return;

      const k = arr[0].trim().toLowerCase();
      const v = arr.slice(1).join("=").trim();

      if(["meterno","meter","newmeterno","電表號碼","新電表號碼","表號"].includes(k)) meter = v;
      if(["verifyno","verify","checkno","檢定號碼","檢驗號碼","檢號"].includes(k)) verify = v;
    });
  }

  if(!meter || !verify){
    const nums = raw.match(/\d{5,12}/g) || [];

    // 台電 QR 格式：LOLA檢定號碼;新電表號碼
    // 例如：LOLA15072060;02081166
    // nums[0] = 檢定號碼
    // nums[1] = 新電表號碼
    meter = meter || nums[1] || "";
    verify = verify || nums[0] || "";
  }

  $("#meterNo").value = meter;
  $("#verifyNo").value = verify;
}

$("#parseBtn").onclick = () => parseQR($("#qrRaw").value);

function clearForm(){
  $("#qrRaw").value = "";
  $("#meterNo").value = "";
  $("#verifyNo").value = "";
  $("#note").value = "";
}

$("#clearFormBtn").onclick = clearForm;

$("#uploadBtn").onclick = async () => {
  if(!user) return alert("請先登入");

  const meterNo = $("#meterNo").value.trim();
  const verifyNo = $("#verifyNo").value.trim();
  const qrRaw = $("#qrRaw").value.trim();
  const note = $("#note").value.trim();

  if(!meterNo) return alert("沒有新電表號碼");
  if(!verifyNo) return alert("沒有檢驗 / 檢定號碼");

  const row = {
    time: nowText(),
    date: today(),
    engineer_id: user.id,
    engineer_name: user.name,
    meter_no: meterNo,
    verify_no: verifyNo,
    qr_raw: qrRaw,
    note
  };

  localRows.push(row);
  saveLocal();

  try{
    await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(row)
    });

    alert("已上傳到 Excel / Google 試算表");
    clearForm();

  }catch(e){
    alert("上傳失敗，已保留在本機紀錄：" + e);
  }
};

function renderLocal(){
  const todayRows = localRows.filter(r => r.date === today());
  $("#todayCount").textContent = todayRows.length;

  $("#localList").textContent = localRows.length
    ? localRows.map((r,i)=>`${i+1}. ${r.time}｜${r.engineer_name}｜電表:${r.meter_no}｜檢驗:${r.verify_no}${r.note ? "｜"+r.note : ""}`).join("\n")
    : "尚無紀錄";
}

$("#clearLocalBtn").onclick = () => {
  if(confirm("確定清除本機紀錄？")){
    localRows = [];
    saveLocal();
  }
};

$("#exportCsvBtn").onclick = () => {
  if(!localRows.length) return alert("沒有資料");

  const cols = ["time","date","engineer_id","engineer_name","meter_no","verify_no","qr_raw","note"];
  const csv = [cols.join(",")]
    .concat(localRows.map(r => cols.map(c => `"${String(r[c]||"").replaceAll('"','""')}"`).join(",")))
    .join("\n");

  const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "台電換表掃描紀錄.csv";
  a.click();
};

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
