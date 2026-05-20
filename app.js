"use strict";

const DB_NAME = "srkr_company_suite";
const DB_VERSION = 1;
const STORES = ["profile", "invoices", "mis", "bills"];
let db;
let deferredInstall;
let state = { profile: {}, invoices: [], mis: [], bills: [] };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const defaults = {
  companyName: "SRI RADHE KRISHNA ROADLINES",
  tagline: "Transport Contractor",
  owner: "SRI RADHE KRISHNA ROADLINES",
  mobile: "9939269234, 6207178839",
  email: "srkrroadlines9792@gmail.com",
  gstin: "",
  address: "Lowk, Near Vir Kuwar Singh Park, Ranchi 834001",
  bank: ""
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  db = await openDb();
  await loadAll();
  bindUi();
  setTodayDefaults();
  renderAll();
  registerServiceWorker();
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("profile")) database.createObjectStore("profile", { keyPath: "id" });
      ["invoices", "mis", "bills"].forEach((store) => {
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store, { keyPath: "id", autoIncrement: true });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(store, mode = "readonly") {
  return db.transaction(store, mode).objectStore(store);
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    const request = tx(store).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function put(store, value) {
  return new Promise((resolve, reject) => {
    const request = tx(store, "readwrite").put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function clearStore(store) {
  return new Promise((resolve, reject) => {
    const request = tx(store, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadAll() {
  const profileRows = await getAll("profile");
  state.profile = { ...defaults, ...(profileRows.find((row) => row.id === "main") || {}) };
  state.invoices = (await getAll("invoices")).sort((a, b) => b.invoiceNo - a.invoiceNo);
  state.mis = (await getAll("mis")).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  state.bills = (await getAll("bills")).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function bindUi() {
  $$(".tab").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.tab)));
  $("#profileForm").addEventListener("submit", saveProfile);
  $("#invoiceForm").addEventListener("submit", saveInvoice);
  $("#misForm").addEventListener("submit", saveMis);
  $("#billForm").addEventListener("submit", saveBill);
  $("#newInvoiceBtn").addEventListener("click", resetInvoiceForm);
  $("#invoiceSearch").addEventListener("input", renderInvoices);
  $("#exportBtn").addEventListener("click", exportBackup);
  $("#importBtn").addEventListener("click", importBackup);
  $$("[data-print]").forEach((button) => button.addEventListener("click", () => printModule(button.dataset.print)));
  $("#invoiceForm").elements.amount.addEventListener("input", updateWords);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event;
    $("#installBtn").hidden = false;
  });
  $("#installBtn").addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall = null;
    $("#installBtn").hidden = true;
  });
}

function showTab(id) {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === id));
  $$(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === id));
}

function setTodayDefaults() {
  const today = new Date().toISOString().slice(0, 10);
  ["invoiceForm", "misForm", "billForm"].forEach((formId) => {
    const form = $(`#${formId}`);
    const input = form.elements.date || form.elements.invoiceDate;
    if (input && !input.value) input.value = today;
  });
  resetInvoiceForm();
}

function fillForm(form, data) {
  Object.keys(data).forEach((key) => {
    if (form.elements[key]) form.elements[key].value = data[key] || "";
  });
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function saveProfile(event) {
  event.preventDefault();
  const data = { ...readForm(event.currentTarget), id: "main" };
  await put("profile", data);
  await loadAll();
  renderAll();
  toast("Branding saved");
}

async function saveInvoice(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = {
    invoiceNo: Number(form.elements.invoiceNo.value),
    invoiceDate: form.elements.invoiceDate.value,
    description: form.elements.description.value.trim(),
    monthFrom: form.elements.monthFrom.value,
    monthTo: form.elements.monthTo.value,
    amount: Number(form.elements.amount.value),
    createdAt: new Date().toISOString()
  };
  if (!data.description || !data.invoiceDate || !data.monthFrom || !data.monthTo || !data.amount) return toast("Invoice fields blank nahi rahenge");
  const old = state.invoices.find((invoice) => invoice.invoiceNo === data.invoiceNo);
  await put("invoices", old ? { ...old, ...data } : data);
  await loadAll();
  renderAll();
  resetInvoiceForm();
  toast("Invoice saved");
}

async function saveMis(event) {
  event.preventDefault();
  const data = { ...readForm(event.currentTarget), amount: Number(event.currentTarget.elements.amount.value), createdAt: new Date().toISOString() };
  await put("mis", data);
  event.currentTarget.reset();
  setTodayDefaults();
  await loadAll();
  renderAll();
  toast("MIS saved");
}

async function saveBill(event) {
  event.preventDefault();
  const data = { ...readForm(event.currentTarget), amount: Number(event.currentTarget.elements.amount.value), createdAt: new Date().toISOString() };
  await put("bills", data);
  event.currentTarget.reset();
  setTodayDefaults();
  await loadAll();
  renderAll();
  toast("Bill saved");
}

function resetInvoiceForm() {
  const form = $("#invoiceForm");
  const today = new Date().toISOString().slice(0, 10);
  form.reset();
  form.elements.invoiceNo.value = nextInvoiceNo();
  form.elements.invoiceDate.value = today;
  updateWords();
}

function nextInvoiceNo() {
  return state.invoices.reduce((max, invoice) => Math.max(max, Number(invoice.invoiceNo || 0)), 0) + 1;
}

function updateWords() {
  $("#invoiceWords").textContent = amountToIndianWords(Number($("#invoiceForm").elements.amount.value || 0));
}

function renderAll() {
  fillForm($("#profileForm"), state.profile);
  renderBindings();
  renderDashboard();
  renderInvoices();
  renderMis();
  renderBills();
  renderBalance();
}

function renderBindings() {
  $$("[data-bind]").forEach((node) => {
    node.textContent = state.profile[node.dataset.bind] || "";
  });
  $("#factOwner").textContent = state.profile.owner || "-";
  $("#factMobile").textContent = state.profile.mobile || "-";
  $("#factGstin").textContent = state.profile.gstin || "-";
  $("#factEmail").textContent = state.profile.email || "-";
}

function renderDashboard() {
  const income = sum(state.invoices, "amount") + sum(state.mis, "amount");
  const expense = sum(state.bills, "amount");
  $("#dashIncome").textContent = money(income);
  $("#dashExpense").textContent = money(expense);
  $("#dashBalance").textContent = money(income - expense);
  $("#dashInvoices").textContent = String(state.invoices.length);
  const recent = [
    ...state.invoices.map((row) => ({ label: `Invoice ${row.invoiceNo}`, date: row.invoiceDate, amount: row.amount })),
    ...state.mis.map((row) => ({ label: `MIS ${row.vehicle}`, date: row.date, amount: row.amount })),
    ...state.bills.map((row) => ({ label: `Bill ${row.type}`, date: row.date, amount: -row.amount }))
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  $("#recentList").innerHTML = recent.length ? table(["Date", "Particular", "Amount"], recent.map((r) => [dateShort(r.date), r.label, money(r.amount)])) : "No entries yet.";
}

function renderInvoices() {
  const search = $("#invoiceSearch").value.trim();
  const rows = state.invoices.filter((row) => !search || String(row.invoiceNo).includes(search));
  $("#invoiceList").innerHTML = table(["Invoice No.", "Date", "Description", "Month", "Amount", "Action"], rows.map((row) => [
    row.invoiceNo,
    dateShort(row.invoiceDate),
    row.description,
    `${dateLong(row.monthFrom)} To ${dateLong(row.monthTo)}`,
    money(row.amount),
    `<div class="row-actions"><button type="button" onclick="editInvoice(${row.invoiceNo})">Edit</button></div>`
  ]));
}

window.editInvoice = (invoiceNo) => {
  const row = state.invoices.find((invoice) => invoice.invoiceNo === invoiceNo);
  if (!row) return;
  const form = $("#invoiceForm");
  fillForm(form, row);
  updateWords();
  showTab("invoice");
};

function renderMis() {
  $("#misList").innerHTML = table(["Date", "Vehicle", "Party", "Route", "Ref", "Amount"], state.mis.map((row) => [
    dateShort(row.date), row.vehicle, row.party, row.route || "", row.reference || "", money(row.amount)
  ]));
}

function renderBills() {
  $("#billList").innerHTML = table(["Date", "Type", "Vendor", "Bill No.", "Amount", "Notes"], state.bills.map((row) => [
    dateShort(row.date), row.type, row.vendor, row.billNo || "", money(row.amount), row.notes || ""
  ]));
}

function renderBalance() {
  const invoiceIncome = sum(state.invoices, "amount");
  const misIncome = sum(state.mis, "amount");
  const expense = sum(state.bills, "amount");
  $("#balanceSheet").innerHTML = `
    <section class="balance-box">
      <h2>Assets / Income</h2>
      <div class="balance-row"><span>Invoice Income</span><strong>${money(invoiceIncome)}</strong></div>
      <div class="balance-row"><span>MIS Income</span><strong>${money(misIncome)}</strong></div>
      <div class="balance-row"><span>Total Income</span><strong>${money(invoiceIncome + misIncome)}</strong></div>
    </section>
    <section class="balance-box">
      <h2>Liabilities / Expenses</h2>
      <div class="balance-row"><span>Total Bills</span><strong>${money(expense)}</strong></div>
      <div class="balance-row"><span>Closing Balance</span><strong>${money(invoiceIncome + misIncome - expense)}</strong></div>
    </section>
  `;
}

function table(headers, rows) {
  if (!rows.length) return `<div class="empty">No records.</div>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function printModule(type) {
  const area = $("#printArea");
  const head = printHead();
  if (type === "invoice") area.innerHTML = printInvoice();
  if (type === "business-card") area.innerHTML = `<div class="print-sheet">${$("#businessCardPrint").innerHTML}</div>`;
  if (type === "letterhead") area.innerHTML = `<div class="print-sheet">${head}<div style="height:220mm"></div><p><strong>Authorized Signatory</strong></p></div>`;
  if (type === "mis") area.innerHTML = `<div class="print-sheet">${head}<h2>MIS Register</h2>${$("#misList").innerHTML}</div>`;
  if (type === "bills") area.innerHTML = `<div class="print-sheet">${head}<h2>Bill Register</h2>${$("#billList").innerHTML}</div>`;
  if (type === "balance") area.innerHTML = `<div class="print-sheet">${head}<h2>Balance Sheet</h2>${$("#balanceSheet").innerHTML}</div>`;
  window.print();
}

function printHead() {
  return `<header class="print-head"><img src="assets/image2.png" alt=""><div><h2>${state.profile.companyName}</h2><p>${state.profile.address}</p><p>Mob: ${state.profile.mobile}</p><p>${state.profile.email}</p></div></header>`;
}

function printInvoice() {
  const form = $("#invoiceForm");
  const invoice = readForm(form);
  invoice.amount = Number(form.elements.amount.value || 0);
  return `<div class="print-sheet">${printHead()}<h2>INVOICE BILL</h2>
    <table class="print-table">
      <tr><th colspan="2">TO, TVS SUPPLY CHAIN<br>SOLUTIONS LTD RANCHI<br>JHARKHAND<br>GSTIN: 20AACCT1412E1Z9</th><th colspan="2">INVOICE NO.: ${invoice.invoiceNo}<br>INVOICE DATE ${dateShort(invoice.invoiceDate)}</th></tr>
      <tr><th>SERIAL NO.</th><th>DESCRIPTION</th><th>MONTH OF BILL</th><th>AMOUNT</th></tr>
      <tr><td>01</td><td>${invoice.description || ""}</td><td>${dateLong(invoice.monthFrom)} To ${dateLong(invoice.monthTo)}</td><td>${money(invoice.amount)}</td></tr>
      <tr><th colspan="3">Net Amount</th><th>${money(invoice.amount)}</th></tr>
    </table>
    <p><strong>AMOUNT IN WORDS: ${amountToIndianWords(invoice.amount)}</strong></p>
    <p>AGENCY (GTA) IS EXEMPT UNDER GST as per entry no. 22 of Notification No. 12/2017 Central Tax Rate 28,2017.</p>
  </div>`;
}

async function exportBackup() {
  const payload = { exportedAt: new Date().toISOString(), version: 1, data: state };
  download(`srkr-business-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
}

async function importBackup() {
  const file = $("#importFile").files[0];
  if (!file) return toast("Backup JSON select karo");
  const payload = JSON.parse(await file.text());
  const data = payload.data || payload;
  for (const store of STORES) await clearStore(store);
  await put("profile", { ...(data.profile || defaults), id: "main" });
  for (const row of data.invoices || []) await put("invoices", row);
  for (const row of data.mis || []) await put("mis", row);
  for (const row of data.bills || []) await put("bills", row);
  await loadAll();
  renderAll();
  toast("Backup imported");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function dateShort(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function dateLong(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return `${date.getDate()} ${date.toLocaleString("en-IN", { month: "short" })} ${date.getFullYear()}`;
}

function amountToIndianWords(amount) {
  const number = Math.floor(Number(amount || 0));
  if (!number) return "Rupees Zero Only.";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim());
  const three = (n) => `${n > 99 ? `${ones[Math.floor(n / 100)]} Hundred ` : ""}${two(n % 100)}`.trim();
  const parts = [];
  let n = number;
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${three(lakh)} Lakh`);
  if (thousand) parts.push(`${three(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return `Rupees ${parts.join(" ")} Only.`;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2200);
}
