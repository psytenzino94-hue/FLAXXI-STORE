const $ = s => document.querySelector(s);
let currentKey = "";
async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({ error: "Invalid server response" }));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}
function showApp() { $("#loginView").hidden = true; $("#appView").hidden = false; refresh(); }
function showLogin() { $("#appView").hidden = true; $("#loginView").hidden = false; }
async function checkSession() {
  try { await api("/api/auth/me"); showApp(); } catch { showLogin(); }
}
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#loginError").textContent = "";
  const form = new FormData(e.currentTarget);
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
    e.currentTarget.reset(); showApp();
  } catch (err) { $("#loginError").textContent = err.message; }
});
$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: "{}" }); showLogin();
});
async function refresh() {
  try {
    const data = await api("/api/licenses");
    const rows = $("#licenseRows");
    $("#totalCount").textContent = data.count;
    $("#activeCount").textContent = data.licenses.filter(x => x.status === "active" && Date.parse(x.expiresAt) > Date.now()).length;
    $("#revokedCount").textContent = data.licenses.filter(x => x.status === "revoked").length;
    if (!data.licenses.length) { rows.innerHTML = '<tr><td colspan="5" class="empty">No licenses yet.</td></tr>'; return; }
    rows.replaceChildren(...data.licenses.map(item => {
      const tr = document.createElement("tr");
      const customer = document.createElement("td");
      const key = document.createElement("span"); key.className = "key-cell"; key.textContent = item.key;
      const label = document.createElement("span"); label.className = "sub-cell"; label.textContent = item.label || "No customer label";
      customer.append(key, label);
      const status = document.createElement("td");
      const pill = document.createElement("span"); pill.className = "status" + (item.status !== "active" ? " revoked" : "");
      const expired = Date.parse(item.expiresAt) <= Date.now();
      pill.textContent = item.status === "revoked" ? "REVOKED" : expired ? "EXPIRED" : "ACTIVE";
      status.append(pill);
      const expiry = document.createElement("td"); expiry.textContent = new Date(item.expiresAt).toLocaleDateString();
      const devices = document.createElement("td"); devices.textContent = `${(item.devices || []).length} / ${item.deviceLimit}`;
      const actions = document.createElement("td");
      const copy = document.createElement("button"); copy.className = "action-btn"; copy.textContent = "Copy";
      copy.addEventListener("click", () => navigator.clipboard.writeText(item.key).then(() => toast("Key copied")));
      actions.append(copy);
      if (item.status === "active") {
        const revoke = document.createElement("button"); revoke.className = "action-btn danger"; revoke.textContent = "Revoke";
        revoke.addEventListener("click", async () => { if (confirm("Revoke this license?")) { await api(`/api/licenses/${encodeURIComponent(item.id)}/revoke`, { method: "POST", body: "{}" }); refresh(); toast("License revoked"); } });
        actions.append(revoke);
      }
      tr.append(customer, status, expiry, devices, actions); return tr;
    }));
  } catch (err) { toast(err.message); }
}
$("#licenseForm").addEventListener("submit", async e => {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  const payload = Object.fromEntries(f.entries());
  payload.durationDays = Number(payload.durationDays); payload.deviceLimit = Number(payload.deviceLimit);
  try {
    const data = await api("/api/licenses", { method: "POST", body: JSON.stringify(payload) });
    currentKey = data.license.key; $("#keyOutput").textContent = currentKey; $("#keyOutput").classList.add("ready");
    $("#copyBtn").disabled = false;
    $("#keyMeta").textContent = `Expires ${new Date(data.license.expiresAt).toLocaleString()} · ${data.license.deviceLimit} device(s)`;
    refresh(); toast("License generated");
  } catch (err) { toast(err.message); }
});
$("#copyBtn").addEventListener("click", async () => {
  if (!currentKey) return;
  await navigator.clipboard.writeText(currentKey); toast("Key copied");
});
$("#refreshBtn").addEventListener("click", refresh);
$("#apiForm").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const method = f.get("method");
  const path = String(f.get("path") || "").trim();
  const out = $("#apiOutput");
  // Strictly same-origin API paths only; no arbitrary URL fetching or proxying.
  if (!/^\/api\/[a-zA-Z0-9/_-]*(\?[a-zA-Z0-9_=&-]*)?$/.test(path)) {
    out.textContent = "Blocked: enter a relative /api/... path only."; return;
  }
  let body;
  if (method !== "GET") {
    try { body = JSON.stringify(f.get("body") ? JSON.parse(f.get("body")) : {}); }
    catch { out.textContent = "Request body must be valid JSON."; return; }
  }
  out.textContent = "Sending request…";
  try {
    const response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...(body ? { body } : {}) });
    const text = await response.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    out.textContent = `HTTP ${response.status} ${response.statusText}\n\n` + (typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2));
  } catch (err) { out.textContent = `Request error: ${err.message}`; }
});
checkSession();
