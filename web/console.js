/* 虚拟机网页控制台：noVNC + 服务端 WebSocket 代理 */
const $ = (sel, root) => (root || document).querySelector(sel);

const params = new URLSearchParams(location.search);
const vmName = String(params.get("vm") || "").trim();

let rfb = null;
let closing = false;
let csrf = "";

const overlay = $("#overlay");
const spinner = $("#spinner");
const overlayTitle = $("#overlay-title");
const overlayText = $("#overlay-text");
const overlayCode = $("#overlay-code");
const overlayActions = $("#overlay-actions");
const btnCad = $("#btn-cad");

function setOverlay(opts) {
  opts = opts || {};
  overlay.classList.remove("is-hidden");
  spinner.hidden = !opts.spinner;
  overlayTitle.textContent = opts.title || "";
  overlayText.textContent = opts.text || "";
  if (opts.code) {
    overlayCode.hidden = false;
    overlayCode.textContent = opts.code;
  } else {
    overlayCode.hidden = true;
    overlayCode.textContent = "";
  }
  overlayActions.replaceChildren();
  (opts.actions || []).forEach(function (a) {
    var el;
    if (a.href) {
      el = document.createElement("a");
      el.href = a.href;
      el.className = "btn " + (a.kind === "primary" ? "btn-primary" : "btn-text");
    } else {
      el = document.createElement("button");
      el.type = "button";
      el.className = "btn " + (a.kind === "primary" ? "btn-primary" : "btn-text");
      el.addEventListener("click", a.onClick);
    }
    el.textContent = a.label;
    overlayActions.appendChild(el);
  });
}

function hideOverlay() {
  overlay.classList.add("is-hidden");
}

function showError(title, text, extra) {
  setOverlay({
    title: title,
    text: text || "",
    code: extra && extra.code,
    spinner: false,
    actions: [
      { label: "重新连接", kind: "primary", onClick: function () { location.reload(); } },
      { label: "返回控制台", href: "/?view=vms" }
    ]
  });
  btnCad.disabled = true;
}

async function rpc(method, p) {
  if (!csrf) {
    var me = await fetch("/api/me", { headers: { Accept: "application/json" } });
    if (me.status === 401) {
      location.href = "/";
      throw new Error("未登录");
    }
    var who = await me.json();
    csrf = who.csrf || "";
  }
  var r = await fetch("/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debnas-CSRF": csrf },
    body: JSON.stringify({ method: method, params: p || {} })
  });
  var d = {};
  try { d = await r.json(); } catch (e) { /* 忽略非 JSON */ }
  if (!r.ok || d.error) throw new Error(d.error || "请求失败（HTTP " + r.status + "）");
  return d.data;
}

function wsUrl(path) {
  var proto = location.protocol === "https:" ? "wss://" : "ws://";
  return proto + location.host + path;
}

function setConnected(connected) {
  btnCad.disabled = !connected;
  $("#vm-sub").textContent = connected ? "已连接 · 点击画面捕获键盘" : "未连接";
}

async function main() {
  if (!vmName) {
    showError("缺少虚拟机名称", "请从控制台的「虚拟机」页面打开控制台。");
    return;
  }
  document.title = vmName + " · 虚拟机控制台";
  $("#vm-name").textContent = vmName;
  setOverlay({ title: "正在连接…", text: "获取 VNC 连接信息", spinner: true });

  var info;
  try {
    info = await rpc("vm_console", { name: vmName });
  } catch (err) {
    showError("无法打开控制台", err && err.message ? err.message : String(err), {
      code: vmName
    });
    return;
  }

  $("#vm-sub").textContent = "VNC " + info.listen + ":" + info.port;
  if (!info.novnc) {
    showError("noVNC 资源未部署", "重新执行部署脚本会把可视化组件装上。", {
      code: "sudo ./deploy-web.sh\n\n直连地址：" + info.direct +
        "\nSSH 隧道：" + info.tunnel
    });
    return;
  }

  var RFB;
  try {
    RFB = (await import("./novnc/core/rfb.js")).default;
  } catch (err) {
    showError("noVNC 资源加载失败", String(err && err.message || err), {
      code: "sudo ./deploy-web.sh"
    });
    return;
  }

  try {
    var opts = { shared: true, wsProtocols: ["binary"] };
    if (info.password) opts.credentials = { password: info.password };
    rfb = new RFB($("#screen"), wsUrl(info.wsPath), opts);
  } catch (err) {
    showError("初始化 noVNC 失败", String(err && err.message || err));
    return;
  }

  rfb.scaleViewport = true;
  rfb.resizeSession = false;
  rfb.background = "#0b0b10";

  rfb.addEventListener("connect", function () {
    hideOverlay();
    setConnected(true);
    try { rfb.focus(); } catch (e) { /* ignore */ }
    $("#screen").focus();
  });

  rfb.addEventListener("disconnect", function (ev) {
    setConnected(false);
    if (closing) return;
    var clean = ev && ev.detail && ev.detail.clean;
    showError("连接已断开", clean ? "已正常断开。" : "VNC 连接中断，虚拟机可能已关机或被强制停止。");
  });

  rfb.addEventListener("securityfailure", function (ev) {
    var detail = ev && ev.detail || {};
    var msg = detail.reason || ("安全协商失败（状态 " + detail.status + "）");
    showError("VNC 认证失败", msg);
  });

  rfb.addEventListener("credentialsrequired", function () {
    var pw = window.prompt("该虚拟机需要 VNC 密码");
    if (pw) {
      rfb.sendCredentials({ password: pw });
    } else {
      closing = true;
      rfb.disconnect();
    }
  });
}

$("#btn-cad").addEventListener("click", function () {
  if (rfb) rfb.sendCtrlAltDel();
});

$("#btn-full").addEventListener("click", function () {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(function () {
      /* 浏览器拒绝时静默 */
    });
  } else {
    document.exitFullscreen();
  }
});

document.addEventListener("fullscreenchange", function () {
  $("#btn-full").textContent = document.fullscreenElement ? "退出全屏" : "全屏";
});

$("#btn-close").addEventListener("click", function () {
  closing = true;
  try { if (rfb) rfb.disconnect(); } catch (e) { /* ignore */ }
  location.href = "/?view=vms";
});

$("#screen").addEventListener("click", function () {
  if (rfb) {
    try { rfb.focus(); } catch (e) { /* ignore */ }
  }
});

window.addEventListener("beforeunload", function () {
  closing = true;
  try { if (rfb) rfb.disconnect(); } catch (e) { /* ignore */ }
});

main().catch(function (err) {
  showError("控制台异常", String(err && err.message || err));
});
