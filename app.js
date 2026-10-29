import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  update,
  get
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const deviceId = "ESP32_01";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const els = {
  connection: document.getElementById("connection"),
  soil: document.getElementById("soil"),
  waterRaw: document.getElementById("waterRaw"),
  pumpState: document.getElementById("pumpState"),
  mode: document.getElementById("mode"),
  runtime: document.getElementById("runtime"),
  ipAddress: document.getElementById("ipAddress"),
  firmware: document.getElementById("firmware"),
  lastSeen: document.getElementById("lastSeen"),
  controlMsg: document.getElementById("controlMsg"),
  powerBtn: document.getElementById("powerBtn"),
  pumpBtn: document.getElementById("pumpBtn"),
  autoBtn: document.getElementById("autoBtn"),
  manualBtn: document.getElementById("manualBtn"),
  settingsForm: document.getElementById("settingsForm"),
  soilDryPercent: document.getElementById("soilDryPercent"),
  soilTargetPercent: document.getElementById("soilTargetPercent"),
  maxPumpRunTimeMinutes: document.getElementById("maxPumpRunTimeMinutes"),
  canvas: document.getElementById("chart")
};

const ctx = els.canvas.getContext("2d");
let latestSensors = {};
let latestStatus = {};
let chartData = [];

const basePath = `devices/${deviceId}`;
const sensorsRef = ref(db, `${basePath}/sensors`);
const statusRef = ref(db, `${basePath}/status`);
const settingsRef = ref(db, `${basePath}/settings`);
const commandsRef = ref(db, `${basePath}/commands`);
const historyRef = ref(db, `${basePath}/history`);

function fmtTime(v) {
  if (!v) return "--";
  const d = new Date(v);
  return isNaN(d) ? "--" : d.toLocaleString();
}

function drawChart() {
  const values = chartData.slice(-30).map(x => x.soilAvg ?? x.zone1 ?? 0);
  const w = els.canvas.width;
  const h = els.canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  if (!values.length) {
    ctx.fillStyle = "#666";
    ctx.fillText("No history yet", 20, 30);
    return;
  }

  const min = 0;
  const max = 100;
  const pad = 30;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  ctx.strokeStyle = "#e0e0e0";
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();

  ctx.strokeStyle = "#1b5e20";
  ctx.lineWidth = 2;
  ctx.beginPath();

  values.forEach((v, i) => {
    const x = pad + (innerW * i) / Math.max(values.length - 1, 1);
    const y = pad + innerH - ((v - min) / (max - min)) * innerH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

function refreshUI() {
  const s = latestSensors || {};
  const st = latestStatus || {};

  els.soil.textContent = s.soilZone1 != null ? `${s.soilZone1}%` : "--";
  els.waterRaw.textContent = s.waterRaw != null ? s.waterRaw : "--";
  els.pumpState.textContent = st.pumpOn ? "ON" : "OFF";
  els.mode.textContent = st.mode || "--";
  els.runtime.textContent = st.activeRunSeconds != null ? `${st.activeRunSeconds}s` : "--";
  els.ipAddress.textContent = st.ipAddress || "--";
  els.firmware.textContent = st.metaFirmware || st.firmwareVersion || "--";
  els.lastSeen.textContent = fmtTime(s.lastSeenEpochMs);
  els.connection.textContent = "Live data connected";
}

onValue(sensorsRef, (snap) => {
  latestSensors = snap.val() || {};
  refreshUI();
});

onValue(statusRef, (snap) => {
  latestStatus = snap.val() || {};
  refreshUI();
});

onValue(settingsRef, (snap) => {
  const s = snap.val() || {};
  els.soilDryPercent.value = s.soilDryPercent ?? 30;
  els.soilTargetPercent.value = s.soilTargetPercent ?? 65;
  els.maxPumpRunTimeMinutes.value = s.maxPumpRunTimeMinutes ?? 15;
});

onValue(historyRef, (snap) => {
  const d = snap.val() || {};
  chartData = Object.values(d).sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
  drawChart();
});

async function writeCommand(payload) {
  els.controlMsg.textContent = "Saving...";
  await update(commandsRef, payload);
  els.controlMsg.textContent = "Saved";
  setTimeout(() => (els.controlMsg.textContent = ""), 1500);
}

els.powerBtn.addEventListener("click", async () => {
  const current = latestStatus.power ?? true;
  await writeCommand({ power: !current });
});

els.pumpBtn.addEventListener("click", async () => {
  const current = latestStatus.pumpOn ?? false;
  await writeCommand({ pump: !current });
});

els.autoBtn.addEventListener("click", async () => {
  await writeCommand({ mode: "AUTO" });
});

els.manualBtn.addEventListener("click", async () => {
  await writeCommand({ mode: "MANUAL" });
});

els.settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  await update(settingsRef, {
    soilDryPercent: Number(els.soilDryPercent.value),
    soilTargetPercent: Number(els.soilTargetPercent.value),
    maxPumpRunTimeMinutes: Number(els.maxPumpRunTimeMinutes.value)
  });

  els.controlMsg.textContent = "Settings saved";
  setTimeout(() => (els.controlMsg.textContent = ""), 1500);
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});
