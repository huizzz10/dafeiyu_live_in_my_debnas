/* NAS 控制台 · 界面层 */
(function () {
  "use strict";

  var state = {
    user: null,
    view: "home",
    shares: [],
    users: [],
    info: null,
    loading: false
  };

  var VIEW_META = {
    home: { title: "总览", sub: "系统状态与最近活动" },
    shares: { title: "文件共享", sub: "Samba 共享目录的增删改" },
    users: { title: "用户与权限", sub: "系统账户与 Samba 访问" },
    storage: { title: "存储", sub: "磁盘、分区与挂载点" },
    network: { title: "网络", sub: "接口与地址" },
    services: { title: "服务", sub: "运行中的 systemd 服务" },
    updates: { title: "更新", sub: "系统补丁、组件与历史记录" },
    credentials: { title: "登录凭据", sub: "AstrBot / NapCat 面板入口（仅登录后可见）" },
    vms: { title: "虚拟机", sub: "创建、启停、快照与网页控制台" },
    logs: { title: "日志", sub: "journalctl 实时日志" },
    terminal: { title: "终端", sub: "以当前账号执行命令" },
    files: { title: "文件", sub: "浏览、上传与下载" },
    tools: { title: "工具", sub: "日志、终端与文件" }
  };

  var ACCENTS = [
    "#5b4bc4", "#00696d", "#b3261e", "#7b4e00",
    "#3f5aa6", "#8b4a68", "#2f6b3a", "#4a4a55"
  ];

  var ICONS = {
    logo: '<path d="M12 3 21 12 12 21 3 12z" fill="currentColor" stroke="none"/>',
    home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.4a3.2 3.2 0 0 1 0 5.2"/><path d="M17.4 14.4a5.5 5.5 0 0 1 3.1 5.6"/>',
    pencil: '<path d="m4 20 4.6-1L19 8.6a2.1 2.1 0 0 0-3-3L5.6 16z"/>',
    trash: '<path d="M4 7h16M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M6.5 7l1 12.2h9L17.5 7"/>',
    dots: '<circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    palette: '<path d="M12 21a9 9 0 1 1 9-9c0 2-1.6 3-3.4 3H16a2 2 0 0 0-1.6 3.2A1.9 1.9 0 0 1 12 21z"/><circle cx="8" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1.3" fill="currentColor" stroke="none"/>',
    chat: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6a8 8 0 1 1 18-5z"/><path d="M8.5 11h7M8.5 15h4"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 3 3-2 2 2 2-3 3-2-2-2 2"/>',
    group: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16.5 5.5a3 3 0 0 1 0 5"/><path d="M18 13.5a5 5 0 0 1 3 4.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 1.9"/>',
    wifi: '<path d="M2.5 8.8a15 15 0 0 1 19 0"/><path d="M5.6 12.3a10.5 10.5 0 0 1 12.8 0"/><path d="M8.8 15.8a6 6 0 0 1 6.4 0"/><circle cx="12" cy="19.1" r="1.15" fill="currentColor" stroke="none"/>',
    ethernet: '<rect x="3" y="8" width="18" height="10" rx="2"/><path d="M7 18v3M17 18v3M7 11h2M11 11h2M15 11h2"/>',
    router: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01M17 16.5h2M12 13V9M8.5 5.5 12 9l3.5-3.5"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M17 7.5h.01M17 16.5h.01"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/>',
    drive: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h.01M11 15h.01M15 15h.01M17 15h2"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    power: '<path d="M12 3v9"/><path d="M6.5 6.5a8 8 0 1 0 11 0"/>'
  };

  function icon(name, size) {
    var body = ICONS[name] || "";
    var px = size || 18;
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toast(msg, kind) {
    var stack = $("#toasts");
    var node = document.createElement("div");
    node.className = "toast " + (kind || "info");
    node.innerHTML = '<span class="toast-dot"></span><span>' + esc(msg) + "</span>";
    stack.appendChild(node);
    requestAnimationFrame(function () { node.classList.add("show"); });
    setTimeout(function () {
      node.classList.remove("show");
      setTimeout(function () { node.remove(); }, 320);
    }, 3200);
  }

  function copyText(txt) {
    var value = String(txt || "");
    if (!value) return;
    var done = function () { toast("已复制 " + value, "success"); };
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = value;
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;font-size:16px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { ta.setSelectionRange(0, value.length); } catch (e) {}
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      if (ok) done(); else toast("复制失败，请手动选择地址", "error");
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  function prettyHost(name) {
    var s = String(name || "").trim();
    if (!s || /^debnas$/i.test(s) || /^debiannas$/i.test(s)) return "Debian NAS";
    return s;
  }

  function fmtBytes(kb) {
    var n = Number(kb) * 1024;
    if (!n) return "—";
    var u = ["B", "KB", "MB", "GB", "TB"], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    var txt = n.toFixed(1).replace(/\.0$/, "");
    return txt + " " + u[i];
  }

  function fmtUptime(sec) {
    sec = Math.floor(sec);
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    if (d) return d + " 天 " + h + " 小时";
    if (h) return h + " 小时 " + m + " 分";
    return m + " 分钟";
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return "夜深了";
    if (h < 12) return "早上好";
    if (h < 18) return "下午好";
    return "晚上好";
  }


  /* ---------------- 实时面板 ---------------- */
  var inflight = {};
  function once(key, fn) {
    if (inflight[key]) return;
    inflight[key] = true;
    var done = function () { inflight[key] = false; };
    try {
      var r = fn();
      if (r && typeof r.then === "function") r.then(done, done);
      else done();
    } catch (e) { done(); }
  }

  var live = { started: false, realtimeTimer: null, qqTimer: null, appTimer: null, mihomoTimer: null, dsTimer: null, ifaceTimer: null, hwTimer: null, ifaceHist: [], netLast: null, netHist: [], pwHist: [] };
  var HIST_MAX = 45;

  function fmtRate(bps) {
    if (!bps || bps < 1) return "0 B/s";
    var u = ["B/s", "KB/s", "MB/s", "GB/s"], i = 0, n = bps;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(n >= 10 || i === 0 ? 0 : 1) + " " + u[i];
  }

  function niceMax(v) {
    if (!v || v <= 0) return 1;
    var exp = Math.floor(Math.log10(v));
    var base = Math.pow(10, exp);
    var f = v / base;
    var nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nice * base;
  }

  function themeColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function drawSpark(canvas, series, fmt) {
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 300;
    var h = canvas.clientHeight || 150;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var pad = 6;
    var top = 16, bottom = h - 5;
    var max = 0;
    series.forEach(function (s) {
      s.values.forEach(function (v) { if (v > max) max = v; });
    });
    max = niceMax(max);

    // 网格
    ctx.strokeStyle = themeColor("--outline-variant", "#ccc");
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 2; g++) {
      var y = top + (bottom - top) * (g / 2);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 刻度
    ctx.fillStyle = themeColor("--on-surface-variant", "#666");
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(fmt(max), pad, 12);

    series.forEach(function (s, idx) {
      var n = s.values.length;
      if (!n) return;
      var step = (w - pad * 2) / (HIST_MAX - 1);
      var pts = [];
      for (var i = 0; i < n; i++) {
        var x = w - pad - (n - 1 - i) * step;
        var y = bottom - (s.values[i] / max) * (bottom - top);
        pts.push([x, Math.max(top, y)]);
      }
      // 面积（只给第一条）
      if (idx === 0) {
        var grad = ctx.createLinearGradient(0, top, 0, bottom);
        grad.addColorStop(0, s.color);
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.moveTo(pts[0][0], bottom);
        pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
        ctx.lineTo(pts[pts.length - 1][0], bottom);
        ctx.closePath();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      pts.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    });
  }

  function redrawLive() {
    var p = themeColor("--p", "#5b4bc4");
    var t = themeColor("--t", "#00696d");
    drawSpark($("#net-chart"), [
      { values: live.netHist.map(function (d) { return d.rx; }), color: p },
      { values: live.netHist.map(function (d) { return d.tx; }), color: t }
    ], fmtRate);
    drawSpark($("#pw-chart"), [
      { values: live.pwHist.map(function (d) { return d.cpu; }), color: p }
    ], function (v) { return v.toFixed(v < 10 ? 1 : 0) + " W"; });
  }

  function applyNetSample(s) {
    if (!s || typeof s.rx !== "number") return;
    var now = Date.now() / 1000;
    if (live.netLast) {
      var dt = now - live.netLast.t;
      if (dt > 0.15) {
        var rx = Math.max(0, (s.rx - live.netLast.rx) / dt);
        var tx = Math.max(0, (s.tx - live.netLast.tx) / dt);
        live.netHist.push({ rx: rx, tx: tx });
        if (live.netHist.length > HIST_MAX) live.netHist.shift();
        var elRx = $("#net-rx"), elTx = $("#net-tx");
        if (elRx) elRx.textContent = "↓ " + fmtRate(rx);
        if (elTx) elTx.textContent = "↑ " + fmtRate(tx);
      }
    }
    live.netLast = { rx: s.rx, tx: s.tx, t: now };
  }

  function applyPowerSample(d) {
    if (!d) return;
    if (typeof d.gpu === "number") state.gpu = d.gpu;
    var w = d.watts || {};
    var cpu = typeof w.package === "number" ? w.package : null;
    if (cpu !== null) {
      live.pwHist.push({ cpu: cpu });
      if (live.pwHist.length > HIST_MAX) live.pwHist.shift();
      var el = $("#pw-cpu");
      if (el) el.textContent = "CPU " + cpu.toFixed(1) + " W";
    }
    var bat = d.battery;
    var elBat = $("#pw-bat");
    if (elBat && bat) {
      var status = bat.status === "Charging" ? "充电" : bat.status === "Discharging" ? "放电" : (bat.status || "");
      elBat.textContent = "电池 " + (bat.percent != null ? bat.percent + "%" : "") + (status ? " · " + status : "");
    }
  }

  function pollRealtime() {
    if (document.hidden) return Promise.resolve();
    return API.realtime().then(function (d) {
      applyNetSample(d && d.net);
      applyPowerSample(d && d.power);
      redrawLive();
    }).catch(function () {
      var el = $("#pw-cpu");
      if (el && !el.dataset.warned) { el.dataset.warned = "1"; el.textContent = "采样服务未运行"; }
    });
  }

  function startQqPolling() {
    if (live.qqTimer) return;
    pollQq();
    // 消息流刷新快一点：服务端缓存 1 秒，这里 3 秒一轮，新消息 2~4 秒就能看到
    live.qqTimer = setInterval(function () { if (!document.hidden) once("qq", pollQq); }, 3000);
  }

  function pollQq() {
    if (document.hidden) return Promise.resolve();
    return API.qqFeed().then(function (feed) {
      var prev = state.qq || [];
      // 只要可见窗口里有任何一条变了就重渲染。她发的图带的是工具调用时间，
      // 会插在中间，光比「条数 + 最后一条时间」会漏掉（条数还有 80 条上限）。
      var sig = function (list) {
        return list.slice(-40).map(function (m) {
          var f = m.media && m.media[0] ? m.media[0].file : "";
          return (m.ts || "") + m.dir + f + String(m.text || "").slice(0, 12);
        }).join("|");
      };
      var same = prev.length === feed.length && sig(prev) === sig(feed);
      state.qq = feed;
      if (same) return;
      renderGutter();
      var inline = $(".qq-panel");
      if (inline) inline.outerHTML = renderQq();
    }).catch(function () {});
  }

  // 重渲染左侧栏时保留滚动位置：贴着底部就自动跟到最新，往上翻则留在原处
  function renderGutter() {
    var gutter = $("#gutter-feed");
    if (!gutter) return;
    var nearBottom = gutter.scrollHeight - gutter.scrollTop - gutter.clientHeight < 48;
    var prevTop = gutter.scrollTop;
    gutter.dataset.follow = nearBottom ? "1" : "0";
    gutter.innerHTML = renderGutterChat();
    if (nearBottom) gutter.scrollTop = gutter.scrollHeight;
    else gutter.scrollTop = prevTop;
    // 图片是异步加载的，加载完会把内容顶高；跟着底部的时候再贴一次底，
    // 否则一出现图片就会被判定成「用户翻上去了」，之后新消息不再自动跟。
    Array.prototype.forEach.call(gutter.querySelectorAll("img.qq-image"), function (img) {
      if (img.complete) return;
      img.addEventListener("load", function () {
        if (gutter.dataset.follow === "1") gutter.scrollTop = gutter.scrollHeight;
      });
    });
  }

  function applyServices(w) {
    state.webServices = w || [];
    // 应用卡片按容器自动检测：端口状态和列表来自同一次探测
    var st = {};
    state.webServices.forEach(function (s) { st[s.port] = s.code; });
    state.appStatus = st;
    state.webAt = Date.now();
  }

  function refreshAppsPanel() {
    if (document.hidden) return Promise.resolve();
    return API.appServices().then(function (w) {
      applyServices(w);
      if (state.view === "home") {
        var el = $("#apps-panel");
        if (el) el.outerHTML = renderApps();
      }
    }).catch(function () {});
  }

  function startAppPolling() {
    if (live.appTimer) return;
    live.appTimer = setInterval(function () {
      if (document.hidden || state.view !== "home") return;
      once("apps", refreshAppsPanel);
    }, 30000);
  }

  /* ---------------- mihomo 管理块 ---------------- */
  function mihomoOpen() {
    try {
      var v = localStorage.getItem("debnas-mihomo-open");
      if (v !== null) return v !== "0";
    } catch (e) {}
    return window.innerWidth >= 1400;
  }

  function setMihomoOpen(v) {
    try { localStorage.setItem("debnas-mihomo-open", v ? "1" : "0"); } catch (e) {}
  }

  function mihomoArchWarn(d) {
    if (!d || (d.supported !== false && d.binaryOk !== false)) return "";
    if (d.supported === false) {
      return '<div class="mh-warn">Debian NAS 只支持 x86_64，当前机器是 ' +
        esc(d.hostArch || "未知架构") + "。</div>";
    }
    var rec = d.recommended ? "（推荐 " + d.recommended + "）" : "";
    if (!d.binaryArch) {
      return '<div class="mh-warn">没找到 mihomo 二进制' + rec +
        '；运行 <code>sudo /usr/local/lib/debnas-portal/install-mihomo.sh</code> 安装</div>';
    }
    if (d.binarySameArch === false) {
      return '<div class="mh-warn">已装二进制是 ' + esc(d.binaryArch) + "，与本机 " +
        esc(d.hostArch) + " 不匹配" + rec +
        "；运行 <code>sudo /usr/local/lib/debnas-portal/install-mihomo.sh</code> 重装</div>";
    }
    return '<div class="mh-warn">已装二进制无法在本机执行（可能是指令集不匹配）' + rec +
      "；运行 <code>sudo /usr/local/lib/debnas-portal/install-mihomo.sh</code> 重装</div>";
  }

  function renderMihomoDock(force) {
    var dock = $("#mihomo-dock");
    if (!dock) return;
    var ae = document.activeElement;
    if (!force && ae && dock.contains(ae) && ae.tagName === "SELECT") return;
    var d = state.mihomo;
    var open = mihomoOpen();
    dock.hidden = false;
    dock.className = "mh-dock" + (open ? " open" : " collapsed");

    var st = "检测中", cls = "wait";
    if (d) {
      if (d.error) { st = "检测失败"; cls = "err"; }
      else if (d.supported === false) { st = "不支持的架构"; cls = "err"; }
      else if (d.binaryOk === false) {
        st = d.binaryArch ? (d.binarySameArch === false ? "架构不匹配" : "指令集不匹配") : "未安装";
        cls = "err";
      } else if (!d.active) { st = "未运行"; cls = "off"; }
      else if (!d.apiOk) { st = "API 不可达"; cls = "warn"; }
      else { st = "运行中"; cls = "ok"; }
    }
    var head = '<div class="mh-head"><span class="mh-brand"><span class="mh-mark">M</span><span class="mh-brand-text">mihomo</span></span>' +
      '<span class="mh-state ' + cls + '"><i></i>' + st + '</span>' +
      '<button class="mh-fold" id="mh-fold" type="button" title="' + (open ? "收起" : "展开") + '">' +
      (open ? "⌄" : "⌃") + "</button></div>";
    if (!open) { dock.innerHTML = head; return; }

    var body;
    if (!d) {
      body = '<div class="mh-note">正在读取代理状态…</div>';
    } else if (d.error) {
      body = '<div class="mh-note">读取失败，稍后自动重试。</div>' +
        '<div class="mh-actions"><button class="mh-btn" id="mh-retry" type="button">重试</button></div>';
    } else if (d.supported === false) {
      body = mihomoArchWarn(d) + '<div class="mh-note">管理块只提供 x86_64 的检测 / 安装。</div>';
    } else if (!d.active) {
      if (d.binaryOk === false) {
        body = mihomoArchWarn(d) +
          '<div class="mh-note">安装匹配版本：<code>sudo install-mihomo.sh</code></div>';
      } else {
        body = '<div class="mh-note">mihomo 服务没有运行，代理不可用。</div>' +
          '<div class="mh-actions"><button class="mh-btn primary" id="mh-start" type="button">启动</button>' +
          '<button class="mh-btn" id="mh-import" type="button">导入</button></div>';
      }
    } else if (!d.apiOk) {
      body = mihomoArchWarn(d) +
        '<div class="mh-note">服务在运行，但控制接口不可达。检查 <code>external-controller</code> / <code>secret</code>。</div>' +
        '<div class="mh-actions"><button class="mh-btn" id="mh-import" type="button">导入</button>' +
        '<button class="mh-btn" id="mh-restart" type="button">重启</button></div>';
    } else {
      var modes = [["rule", "规则"], ["global", "全局"], ["direct", "直连"]].map(function (m) {
        return '<button type="button" data-mh-mode="' + m[0] + '"' +
          (d.mode === m[0] ? ' class="active"' : "") + ">" + m[1] + "</button>";
      }).join("");
      var p = d.primary;
      var nodes = (p && p.nodes || []).map(function (n) {
        return '<option value="' + esc(n.name) + '"' + (p.now === n.name ? " selected" : "") + ">" +
          esc(n.name) + (n.delay ? " · " + n.delay + "ms" : "") + "</option>";
      }).join("");
      var delay = p && p.delay ? p.delay + " ms" : "—";
      var dcls = p && p.delay && p.delay > 800 ? " slow" : p && p.delay ? " ok" : "";
      var tr = d.traffic || {};
      body = mihomoArchWarn(d) +
        '<div class="mh-meta">' + esc(d.version || "mihomo") + " · 端口 " + esc(d.port || "—") +
          (d.hostLevel ? '<span class="mh-arch"> · ' + esc(d.hostLevel) + "</span>" : "") +
          (p && p.exit && p.exit !== p.now
            ? '<span class="mh-exit"> · 出口 ' + esc(p.exit) + "</span>" : "") + "</div>" +
        '<div class="mh-seg">' + modes + "</div>" +
        '<div class="mh-node"><span class="mh-label">节点</span>' +
          (p ? '<select id="mh-node">' + nodes + "</select>" : '<span class="mh-note">没有可选分组</span>') +
          '<span class="mh-delay' + dcls + '" title="' + esc(p && p.exit ? p.exit : "") + '">' + esc(delay) + "</span></div>" +
        '<div class="mh-traffic"><span>↓ ' + fmtBytes((tr.down || 0) / 1024) + "</span>" +
          "<span>↑ " + fmtBytes((tr.up || 0) / 1024) + "</span>" +
          "<span>" + (tr.active || 0) + " 连接</span></div>" +
        '<div class="mh-actions"><button class="mh-btn" id="mh-test" type="button"' +
          (state.mhTesting ? " disabled" : "") + ">" + (state.mhTesting ? "测速中…" : "测速") + "</button>" +
          '<button class="mh-btn" id="mh-import" type="button">导入</button>' +
          '<button class="mh-btn danger" id="mh-stop" type="button">关闭</button>' +
          '<button class="mh-btn" id="mh-restart" type="button">重启</button></div>';
    }
    dock.innerHTML = head + '<div class="mh-body">' + body + "</div>" +
      '<input type="file" id="mh-import-file" accept=".yaml,.yml,text/yaml,application/x-yaml" hidden />';
  }

  function pollMihomo() {
    if (document.hidden) return Promise.resolve();
    return API.mihomo().then(function (d) {
      state.mihomo = d;
      renderMihomoDock();
    }).catch(function () {
      state.mihomo = { error: true, active: false, apiOk: false };
      renderMihomoDock();
    });
  }

  function startMihomoPolling() {
    if (live.mihomoTimer) return;
    pollMihomo();
    live.mihomoTimer = setInterval(function () { if (!document.hidden) once("mihomo", pollMihomo); }, 12000);
  }

  /* ---------------- DeepSeek 余额块 ---------------- */
  function deepseekOpen() {
    try {
      var v = localStorage.getItem("debnas-deepseek-open");
      if (v !== null) return v !== "0";
    } catch (e) {}
    return window.innerWidth >= 1400;
  }

  function setDeepseekOpen(v) {
    try { localStorage.setItem("debnas-deepseek-open", v ? "1" : "0"); } catch (e) {}
  }

  function dsMoney(v) {
    var n = parseFloat(v);
    if (isNaN(n)) return "—";
    return (n >= 1000 ? n.toFixed(0) : n.toFixed(2));
  }

  function renderDeepseekDock(force) {
    var dock = $("#deepseek-dock");
    if (!dock) return;
    var ae = document.activeElement;
    if (!force && ae && dock.contains(ae)) return;
    var d = state.deepseek;
    var open = deepseekOpen();
    dock.hidden = false;
    dock.className = "mh-dock ds-dock" + (open ? " open" : " collapsed");

    var main = d && d.ok && (d.items || [])[0] ? d.items[0] : null;
    var st = "读取中", cls = "wait";
    if (d) {
      if (!d.ok) { st = "读取失败"; cls = "err"; }
      else if (!d.available) { st = "余额不足"; cls = "warn"; }
      else if (main) { st = (main.currency === "CNY" ? "¥" : "") + dsMoney(main.total); cls = "ok"; }
      else { st = "无余额记录"; cls = "warn"; }
    }

    var head = '<div class="mh-head"><span class="mh-brand"><span class="mh-mark ds-mark">D</span>' +
      '<span class="mh-brand-text">DeepSeek</span></span>' +
      '<span class="mh-state ' + cls + '"><i></i>' + esc(st) + '</span>' +
      '<button class="mh-fold" id="ds-fold" type="button" title="' + (open ? "收起" : "展开") + '">' +
      (open ? "⌄" : "⌃") + "</button></div>";
    if (!open) { dock.innerHTML = head; return; }

    var body;
    if (!d) {
      body = '<div class="mh-note">正在查询余额…</div>';
    } else if (!d.ok) {
      body = '<div class="mh-note">' + esc(d.error || "查询失败") + "</div>" +
        '<div class="mh-actions"><button class="mh-btn" id="ds-refresh" type="button">重试</button></div>';
    } else if (!main) {
      body = '<div class="mh-note">接口没有返回余额。</div>' +
        '<div class="mh-actions"><button class="mh-btn" id="ds-refresh" type="button">刷新</button></div>';
    } else {
      var sym = main.currency === "CNY" ? "¥" : (main.currency === "USD" ? "$" : "");
      var rows = (d.items || []).map(function (it) {
        var s2 = it.currency === "CNY" ? "¥" : (it.currency === "USD" ? "$" : "");
        return '<div class="ds-row"><span>充值' + (it.currency ? "（" + esc(it.currency) + "）" : "") +
          '</span><b>' + s2 + dsMoney(it.topped) + "</b></div>" +
          '<div class="ds-row"><span>赠送</span><b>' + s2 + dsMoney(it.granted) + "</b></div>";
      }).join("");
      var at = d.at ? new Date(d.at * 1000) : null;
      var when = at ? ("0" + at.getHours()).slice(-2) + ":" + ("0" + at.getMinutes()).slice(-2) : "—";
      body = '<div class="ds-balance"><span class="ds-sym">' + esc(sym) + "</span>" +
        '<span class="ds-num">' + esc(dsMoney(main.total)) + "</span>" +
        (d.available ? "" : '<span class="ds-tag">不可用</span>') + "</div>" +
        '<div class="ds-rows">' + rows + "</div>" +
        '<div class="mh-meta">' + esc(when) + " 更新 · 每 60 秒自动刷新</div>" +
        '<div class="mh-actions"><button class="mh-btn" id="ds-refresh" type="button">刷新</button></div>';
    }
    dock.innerHTML = head + '<div class="mh-body">' + body + "</div>";
  }

  function pollDeepseek(force) {
    if (document.hidden) return Promise.resolve();
    return API.deepseek(!!force).then(function (d) {
      state.deepseek = d;
      renderDeepseekDock(force);
    }).catch(function (e) {
      state.deepseek = { ok: false, error: String(e && e.message || e) };
      renderDeepseekDock(force);
    });
  }

  function startDeepseekPolling() {
    if (live.dsTimer) return;
    pollDeepseek();
    live.dsTimer = setInterval(function () { if (!document.hidden) once("deepseek", pollDeepseek); }, 60000);
  }

  function mihomoSetMode(mode) {
    API.mihomoAction({ action: "mode", mode: mode }).then(function () {
      if (state.mihomo) state.mihomo.mode = mode;
      renderMihomoDock(true);
      toast("已切换到" + ({ rule: "规则", global: "全局", direct: "直连" }[mode] || mode) + "模式", "success");
    }).catch(function (e) { toast("切换失败：" + e, "error"); });
  }

  function mihomoSelect(name) {
    var d = state.mihomo;
    if (!d || !d.primary) return;
    API.mihomoAction({ action: "select", group: d.primary.name, name: name }).then(function () {
      d.primary.now = name;
      d.primary.exit = name;
      d.primary.delay = 0;
      renderMihomoDock(true);
      toast("已选择 " + name, "success");
      pollMihomo();
    }).catch(function (e) {
      toast("切换节点失败：" + e, "error");
      renderMihomoDock(true);
    });
  }

  function mihomoTest() {
    var d = state.mihomo;
    if (!d || !d.primary) return;
    var target = d.primary.exit || d.primary.now;
    state.mhTesting = true;
    renderMihomoDock(true);
    API.mihomoAction({ action: "delay", name: target }).then(function (r) {
      state.mhTesting = false;
      d.primary.delay = r.delay || 0;
      renderMihomoDock(true);
      toast(r.delay ? "延迟 " + r.delay + " ms" : "测速超时", r.delay ? "success" : "error");
    }).catch(function (e) {
      state.mhTesting = false;
      renderMihomoDock(true);
      toast("测速失败：" + e, "error");
    });
  }

  function mihomoService(action) {
    API.serviceAction("mihomo.service", action).then(function () {
      var label = action === "start" ? "正在启动 mihomo…"
        : action === "stop" ? "正在关闭 mihomo…" : "正在重启 mihomo…";
      toast(label, "info");
      setTimeout(pollMihomo, 2500);
    }).catch(function (e) { toast("操作失败：" + e, "error"); });
  }

  function mihomoImportFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("配置文件不能超过 2MB", "error");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var res = String(reader.result || "");
      var i = res.indexOf(",");
      if (i < 0) { toast("读取文件失败", "error"); return; }
      var b64 = res.slice(i + 1);
      confirmDialog("导入 mihomo 配置？",
        "会覆盖 /etc/mihomo/config.yaml（旧文件自动备份），校验通过后重启服务。",
        function () {
          API.mihomoImport(b64).then(function (r) {
            toast(r && r.message ? r.message : "配置已导入，mihomo 已重启",
              r && r.restarted === false ? "error" : "success");
            setTimeout(pollMihomo, 2500);
          }).catch(function (e) { toast("导入失败：" + e, "error"); });
        });
    };
    reader.onerror = function () { toast("读取文件失败", "error"); };
    reader.readAsDataURL(file);
  }

  function startLive() {
    if (live.started) { redrawLive(); return; }
    live.started = true;
    pollRealtime();
    // 第一个采样没有上一帧，速率要等下一次轮询；350ms 后补一帧，网速立刻有数
    setTimeout(function () { if (live.started) pollRealtime(); }, 350);
    live.realtimeTimer = setInterval(function () {
      if (!document.hidden) once("realtime", pollRealtime);
    }, 3000);
  }

  function stopLive() {
    live.started = false;
    if (live.realtimeTimer) clearInterval(live.realtimeTimer);
    live.realtimeTimer = null;
  }


  /* ---------------- 右侧硬件栏 ---------------- */
  function renderHwRail() {
    var hw = state.hw || {};
    var temps = state.temps || [];
    var cpuTemp = temps.filter(function (t) { return /coretemp|k10temp|zenpower/.test(t.chip); })
      .reduce(function (m, t) { return Math.max(m, t.c); }, 0);
    var load = state.cpuLoad == null ? null : Math.round(state.cpuLoad);
    var memUsed = (hw.memTotal || 0) - (hw.memAvailable || 0);
    var memPct = hw.memTotal ? Math.round(memUsed / hw.memTotal * 100) : 0;
    var gpu = state.gpu;

    return '<div class="hw-head"><span>硬件</span><span class="hw-live"></span></div>' +
      '<div class="hw-block">' +
        '<div class="hw-label">CPU</div>' +
        '<div class="hw-title" data-hw="cpu">' + esc(hw.cpu || "读取中…") + "</div>" +
        '<div class="hw-meta" data-hw="cpu-meta">' + (hw.cores ? hw.cores + " 核" : "") +
          (cpuTemp ? " · " + cpuTemp.toFixed(0) + "°C" : "") +
          (load != null ? " · " + load + "%" : "") + "</div>" +
        '<div class="meter"><span data-hw="cpu-w" data-w="' + (load || 0) + '"></span></div>' +
      "</div>" +
      '<div class="hw-block">' +
        '<div class="hw-label">内存</div>' +
        '<div class="hw-title" data-hw="mem">' + fmtBytes(memUsed) + " / " + fmtBytes(hw.memTotal || 0) + "</div>" +
        '<div class="meter"><span data-hw="mem-w" data-w="' + memPct + '"></span></div>' +
      "</div>" +
      '<div class="hw-block">' +
        '<div class="hw-label">GPU</div>' +
        '<div class="hw-title" data-hw="gpu">' + (gpu == null ? "不可用" : gpu.toFixed(0) + "%") + "</div>" +
        '<div class="meter" data-hw="gpu-meter"' + (gpu == null ? ' style="display:none"' : "") +
          '><span data-hw="gpu-w" data-w="' + (gpu || 0) + '"></span></div>' +
      "</div>" +
      '<div class="hw-block hw-mini">' +
        '<div class="hw-label">系统</div>' +
        '<div class="hw-meta" data-hw="kernel">内核 ' + esc((state.info || {}).kernel || "—") + "</div>" +
      "</div>";
  }

  function refreshHwRail() {
    // 只刷新硬件卡片；mihomo 块是它下面的独立卡片，不受影响。
    // 有结构时只更新文本/宽度，避免每 3 秒重建 DOM 并让进度条从 0 重播动画。
    var box = $("#gutter-hw");
    if (!box) return;
    if (!box.querySelector('[data-hw="cpu"]')) {
      box.innerHTML = renderHwRail();
      applyDynamicStyles(box);
      return;
    }
    var hw = state.hw || {};
    var temps = state.temps || [];
    var cpuTemp = temps.filter(function (t) { return /coretemp|k10temp|zenpower/.test(t.chip); })
      .reduce(function (m, t) { return Math.max(m, t.c); }, 0);
    var load = state.cpuLoad == null ? null : Math.round(state.cpuLoad);
    var memUsed = (hw.memTotal || 0) - (hw.memAvailable || 0);
    var memPct = hw.memTotal ? Math.round(memUsed / hw.memTotal * 100) : 0;
    var gpu = state.gpu;
    var get = function (name) { return box.querySelector('[data-hw="' + name + '"]'); };

    get("cpu").textContent = hw.cpu || "读取中…";
    get("cpu-meta").textContent = (hw.cores ? hw.cores + " 核" : "") +
      (cpuTemp ? " · " + cpuTemp.toFixed(0) + "°C" : "") +
      (load != null ? " · " + load + "%" : "");
    get("cpu-w").style.width = Math.max(0, Math.min(100, load || 0)) + "%";

    get("mem").textContent = fmtBytes(memUsed) + " / " + fmtBytes(hw.memTotal || 0);
    get("mem-w").style.width = Math.max(0, Math.min(100, memPct)) + "%";

    get("gpu").textContent = gpu == null ? "不可用" : gpu.toFixed(0) + "%";
    var gm = get("gpu-meter");
    if (gm) {
      gm.style.display = gpu == null ? "none" : "";
      get("gpu-w").style.width = Math.max(0, Math.min(100, gpu || 0)) + "%";
    }
    get("kernel").textContent = "内核 " + ((state.info || {}).kernel || "—");
  }

  function startHwPolling() {
    if (live.hwTimer) return;
    var prev = null, n = 0;

    var tick = function () {
      if (document.hidden) return;
      var rail = $("#gutter-hw");
      if (!rail || rail.getClientRects().length === 0) return;
      API.cpuTimes().then(function (cur) {
        if (prev && cur && cur.total > prev.total) {
          var dt = cur.total - prev.total;
          var di = cur.idle - prev.idle;
          state.cpuLoad = Math.max(0, Math.min(100, (1 - di / dt) * 100));
        }
        prev = cur;
      });

      // 首页的功耗/GPU 已经和网速合并到 /api/realtime；其它页面右栏还开着时才单独补一次
      if (state.view !== "home") {
        API.powerSample().then(function (d) {
          state.gpu = d && typeof d.gpu === "number" ? d.gpu : null;
        }).catch(function () {});
      }

      if (n++ % 5 === 0) {
        API.hwTemps().then(function (t) { state.temps = t; });
      }

      refreshHwRail();
    };

    var rail = $("#gutter-hw");
    if (rail && rail.getClientRects().length) {
      API.hwBasic().then(function (h) { state.hw = h; refreshHwRail(); });
    }
    tick();
    live.hwTimer = setInterval(function () { once("hw", tick); }, 3000);
  }


  /* ---------------- 首页 ---------------- */
  function renderHome() {
    var s = state.info || {};
    var memUsed = (s.memTotal || 0) - (s.memAvailable || 0);
    var memPct = s.memTotal ? Math.round(memUsed / s.memTotal * 100) : 0;
    var diskPct = s.diskTotal ? Math.round(s.diskUsed / s.diskTotal * 100) : 0;
    var sambaOn = s.samba === "active";
    var ready = !!state.info;
    var sambaText = ready ? (sambaOn ? "Samba 运行中" : "Samba 未运行") : "Samba 检测中…";

    return '' +
      '<section class="hero">' +
        '<div class="hero-text">' +
          '<p class="hero-kicker">' + greeting() + "，" + esc(state.user ? state.user.name : "") + "</p>" +
          '<h2 class="hero-title">' + esc(prettyHost(s.host || (state.user && state.user.host))) + "</h2>" +
          '<p class="hero-sub">' + (ready
            ? (s.kernel ? "内核 " + esc(s.kernel) + " · " : "") + "已运行 " + fmtUptime(s.uptime || 0)
            : "正在读取系统状态…") + "</p>" +
        "</div>" +
        '<div class="hero-status ' + (sambaOn ? "ok" : "off") + '">' +
          '<span class="dot"></span>' + sambaText +
        "</div>" +
      "</section>" +

      '<section class="stat-grid">' +
        statCard("共享目录", ready ? state.shares.length + " 个" : "—", ready ? "文件共享" : "读取中…", "shares") +
        statCard("用户账户", ready ? state.users.length + " 个" : "—", ready ? "可登录账户" : "读取中…", "users") +
        statCard("内存占用", ready ? memPct + "%" : "—",
          ready ? fmtBytes(memUsed) + " / " + fmtBytes(s.memTotal) : "读取中…",
          null, ready ? memPct : null) +
        statCard("磁盘占用", ready ? diskPct + "%" : "—",
          ready ? fmtBytes(s.diskUsed) + " / " + fmtBytes(s.diskTotal) : "读取中…",
          null, ready ? diskPct : null) +
      "</section>" +

      '<section class="home-grid">' +
        '<div class="col-main">' +
          renderApps() +
          renderQq() +
          '<section class="panel">' +
            '<div class="panel-head"><h3>最近共享</h3>' +
          '<button class="btn btn-text" data-nav="shares">查看全部</button></div>' +
        (state.shares.length
          ? '<ul class="share-list">' + state.shares.slice(0, 3).map(function (s) {
              return '<li><span class="share-icon">' + icon("folder", 13) + "</span>" +
                '<b>' + esc(s.name) + "</b>" +
                '<span class="muted mono">' + esc(s.path || "—") + "</span>" +
                '<span class="chip ' + (s.readOnly ? "chip-muted" : "chip-accent") + '">' +
                (s.readOnly ? "只读" : "读写") + "</span></li>";
            }).join("") + "</ul>"
          : emptyBlock("还没有共享目录", "去文件共享页新建一个")) +
          "</section>" +
        "</div>" +
        '<div class="col-side">' +
      '<section class="live-grid">' +
        '<div class="panel live-card">' +
          '<div class="panel-head"><div class="panel-title"><h3>网络流量</h3></div>' +
            '<div class="live-stats"><span class="chip chip-accent" id="net-rx">↓ 0 B/s</span>' +
            '<span class="chip chip-muted" id="net-tx">↑ 0 B/s</span></div></div>' +
          '<div class="live-body"><canvas id="net-chart" class="spark"></canvas></div>' +
        "</div>" +
        '<div class="panel live-card">' +
          '<div class="panel-head"><div class="panel-title"><h3>功耗</h3></div>' +
            '<div class="live-stats"><span class="chip chip-accent" id="pw-cpu">CPU — W</span>' +
            '<span class="chip chip-muted" id="pw-bat">电池 —</span></div></div>' +
          '<div class="live-body"><canvas id="pw-chart" class="spark"></canvas></div>' +
        "</div>" +
      "</section>" +
        "</div>" +
      "</section>";
  }

  function statCard(label, value, sub, nav, pct) {
    return '<div class="stat-card"' + (nav ? ' data-nav="' + nav + '" role="button" tabindex="0"' : "") + ">" +
      '<span class="stat-label">' + esc(label) + "</span>" +
      '<span class="stat-value">' + esc(value) + "</span>" +
      (typeof pct === "number"
        ? '<div class="meter"><span data-w="' + Math.min(100, pct) + '"></span></div>'
        : "") +
      '<span class="stat-sub">' + esc(sub) + "</span>" +
      "</div>";
  }

  function field(key, label, value, ph) {
    return '<label class="field"><span>' + esc(label) + "</span>" +
      '<input data-key="' + esc(key) + '" value="' + esc(value) + '" placeholder="' + esc(ph) + '" /></label>';
  }


  /* CSP 禁止内联 style：渲染后再用 CSSOM 设置宽度/颜色 */
  function applyDynamicStyles(root) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll("[data-w]"), function (el) {
      var w = Number(el.getAttribute("data-w")) || 0;
      el.style.width = Math.max(0, Math.min(100, w)) + "%";
    });
    Array.prototype.forEach.call(root.querySelectorAll(".lg-dot[data-color]"), function (el) {
      el.style.background = el.getAttribute("data-color");
    });
  }

  function emptyBlock(title, sub) {
    return '<div class="empty"><div class="empty-icon">' + icon("folder", 20) + "</div><b>" + esc(title) +
      '</b><span class="muted">' + esc(sub) + "</span></div>";
  }

  /* ---------------- 共享 ---------------- */
  function renderSharesMobile() {
    var shares = state.shares || [];
    var g = state.smbGlobal || {};

    var cards = shares.map(function (s) {
      var tags = [];
      if (s.guest) tags.push("访客可访问");
      if (s.browseable === false) tags.push("不可浏览");
      return '<article class="msh-card">' +
        '<div class="msh-card-head">' +
          '<span class="msh-folder">' + icon("folder", 18) + "</span>" +
          '<div class="msh-title"><b>' + esc(s.name) + "</b>" +
            '<span class="msh-path"><span class="mono" title="' + esc(s.path || "") + '">' +
              esc(s.path || "—") + "</span>" +
              (s.path ? '<button type="button" class="msh-copy" data-copy="' + esc(s.path) +
                '" aria-label="复制路径" title="复制路径">' + icon("copy", 13) + "</button>" : "") +
            "</span>" +
          "</div>" +
          '<span class="chip ' + (s.readOnly ? "chip-muted" : "chip-accent") + '">' +
            (s.readOnly ? "只读" : "读写") + "</span>" +
        "</div>" +
        (s.comment ? '<p class="msh-comment">' + esc(s.comment) + "</p>" : "") +
        (tags.length ? '<div class="msh-tags">' + tags.map(function (t) {
          return '<span class="msh-tag">' + esc(t) + "</span>";
        }).join("") + "</div>" : "") +
        '<div class="msh-actions">' +
          '<button type="button" class="msh-act" data-edit="' + esc(s.name) + '">' +
            icon("pencil", 14) + "编辑</button>" +
          (s.isHome ? "" : '<button type="button" class="msh-act danger" data-del="' + esc(s.name) + '">' +
            icon("trash", 14) + "删除</button>") +
        "</div>" +
      "</article>";
    }).join("");

    var global =
      '<details class="msh-global">' +
        "<summary>" +
          '<span class="msh-global-icon">' + icon("server", 16) + "</span>" +
          '<span class="msh-global-text"><b>全局配置</b>' +
            "<small>" + esc(g.workgroup || "WORKGROUP") + " · " +
            esc(g["server string"] || "Debian NAS") + "</small></span>" +
          '<span class="msh-chevron">' + icon("chevron", 15) + "</span>" +
        "</summary>" +
        '<div class="msh-global-body">' +
          '<div class="global-form">' +
            field("workgroup", "工作组", g.workgroup || "WORKGROUP", "WORKGROUP") +
            field("server string", "服务器描述", g["server string"] || "", "Debian NAS") +
            field("log level", "日志级别", g["log level"] || "normal", "normal") +
          "</div>" +
          '<div class="msh-global-actions">' +
            '<button type="button" class="btn btn-text" id="export-conf">导出</button>' +
            '<button type="button" class="btn btn-text" id="import-conf">导入</button>' +
            '<button type="button" class="btn btn-primary" id="save-global">保存</button>' +
          "</div>" +
        "</div>" +
      "</details>";

    return '<div class="msh-page">' +
      '<section class="msh-hero">' +
        '<div class="msh-hero-main">' +
          '<span class="msh-hero-icon">' + icon("folder", 22) + "</span>" +
          '<span class="msh-hero-text"><small>Samba 文件共享</small>' +
            "<b>" + (shares.length ? shares.length + " 个共享目录" : "还没有共享目录") + "</b></span>" +
        "</div>" +
        '<button type="button" class="msh-new" id="add-share">＋ 新建共享</button>' +
      "</section>" +
      (shares.length
        ? '<section class="msh-list">' + cards + "</section>"
        : emptyBlock("还没有共享", "点上面的按钮新建一个共享目录")) +
      global +
    "</div>";
  }

  function renderShares() {
    if (isMobileView()) return renderSharesMobile();
    var rows = state.shares.map(function (s) {
      return '<tr data-name="' + esc(s.name) + '">' +
        '<td><div class="cell-main"><span class="share-icon">' + icon("folder", 13) + "</span><b>" + esc(s.name) + "</b></div></td>" +
        '<td class="mono muted">' + esc(s.path || "—") + "</td>" +
        '<td class="muted">' + esc(s.comment || "—") + "</td>" +
        '<td><span class="chip ' + (s.readOnly ? "chip-muted" : "chip-accent") + '">' +
          (s.readOnly ? "只读" : "读写") + "</span></td>" +
        '<td class="actions">' +
          '<button class="icon-btn sm" data-edit="' + esc(s.name) + '" title="编辑">' + icon("pencil", 15) + '</button>' +
          (s.isHome ? "" : '<button class="icon-btn sm danger" data-del="' + esc(s.name) + '" title="删除">' + icon("trash", 15) + '</button>') +
        "</td></tr>";
    }).join("");

    var g = state.smbGlobal || {};
    var globalPanel =
      '<section class="panel">' +
        '<div class="panel-head"><div class="panel-title"><h3>全局配置</h3></div>' +
          '<div class="panel-tools">' +
            '<button class="btn btn-text" id="export-conf">导出配置</button>' +
            '<button class="btn btn-text" id="import-conf">导入配置</button>' +
          "</div></div>" +
        '<div class="global-form">' +
          field("workgroup", "工作组", g.workgroup || "WORKGROUP", "WORKGROUP") +
          field("server string", "服务器描述", g["server string"] || "", "Debian NAS") +
          field("log level", "日志级别", g["log level"] || "normal", "normal") +
        "</div>" +
        '<div class="panel-foot"><button class="btn btn-primary" id="save-global">保存</button></div>' +
      "</section>";

    return globalPanel +
      '<section class="panel">' +
      '<div class="panel-head">' +
        '<div class="panel-title"><h3>共享列表</h3><span class="muted">' + state.shares.length + " 个</span></div>" +
        '<div class="panel-tools"><button class="btn btn-primary" id="add-share">＋ 新建共享</button></div>' +
      "</div>" +
      (state.shares.length
        ? '<div class="table-wrap"><table class="table"><thead><tr>' +
          "<th>名称</th><th>路径</th><th>备注</th><th>权限</th><th class=\"th-actions\">操作</th>" +
          "</tr></thead><tbody>" + rows + "</tbody></table></div>"
        : emptyBlock("还没有共享", "点右上角新建一个共享目录")) +
      "</section>";
  }

  /* ---------------- 用户 ---------------- */
  function renderUsers() {
    var rows = state.users.map(function (u) {
      return '<tr data-user="' + esc(u.name) + '">' +
        '<td data-label="用户"><div class="cell-main"><span class="avatar sm">' + esc(u.name.charAt(0).toUpperCase()) + "</span>" +
          "<b>" + esc(u.name) + "</b>" + (u.isRoot ? '<span class="chip chip-warn">root</span>' : "") + "</div></td>" +
        '<td class="mono muted" data-label="UID">' + u.uid + "</td>" +
        '<td class="muted" data-label="组">' + esc(u.groupName || u.gid) + "</td>" +
        '<td class="mono muted" data-label="主目录" title="' + esc(u.home) + '">' + esc(u.home) + "</td>" +
        '<td class="muted" data-label="Shell">' + esc(u.shell) + "</td>" +

        '<td class="actions user-actions" data-label="操作">' +
          '<button class="icon-btn sm" data-ssh="' + esc(u.name) + '" title="SSH 密钥">' + icon("key", 15) + "</button>" +
          '<button class="icon-btn sm" data-chage="' + esc(u.name) + '" title="密码策略">' + icon("clock", 15) + "</button>" +
          '<button class="icon-btn sm" data-passwd="' + esc(u.name) + '" title="设置 Samba 密码">' + icon("dots", 15) + '</button>' +
          (u.isRoot || u.name === (state.user && state.user.name) ? "" : '<button class="icon-btn sm danger" data-deluser="' + esc(u.name) + '" title="删除用户">' + icon("trash", 15) + '</button>') +
        "</td></tr>";
    }).join("");

    return '<section class="panel">' +
      '<div class="panel-head">' +
        '<div class="panel-title"><h3>系统用户</h3><span class="muted">' + state.users.length + " 个</span></div>" +
        '<div class="panel-tools">' +
          '<button class="btn btn-text" id="manage-groups">管理组</button>' +
          '<button class="btn btn-primary" id="add-user">＋ 新建用户</button></div>' +
      "</div>" +
      (state.users.length
        ? '<div class="table-wrap"><table class="table users-table"><thead><tr>' +
          "<th>用户</th><th>UID</th><th>组</th><th>主目录</th><th>Shell</th><th class=\"th-actions\">操作</th>" +
          "</tr></thead><tbody>" + rows + "</tbody></table></div>"
        : emptyBlock("没有用户", "")) +
      "</section>" +
      loginPanel();
  }


  /* ---------------- 应用 ---------------- */
  /* 不想出现在「应用」里的本地端口（内部服务/工具） */
  var HIDDEN_SERVICE_PORTS = [3100];

  /* 应用按容器自动检测：容器名 / 发布端口 / 页面标题命中才算存在，没有就不显示 */
  var APP_DEFS = [
    { id: "astrbot", name: "AstrBot", host: "astrbot", ports: [6185],
      icon: "chat", desc: "AstrBot 控制台" },
    { id: "napcat", name: "NapCat", host: "napcat", ports: [6099],
      icon: "chat", desc: "QQ 协议端面板" },
    { id: "novnc", name: "noVNC", match: /novnc|vnc/i, ports: [6081],
      img: "./icons/novnc.png", icon: "monitor", desc: "远程桌面（VNC）" }
  ];

  function appUrl(port) {
    // 容器内服务只提供 HTTP，Cockpit 本身是 HTTPS，所以这里固定用 http
    var host = location.hostname || "localhost";
    return "http://" + host + ":" + port + "/";
  }

  function detectApps() {
    var svcs = state.webServices || [];
    var used = {};
    var found = [];
    APP_DEFS.forEach(function (def) {
      var cands = svcs.filter(function (w) {
        if (used[w.port]) return false;
        if (def.host && String(w.name || "").toLowerCase().indexOf(def.host) >= 0) return true;
        if (def.ports.indexOf(w.port) >= 0) return true;
        return !!def.match && def.match.test(String(w.title || ""));
      });
      if (!cands.length) return;
      var byPort = cands.filter(function (w) { return def.ports.indexOf(w.port) >= 0; })[0];
      var online = cands.filter(function (w) { return /^[23]/.test(String(w.code || "")); })[0];
      var pick = byPort || online || cands[0];
      used[pick.port] = true;
      found.push({ def: def, port: pick.port, code: pick.code });
    });
    return found;
  }

  function renderApps() {
    var status = state.appStatus || {};
    var detected = detectApps();
    var knownPorts = [9090, 3000, 3001].concat(HIDDEN_SERVICE_PORTS);
    detected.forEach(function (a) { knownPorts.push(a.port); });
    var extras = (state.webServices || []).filter(function (w) {
      return knownPorts.indexOf(w.port) < 0;
    });

    var extraCards = extras.map(function (w) {
      return '<div class="app-card"><div class="app-icon fallback">' +
        '<span class="app-icon-fallback">' + icon("globe", 16) + "</span></div>" +
        '<div class="app-main"><b>' + esc(w.title) + "</b>" +
        '<span class="muted">端口 ' + w.port + "</span></div>" +
        '<div class="app-actions"><span class="chip chip-muted">HTTP ' + esc(w.code) + "</span>" +
        '<button class="btn btn-primary" data-open="' + w.port + '">打开</button></div></div>';
    }).join("");

    var cards = detected.map(function (a) {
      var def = a.def;
      var code = status[a.port] || a.code;
      var online = code && code !== "000" && /^[23]/.test(code);
      var hasImg = !!def.img;
      return '<div class="app-card">' +
        '<div class="app-icon' + (hasImg ? "" : " fallback") + '">' +
          (hasImg ? '<img src="' + esc(def.img) + '" alt="' + esc(def.name) + '" loading="lazy" ' +
            'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'fallback\')"/>' : "") +
          '<span class="app-icon-fallback">' + icon(def.icon, 16) + "</span></div>" +
        '<div class="app-main"><b>' + esc(def.name) + "</b>" +
        '<span class="muted">' + esc(def.desc) + "</span></div>" +
        '<div class="app-actions">' +
        '<span class="chip ' + (online ? "chip-accent" : "chip-muted") + '">' +
        (online ? "在线" : code === "000" || code === undefined ? "未响应" : "HTTP " + code) + "</span>" +
        '<button class="btn btn-primary" data-open="' + a.port + '"' + (online ? "" : " disabled") + ">打开</button>" +
        "</div></div>";
    }).join("");

    var total = detected.length + extras.length;
    var scanning = !Array.isArray(state.webServices);
    return '<section class="panel" id="apps-panel"><div class="panel-head"><div class="panel-title"><h3>应用</h3>' +
      '<span class="muted">' + (scanning ? "检测中" : total + " 个") + "</span></div></div>" +
      (total
        ? '<div class="app-list">' + cards + extraCards + "</div>"
        : emptyBlock(scanning ? "正在检测应用…" : "没有检测到应用",
            scanning ? "读取容器发布端口…" : "容器发布端口后会自动出现在这里")) +
      "</section>";
  }


  /* ---------------- 登录凭据 ---------------- */
  function credRow(label, value, secret, copyable) {
    var copy = copyable === false ? "" :
      '<button type="button" class="icon-btn sm" data-copy="' + esc(value) +
      '" title="复制">' + icon("copy", 14) + "</button>";
    var cls = "cred-row" + (label === "登录" ? " cred-meta" : "") +
      (label === "地址" ? " cred-addr" : "");
    return '<div class="' + cls + '">' +
      '<span class="cred-label">' + esc(label) + "</span>" +
      '<code class="cred-value">' + esc(secret ? "••••••••••••" : value) + "</code>" +
      '<span class="cred-actions">' +
        (secret ? '<button type="button" class="btn btn-text cred-mini" data-reveal="' +
          esc(value) + '">显示</button>' : "") + copy +
      "</span></div>";
  }

  function credCard(o) {
    return '<article class="cred-card">' +
      '<div class="cred-top">' +
        '<div class="cred-icon">' + icon(o.icon, 21) + "</div>" +
        '<div class="cred-head"><b>' + esc(o.name) + "</b><span>" + esc(o.desc) + "</span></div>" +
        '<span class="chip ' + (o.online ? "chip-accent" : "chip-muted") + '">' +
          (o.online ? "在线" : "离线") + "</span>" +
      "</div>" +
      '<div class="cred-rows">' + o.rows + "</div>" +
      '<a class="btn btn-primary cred-open" href="' + esc(o.url) +
        '" target="_blank" rel="noopener">' + esc(o.action) + " ↗</a>" +
      "</article>";
  }

  function renderCredentials() {
    var c = state.credentials;
    if (!c) {
      return '<section class="panel"><div class="panel-head"><div class="panel-title">' +
        '<h3>登录凭据</h3></div></div>' +
        emptyBlock("正在读取…", "这个页面需要登录后才能查看") + "</section>";
    }
    var host = location.hostname || "localhost";
    var ab = c.astrbot || {};
    var nc = c.napcat || {};
    var abUrl = "http://" + host + ":" + (ab.port || 6185);
    var ncBase = "http://" + host + ":" + (nc.port || 6099) + "/webui";
    var ncUrl = ncBase + (nc.token ? "?token=" + encodeURIComponent(nc.token) : "");
    var astro = credCard({
      name: "AstrBot", desc: "AstrBot 控制台 · 聊天、插件与日志", icon: "chat",
      action: "打开控制台", url: abUrl, online: ab.online !== false,
      rows: credRow("地址", abUrl) +
        credRow("用户名", ab.username || "astrbot") +
        credRow("密码", ab.password || "（未配置）", true) +
        credRow("登录", "账号 + 密码", false, false)
    });
    var napcat = credCard({
      name: "NapCat", desc: "QQ 协议端 · 登录态与 OneBot 配置", icon: "server",
      action: "打开面板", url: ncUrl, online: nc.online !== false,
      rows: credRow("地址", ncBase) +
        credRow("Token", nc.token || "（未读到 webui.json）", true) +
        credRow("协议", "OneBot v11 · 反向 WS 6199", false, false) +
        credRow("登录", "带 token 直接进入", false, false)
    });
    return '<div class="cred-page">' +
      '<div class="cred-grid">' + astro + napcat + "</div>" +
      '<div class="cred-note">AstrBot 密码保存在 <code>~/.config/debnas-web/credentials.json</code>' +
      '（权限 0600），改了面板密码记得同步改这里；NapCat token 每次从 ' +
      '<code>webui.json</code> 实时读取。</div>' +
      "</div>";
  }

  /* ---------------- QQ 动态 ---------------- */
  function qqAvatarHtml(m) {
    var out = m.dir === "out";
    var who = String(m.who || "?").trim();
    var initial = out ? "我" : ((Array.from(who)[0] || "?").toUpperCase());
    var uin = String(m.uin || "").replace(/[^0-9]/g, "");
    var img = uin
      ? '<img src="https://q1.qlogo.cn/g?b=qq&amp;nk=' + uin + '&amp;s=100" alt="" ' +
        'loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()" />'
      : "";
    return '<span class="qq-avatar' + (out ? " out" : "") + '">' + img + esc(initial) + "</span>";
  }

  // 左侧窄栏只显示回复正文，去掉又长又占地方的 [回复 ...] 引用前缀
  function stripReplyPrefix(text) {
    var t = String(text || "").trim();
    if (!/^\[(回复|引用)/.test(t)) return t;
    var depth = 0;
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) return t.slice(i + 1).trim();
      }
    }
    return t;
  }

  function qqFaceImg(id, cls) {
    var safe = String(id || "").replace(/[^0-9]/g, "");
    if (!safe) return "";
    return '<span class="qq-face-box"><img class="qq-face' + (cls ? " " + cls : "") +
      '" src="/api/qqmedia?kind=face&amp;id=' + safe +
      '" alt="[表情]" loading="lazy" decoding="async" ' +
      'onerror="this.parentNode.classList.add(\'broken\');this.remove()" />' +
      '<span class="qq-face-fallback">[表情]</span></span>';
  }

  function qqText(m) {
    var text = String(m.text || "");
    var media = Array.isArray(m.media) ? m.media.filter(function (x) {
      return x && x.file;
    }) : [];
    if (media.length) text = text.replace(/\[图片\]/g, "").trim();
    var html = esc(text).replace(/\[表情(\d+)\]/g, function (_, id) {
      return qqFaceImg(id, "inline");
    });
    if (media.length) {
      html += '<div class="qq-media">' + media.slice(0, 4).map(function (item) {
        var file = String(item.file || "").replace(/[^A-Za-z0-9._-]/g, "");
        if (!file) return "";
        return '<span class="qq-media-item"><img class="qq-image" src="/api/qqmedia?kind=image&amp;file=' +
          encodeURIComponent(file) + '" alt="[图片]" loading="lazy" decoding="async" ' +
          'onerror="this.parentNode.classList.add(\'broken\');this.remove()" />' +
          '<span class="qq-media-fallback">[图片]</span></span>';
      }).join("") + "</div>";
    }
    return html || '<span class="muted">（空）</span>';
  }

  function gutterDay(date) {
    if (!date) return "最近";
    var now = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var today = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    if (date === today) return "今天";
    var d = new Date(date + "T00:00:00");
    var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((t0 - d) / 86400000);
    if (diff === 1) return "昨天";
    if (diff > 1 && diff < 7) return diff + " 天前";
    return date.slice(5).replace("-", "/");
  }

  function renderGutterChat() {
    var list = (state.qq || []).slice(-40);
    var head = '<div class="gutter-head"><span>QQ 动态</span><span class="pulse"></span></div>';
    if (!list.length) {
      return head + '<div class="gchat"><div class="gchat-empty">' +
        (state.qq ? "还没有消息" : "正在读取…") + "</div></div>";
    }
    var out = [];
    var prev = null;
    list.forEach(function (m) {
      var ts = Number(m.ts || 0);
      var date = m.date || "";
      if (!prev || date !== prev.date) {
        out.push('<div class="gchat-day">' + esc(gutterDay(date)) + "</div>");
      }
      var gap = prev && ts && prev.ts ? ts - prev.ts : 99999;
      if (!prev || gap > 600) {
        out.push('<div class="gchat-time">' + esc(String(m.time || "").slice(0, 5)) + "</div>");
      }
      var cont = !!prev && prev.dir === m.dir && prev.who === m.who &&
        date === prev.date && gap <= 180;
      var avatar = cont ? '<span class="gchat-avatar-spacer"></span>' : qqAvatarHtml(m);
      var name = (!cont && m.dir === "in")
        ? '<span class="gchat-name">' + esc(m.who || "QQ") + "</span>" : "";
      out.push('<div class="gchat-row ' + (m.dir === "out" ? "out" : "in") +
        (cont ? " cont" : "") + '">' + avatar +
        '<div class="gchat-body">' + name +
        '<div class="gchat-bubble">' + qqText(m) + "</div></div></div>");
      prev = m;
    });
    return head + '<div class="gchat">' + out.join("") + "</div>";
  }

  function renderQq(compact) {
    var limit = compact ? 12 : 4;
    // 后端已按时间顺序（旧 → 新）返回；不要再按 HH:MM:SS 排序，
    // 否则跨午夜时 00:xx 会被当成“最早”，最新消息反而被挤掉。
    var list = (state.qq || []).slice(-limit);
    if (!list.length) {
      var qqReady = !!state.qq;
      return '<section class="panel qq-panel inline-only">' +
        '<div class="panel-head"><div class="panel-title"><h3>QQ 动态</h3></div></div>' +
        emptyBlock(qqReady ? "暂无消息" : "正在读取消息…",
          qqReady ? "机器人收到或发出的消息会出现在这里" : "正在读取最近的聊天记录…") + "</section>";
    }
    var rows = list.map(function (m) {
      var meta = '<div class="qq-meta"><span>' + esc(m.time) + "</span>" +
        (m.dir === "in" ? "<b>" + esc(m.who) + "</b>" : "") + "</div>";
      var bodyText = compact ? stripReplyPrefix(m.text) : m.text;
      var body = '<div class="qq-text">' +
        qqText({ text: bodyText || m.text, media: m.media }) + "</div>";
      if (m.dir === "in") {
        return '<div class="qq-row in">' + qqAvatarHtml(m) +
          '<div class="qq-bubble">' + meta + body + "</div></div>";
      }
      return '<div class="qq-row out">' +
        '<div class="qq-bubble out">' + meta + body + "</div>" + qqAvatarHtml(m) + "</div>";
    }).join("");
    if (compact) {
      return '<div class="gutter-head"><span>QQ 动态</span><span class="pulse"></span></div>' +
        '<div class="gutter-list">' + rows.replace(/class="qq-row /g, 'class="gutter-row ') + "</div>";
    }
    return '<section class="panel qq-panel inline-only">' +
      '<div class="panel-head"><div class="panel-title"><h3>QQ 动态</h3>' +
      '<span class="muted">最近 ' + list.length + " 条</span></div>" +
      '<span class="chip chip-accent"><span class="pulse"></span>实时</span></div>' +
      '<div class="qq-list">' + rows + "</div></section>";
  }

  function loginPanel() {
    var rows = (state.logins || []).map(function (r) {
      return "<tr><td class=\"login-user\"><b>" + esc(r.user) + "</b></td>" +
        '<td class="mono muted" data-label="来源">' + esc(r.ip || "—") + "</td>" +
        '<td class="muted" data-label="终端">' + esc(r.tty || "—") + "</td>" +
        '<td class="mono muted" data-label="登录">' + esc(r.start) + "</td>" +
        '<td class="muted" data-label="结束">' + esc(r.end) + "</td>" +
        '<td class="mono login-dur" data-label="时长">' + esc(r.dur || "—") + "</td></tr>";
    }).join("");
    return '<section class="panel"><div class="panel-head"><div class="panel-title"><h3>登录记录</h3>' +
      '<span class="muted">最近 ' + (state.logins || []).length + " 条</span></div></div>" +
      ((state.logins || []).length
        ? '<div class="table-wrap"><table class="table login-table"><thead><tr><th>用户</th><th>来源</th><th>终端</th>' +
          "<th>登录时间</th><th>结束</th><th>时长</th></tr></thead><tbody>" + rows + "</tbody></table></div>"
        : emptyBlock("没有登录记录", "")) +
      "</section>";
  }

  /* ---------------- 存储 ---------------- */
  function flattenDisks(disks) {
    var rows = [];
    (function walk(list, parent) {
      (list || []).forEach(function (d) {
        rows.push({
          name: d.name, size: Number(d.size) || 0, type: d.type,
          mount: d.mountpoint, fstype: d.fstype, model: d.model || "",
          parent: parent, rota: d.rota
        });
        if (d.children) walk(d.children, d.name);
      });
    })(disks, null);
    return rows;
  }

  function renderStorageMobile() {
    var data = state.storage || { disks: [], usage: {} };
    var rows = flattenDisks(data.disks);
    var mounts = rows.filter(function (r) { return r.mount; });
    var disks = rows.filter(function (r) { return r.type === "disk"; });

    var sortedMounts = mounts.slice().sort(function (a, b) {
      if (a.mount === "/") return -1;
      if (b.mount === "/") return 1;
      var as = String(a.fstype || "").toLowerCase() === "swap";
      var bs = String(b.fstype || "").toLowerCase() === "swap";
      if (as !== bs) return as ? 1 : -1;
      return String(a.mount || "").localeCompare(String(b.mount || ""));
    });

    var used = 0, total = 0;
    sortedMounts.forEach(function (m) {
      var u = data.usage[m.mount];
      if (u) { used += u.used || 0; total += u.total || 0; }
    });
    if (!total) {
      total = disks.reduce(function (a, d) { return a + (d.size || 0) / 1024; }, 0);
    }
    var pct = total ? Math.round(used / total * 100) : 0;

    var mountCards = sortedMounts.map(function (m) {
      var u = data.usage[m.mount] || null;
      var p = u && u.total ? Math.round(u.used / u.total * 100) : null;
      var isSwap = String(m.fstype || "").toLowerCase() === "swap";
      var name = isSwap ? "交换分区" : m.mount;
      return '<article class="mst-mount' + (p != null && p >= 90 ? " is-warn" : "") + '">' +
        '<div class="mst-mount-top">' +
          '<span class="mst-mount-icon">' + icon(isSwap ? "swap" : "drive", 17) + "</span>" +
          '<span class="mst-mount-title"><b>' + esc(name) + "</b>" +
            "<small>" + esc(m.fstype || "—") + " · " + esc(m.name) + "</small></span>" +
          '<span class="mst-pct">' + (p != null ? p + "<em>%</em>" : "—") + "</span>" +
        "</div>" +
        (p != null ? '<div class="mst-bar"><span data-w="' + Math.min(100, p) + '"></span></div>' : "") +
        '<div class="mst-mount-meta">' +
          (u
            ? "<span>" + fmtBytes(u.used || 0) + " 已用</span><span>" + fmtBytes(u.total || 0) + " 容量</span>"
            : "<span>" + fmtBytes(m.size / 1024) + " 容量</span><span>无文件系统用量</span>") +
        "</div>" +
      "</article>";
    }).join("");

    var diskCards = disks.map(function (d, i) {
      var kids = rows.filter(function (r) { return r.parent === d.name; });
      var du = 0, dt = 0;
      kids.forEach(function (k) {
        var u = data.usage[k.mount || ""];
        if (u) { du += u.used || 0; dt += u.total || 0; }
      });
      var dp = dt ? Math.round(du / dt * 100) : 0;
      var partRows = kids.map(function (k) {
        var ku = data.usage[k.mount || ""];
        var kp = ku && ku.total ? Math.round(ku.used / ku.total * 100) : null;
        return '<div class="mst-part">' +
          '<span class="mst-part-dev mono">' + esc(k.name) + "</span>" +
          '<span class="mst-part-mount mono">' + esc(k.mount || "未挂载") + "</span>" +
          '<span class="mst-part-size">' + fmtBytes(k.size / 1024) + "</span>" +
          '<span class="mst-part-fs">' + esc(k.fstype || "—") +
            (kp != null ? " · " + kp + "%" : "") + "</span>" +
        "</div>";
      }).join("");

      return '<details class="mst-disk"' + (i === 0 ? " open" : "") + ">" +
        "<summary>" +
          '<span class="mst-disk-icon">' + icon("drive", 18) + "</span>" +
          '<span class="mst-disk-main"><b>' + esc(d.name) + "</b>" +
            "<small>" + esc(d.model || d.type) + "</small></span>" +
          '<span class="mst-disk-side"><span class="mst-disk-size">' + fmtBytes(d.size / 1024) + "</span>" +
            '<span class="chip chip-muted" data-smart="' + esc(d.name) + '">健康 —</span></span>' +
          '<span class="mst-chevron">' + icon("chevron", 15) + "</span>" +
        "</summary>" +
        (dt ? '<div class="mst-disk-bar"><span data-w="' + Math.min(100, dp) + '"></span></div>' : "") +
        '<div class="mst-parts">' + (partRows || '<div class="mst-empty-part">没有分区信息</div>') + "</div>" +
      "</details>";
    }).join("");

    var hero =
      '<section class="mst-hero">' +
        '<div class="mst-hero-head"><small>存储空间</small>' +
          "<span>" + disks.length + " 块磁盘 · " + mounts.length + " 个挂载点</span></div>" +
        '<div class="mst-hero-num">' + pct + "<em>%</em></div>" +
        '<div class="mst-hero-sub">' + fmtBytes(used) + " 已用 · " + fmtBytes(total) + " 容量</div>" +
        '<div class="mst-hero-bar"><span data-w="' + Math.min(100, pct) + '"></span></div>' +
        '<div class="mst-hero-foot"><span>已用 ' + fmtBytes(used) + "</span>" +
          "<span>可用 " + fmtBytes(Math.max(0, total - used)) + "</span></div>" +
      "</section>";

    return '<div class="mst-page">' + hero +
      '<section class="mst-section">' +
        '<div class="mst-section-head"><h3>挂载点</h3><span>' + mounts.length + " 个</span></div>" +
        (mountCards || emptyBlock("没有挂载点", "")) +
      "</section>" +
      '<section class="mst-section">' +
        '<div class="mst-section-head"><h3>磁盘</h3><span>' + disks.length + " 块</span></div>" +
        (diskCards || emptyBlock("没有检测到磁盘", "")) +
      "</section>" +
    "</div>";
  }

  function renderStorage() {
    if (isMobileView()) return renderStorageMobile();
    var data = state.storage || { disks: [], usage: {} };
    var rows = flattenDisks(data.disks);
    var mounts = rows.filter(function (r) { return r.mount; });
    var disks = rows.filter(function (r) { return r.type === "disk"; });

    var diskCards = disks.map(function (d) {
      var kids = rows.filter(function (r) { return r.parent === d.name; });
      var used = 0, total = 0;
      kids.forEach(function (k) {
        var u = data.usage[k.mount || ""];
        if (u) { used += u.used; total += u.total; }
      });
      var pct = total ? Math.round(used / total * 100) : 0;
      return '<div class="disk-card">' +
        '<div class="disk-head"><span class="disk-icon">▤</span>' +
        '<div><b>' + esc(d.name) + '</b><span class="muted">' + esc(d.model || d.type) + '</span></div>' +
        '<span class="chip chip-muted">' + fmtBytes(d.size / 1024) + "</span>" +
        '<span class="chip chip-muted" data-smart="' + esc(d.name) + '">健康 —</span></div>' +
        (kids.length
          ? '<ul class="disk-parts">' + kids.map(function (k) {
              return '<li><span class="mono">' + esc(k.name) + '</span>' +
                '<span class="muted">' + esc(k.mount || "未挂载") + '</span>' +
                '<span class="muted">' + (k.fstype || "") + '</span>' +
                '<span>' + fmtBytes(k.size / 1024) + '</span></li>';
            }).join("") + "</ul>"
          : "") +
        (total ? '<div class="meter"><span data-w="' + Math.min(100, pct) + '"></span></div>' : "") +
        "</div>";
    }).join("");

    var mountRows = mounts.map(function (m) {
      var u = data.usage[m.mount] || {};
      var pct = u.total ? Math.round(u.used / u.total * 100) : 0;
      return "<tr><td class=\"mono\">" + esc(m.mount) + "</td>" +
        '<td class="muted">' + esc(m.fstype || "—") + "</td>" +
        '<td class="mono">' + fmtBytes(u.used || 0) + " / " + fmtBytes(u.total || 0) + "</td>" +
        '<td class="col-usage"><div class="meter"><span data-w="' + Math.min(100, pct) + '"></span></div></td>' +
        "<td>" + pct + "%</td></tr>";
    }).join("");

    return '<section class="disk-grid">' + (diskCards || emptyBlock("没有检测到磁盘", "")) + "</section>" +
      '<section class="panel"><div class="panel-head"><div class="panel-title"><h3>挂载点</h3>' +
      '<span class="muted">' + mounts.length + " 个</span></div></div>" +
      (mounts.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>挂载点</th><th>文件系统</th>' +
          "<th>已用 / 容量</th><th>使用率</th><th></th></tr></thead><tbody>" + mountRows + "</tbody></table></div>"
        : emptyBlock("没有挂载点", "")) +
      "</section>";
  }

  function hydrateSmart() {
    $$("[data-smart]").forEach(function (el) {
      var dev = el.dataset.smart;
      API.smartHealth(dev).then(function (s) {
        var h = (s && s.status) || "unknown";
        el.textContent = h === "ok" ? "健康 良好"
          : h === "bad" ? "健康 异常"
          : h === "unavailable" ? "健康 不可用" : "健康 未知";
        el.className = "chip " + (h === "ok" ? "chip-accent" : h === "bad" ? "chip-warn" : "chip-muted");
        var tip = [];
        if (s && s.temp != null) tip.push("温度 " + s.temp + "°C");
        if (s && s.hours != null) tip.push("通电 " + s.hours + " 小时");
        if (s && s.model) tip.push(s.model);
        if (s && s.message) tip.push(s.message);
        el.title = tip.join(" · ");
      }).catch(function () {
        el.textContent = "健康 未知";
        el.className = "chip chip-muted";
      });
    });
  }

  /* ---------------- 网络 ---------------- */
  function refreshNetInfo(iface) {
    if (!API.networkInfo) return;
    API.networkInfo(iface).then(function (d) {
      if (!d) return;
      var set = function (id, text) {
        var el = $("#" + id);
        if (el) el.textContent = text || "—";
      };
      set("up-gw", d.gateway);
      set("up-lat", d.latency == null ? "超时" : d.latency.toFixed(1) + " ms");
      set("up-dns", (d.dns || []).slice(0, 2).join("、"));
      set("up-pub", d.publicIp || "不可达");
      set("up-sig", d.signal == null ? "—" : d.signal + " dBm");
      var bars = $("#mn-sig");
      var sigText = $("#mn-sig-text");
      if (bars) bars.dataset.bars = String(wifiBars(d.signal));
      if (sigText) sigText.textContent = d.signal == null ? "—" : d.signal + " dBm";
    }).catch(function () {});
  }

  function isMobileView() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);
  }

  function ifaceKind(name) {
    var wifi = /^(wl|wlan|wifi|ath)/i.test(String(name || ""));
    return {
      wifi: wifi,
      label: wifi ? "无线网络" : "有线网络",
      icon: wifi ? "wifi" : "ethernet"
    };
  }

  // dBm → 0–4 格，阈值按常见无线网卡取整
  function wifiBars(dbm) {
    var v = Number(dbm);
    if (!isFinite(v) || v >= 0) return 0;
    if (v >= -50) return 4;
    if (v >= -62) return 3;
    if (v >= -74) return 2;
    return 1;
  }

  function mnTile(ico, label, id) {
    return '<div class="mn-tile"><span class="mn-tile-ico">' + icon(ico, 16) + "</span>" +
      '<span class="mn-tile-label">' + label + "</span>" +
      '<b id="' + id + '">—</b></div>';
  }

  /* 手机端网络页：连接卡 → 网络信息 → 实时流量 → 流量构成 */
  function renderNetworkMobile(list, sel) {
    var cur = list.filter(function (i) { return i.name === sel; })[0] || list[0];
    var kind = ifaceKind(cur.name);
    var up = String(cur.state || "").toUpperCase() === "UP";
    var stateLabel = up ? "已连接"
      : String(cur.state || "").toUpperCase() === "DOWN" ? "已断开"
      : /^UNKNOWN/i.test(String(cur.state || "")) ? "未知" : (cur.state || "未知");

    var ipRaw = (cur.v4 || [])[0] || "";
    var slash = ipRaw.lastIndexOf("/");
    var ip = slash > 0 ? ipRaw.slice(0, slash) : ipRaw;
    var prefix = slash > 0 ? ipRaw.slice(slash + 1) : "";
    var v6 = (cur.v6 || [])[0] || "";
    var copyVal = ip || v6;
    var copyLabel = ip ? "复制 IPv4" : v6 ? "复制 IPv6" : "";

    var chips = "";
    if (list.length > 1) {
      chips = '<section class="mn-ifaces" aria-label="网络接口">' + list.map(function (i) {
        var on = String(i.state || "").toUpperCase() === "UP";
        return '<button type="button" class="mn-if-btn' + (i.name === sel ? " sel" : "") +
          '" data-sel="' + esc(i.name) + '"><i class="mn-if-dot' + (on ? " on" : "") + '"></i>' +
          "<span>" + esc(i.name) + "</span></button>";
      }).join("") + "</section>";
    }

    var signal = kind.wifi
      ? '<span class="mn-signal"><i class="mn-bars" id="mn-sig" data-bars="0" aria-hidden="true">' +
        "<span></span><span></span><span></span><span></span></i>" +
        '<b id="mn-sig-text">—</b></span>'
      : "";

    var hero =
      '<section class="mn-hero' + (kind.wifi ? "" : " wired") + '">' +
        '<div class="mn-hero-top">' +
          '<span class="mn-hero-icon">' + icon(kind.icon, 22) + "</span>" +
          '<span class="mn-hero-id"><small>' + kind.label + "</small><b>" + esc(cur.name) + "</b></span>" +
          '<span class="mn-status' + (up ? " on" : " off") + '"><i></i>' + esc(stateLabel) + "</span>" +
        "</div>" +
        (ip
          ? '<div class="mn-ip mono' + (ip.indexOf(":") >= 0 ? " long" : "") + '">' + esc(ip) +
            (prefix ? "<em>/" + esc(prefix) + "</em>" : "") + "</div>"
          : '<div class="mn-ip empty">未分配 IPv4</div>') +
        (v6 ? '<div class="mn-v6 mono" title="' + esc(v6) + '">' + esc(v6) + "</div>" : "") +
        '<div class="mn-hero-meta">' +
          "<span>MAC " + esc(cur.mac || "—") + "</span>" +
          "<span>MTU " + esc(cur.mtu || "—") + "</span>" +
          signal +
        "</div>" +
        '<div class="mn-hero-actions">' +
          (copyVal ? '<button type="button" class="mn-action" data-copy="' + esc(copyVal) + '">' +
            icon("copy", 15) + copyLabel + "</button>" : "") +
          '<span class="mn-readonly">只读</span>' +
        "</div>" +
      "</section>";

    var overview =
      '<section class="mn-overview">' +
        mnTile("router", "默认网关", "up-gw") +
        mnTile("clock", "网关延迟", "up-lat") +
        mnTile("server", "DNS", "up-dns") +
        mnTile("globe", "公网地址", "up-pub") +
      "</section>";

    var traffic =
      '<section class="panel mn-traffic">' +
        '<div class="panel-head"><div class="panel-title"><h3>实时流量</h3>' +
        '<span class="muted">' + esc(cur.name) + "</span></div>" +
        '<span class="mn-live"><i></i>实时</span></div>' +
        '<div class="iface-summary">' +
          '<span class="is-item"><i class="dot-rx"></i><span class="is-label">下行</span><b id="if-rx">—</b></span>' +
          '<span class="is-item"><i class="dot-tx"></i><span class="is-label">上行</span><b id="if-tx">—</b></span>' +
          '<span class="is-item is-total"><span class="is-label">开机累计</span>' +
          '<span class="is-total-vals">↓ <b id="if-total-rx">—</b> · ↑ <b id="if-total-tx">—</b></span></span>' +
        "</div>" +
        '<div class="live-body"><canvas id="iface-chart" class="spark lg"></canvas></div>' +
      "</section>";

    var compose =
      '<section class="panel mn-compose">' +
        '<div class="panel-head"><div class="panel-title"><h3>流量构成</h3>' +
        '<span class="muted">开机以来</span></div></div>' +
        '<div class="mn-compose-body">' +
          '<div class="mn-dir">' +
            '<div class="mn-dir-row"><i class="mn-key rx"></i><span>下行</span>' +
            '<b id="mn-rx-val">—</b><em id="mn-rx-pct">—</em></div>' +
            '<div class="mn-dir-row"><i class="mn-key tx"></i><span>上行</span>' +
            '<b id="mn-tx-val">—</b><em id="mn-tx-pct">—</em></div>' +
            '<div class="mn-stack"><span class="rx" id="mn-rx-bar"></span>' +
            '<span class="tx" id="mn-tx-bar"></span></div>' +
          "</div>" +
          '<div class="mn-peers">' +
            '<div class="mn-sub"><span>流量去向</span><span class="muted" id="mn-peer-count">—</span></div>' +
            '<ul class="mn-peer-list" id="mn-peer-list">' +
            '<li class="mn-peer-empty">暂无活动连接</li></ul>' +
          "</div>" +
        "</div>" +
      "</section>";

    return '<div class="mn-page">' + chips + hero + overview + traffic + compose + "</div>";
  }

  function updateMobileDir(cur) {
    var barRx = $("#mn-rx-bar");
    if (!barRx || !cur) return;
    var rx = Number(cur.rx) || 0, tx = Number(cur.tx) || 0;
    var total = rx + tx;
    var rp = total ? rx / total * 100 : 0;
    var set = function (id, txt) {
      var el = $("#" + id);
      if (el) el.textContent = txt;
    };
    set("mn-rx-val", fmtBytes(rx / 1024));
    set("mn-tx-val", fmtBytes(tx / 1024));
    set("mn-rx-pct", total ? rp.toFixed(1) + "%" : "—");
    set("mn-tx-pct", total ? (100 - rp).toFixed(1) + "%" : "—");
    barRx.style.width = (total ? rp : 0) + "%";
    var barTx = $("#mn-tx-bar");
    if (barTx) barTx.style.width = (total ? 100 - rp : 0) + "%";
  }

  function updateMobilePeers(conns) {
    var list = $("#mn-peer-list");
    if (!list) return;
    var rows = (conns || []).slice(0, 4);
    var count = $("#mn-peer-count");
    if (count) count.textContent = rows.length ? rows.length + " 个连接" : "无";
    if (!rows.length) {
      list.innerHTML = '<li class="mn-peer-empty">暂无活动连接</li>';
      return;
    }
    var max = rows.reduce(function (a, c) { return Math.max(a, (c.sent || 0) + (c.recv || 0)); }, 0) || 1;
    list.innerHTML = rows.map(function (c) {
      var bytes = (c.sent || 0) + (c.recv || 0);
      return '<li class="mn-peer"><span class="mn-peer-name" title="' + esc(c.peer) + '">' + esc(c.peer) + "</span>" +
        '<span class="mn-peer-val">' + fmtBytes(bytes / 1024) + "</span>" +
        '<span class="mn-peer-bar"><i style="width:' + (bytes / max * 100).toFixed(1) + '%"></i></span></li>';
    }).join("");
  }

  function renderNetwork() {
    var list = state.net || [];
    if (!list.length) {
      if (!state._netTried) {
        state._netTried = true;
        API.network().then(function (n) {
          state.net = n || [];
          if (state.view === "network") {
            $("#view").innerHTML = renderNetwork();
            applyDynamicStyles($("#view"));
            refreshNetInfo(state.netSel);
          }
        }).catch(function () {});
      }
      return emptyBlock("没有网络接口", "");
    }

    var sel = state.netSel;
    if (!sel || !list.some(function (i) { return i.name === sel; })) {
      var up = list.filter(function (i) { return i.state === "UP" && /^wl/.test(i.name); })[0];
      if (!up) up = list.filter(function (i) { return i.state === "UP"; })[0];
      sel = (up || list[0]).name;
      state.netSel = sel;
    }

    if (isMobileView()) return renderNetworkMobile(list, sel);

    var chips = list.map(function (i) {
      return '<button class="chip chip-btn' + (i.name === sel ? " sel" : "") +
        '" data-sel="' + esc(i.name) + '">' + esc(i.name) + "</button>";
    }).join("");

    var chipsPanel = '<section class="net-ifaces">' + chips + "</section>";

    var upstream = '<section class="net-up"><div class="net-up-grid">' +
      '<div class="nu"><span>默认网关</span><b id="up-gw">—</b></div>' +
      '<div class="nu"><span>网关延迟</span><b id="up-lat">—</b></div>' +
      '<div class="nu"><span>DNS</span><b id="up-dns">—</b></div>' +
      '<div class="nu"><span>公网地址</span><b id="up-pub">—</b></div>' +
      '<div class="nu"><span>无线信号</span><b id="up-sig">—</b></div>' +
      "</div></section>";

    var chartPanel =
      '<section class="panel">' +
        '<div class="panel-head"><div class="panel-title"><h3>流量曲线</h3></div></div>' +
        '<div class="live-body"><canvas id="iface-chart" class="spark lg"></canvas></div>' +
        '<div class="iface-summary">' +
          '<span class="is-item"><i class="dot-rx"></i>下行 <b id="if-rx">—</b></span>' +
          '<span class="is-item"><i class="dot-tx"></i>上行 <b id="if-tx">—</b></span>' +
          '<span class="is-item muted">开机累计 ↓ <b id="if-total-rx">—</b> ↑ <b id="if-total-tx">—</b></span>' +
        "</div>" +
      "</section>";

    var donuts =
      '<section class="donut-grid">' +
        '<div class="panel donut-card"><div class="panel-head"><div class="panel-title"><h3>上下行占比</h3></div></div>' +
          '<div class="donut-body" id="donut-dir"></div></div>' +
        '<div class="panel donut-card"><div class="panel-head"><div class="panel-title"><h3>流量去向</h3>' +
          '<span class="muted">当前连接 · 按对端</span></div></div>' +
          '<div class="donut-body" id="donut-peer"></div></div>' +
      "</section>";

    var cards = '<section class="iface-grid">' + list.map(function (i) {
      var up = i.state === "UP";
      return '<div class="panel iface-card">' +
        '<div class="iface-head"><b>' + esc(i.name) + "</b>" +
        '<div class="iface-actions"><span class="chip ' + (up ? "chip-accent" : "chip-muted") + '">' +
        (up ? "已连接" : esc(i.state)) + "</span>" +
        '<button class="btn btn-text" data-link="' + esc(i.name) + '">' + (up ? "停用" : "启用") + "</button>" +
        '<button class="btn btn-text" data-net="' + esc(i.name) + '">配置</button></div></div>' +
        '<div class="iface-body">' +
        (i.v4.length ? i.v4.map(function (a) { return '<div class="mono">' + esc(a) + "</div>"; }).join("")
          : '<div class="muted">未分配 IPv4</div>') +
        (i.v6.length ? '<div class="muted mono small">' + esc(i.v6[0]) + "</div>" : "") +
        '<div class="iface-rate"><span data-rx="' + esc(i.name) + '">↓ —</span>' +
        '<span data-tx="' + esc(i.name) + '">↑ —</span></div>' +
        '<div class="muted small iface-total" data-total="' + esc(i.name) + '">累计 ↓ — ↑ —</div>' +
        '<div class="muted small">MAC ' + esc(i.mac || "—") + " · MTU " + esc(i.mtu || "—") + "</div>" +
        "</div></div>";
    }).join("") + "</section>";

    return chipsPanel + upstream + chartPanel + donuts + cards;
  }

  function donut(box, segments, centerLabel) {
    if (!box) return;
    var total = segments.reduce(function (a, b) { return a + b.value; }, 0);
    if (!total) {
      box.innerHTML = '<div class="donut-empty muted">暂无数据</div>';
      return;
    }

    var legend = segments.map(function (seg) {
      var pct = total ? (seg.value / total * 100).toFixed(1) : "0.0";
      return '<li><span class="lg-dot" data-color="' + esc(seg.color) + '"></span>' +
        '<span class="lg-name">' + esc(seg.label) + "</span>" +
        '<span class="lg-val">' + fmtBytes(seg.value / 1024) + "</span>" +
        '<span class="lg-pct">' + pct + "%</span></li>";
    }).join("");

    box.innerHTML = '<div class="donut-wrap">' +
      '<div class="donut-canvas-wrap"><canvas class="donut-canvas"></canvas>' +
      '<span class="donut-center">' + esc(centerLabel || "") + "</span></div>" +
      '<ul class="donut-legend">' + legend + "</ul></div>";
    applyDynamicStyles(box);

    var canvas = $(".donut-canvas", box);
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var size = 132;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    var cx = size / 2, cy = size / 2, radius = size / 2 - 10, line = 26;
    var start = -Math.PI / 2;
    segments.forEach(function (seg) {
      if (seg.value <= 0) return;
      var angle = seg.value / total * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - line / 2, start, start + angle);
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = line;
      ctx.lineCap = "butt";
      ctx.stroke();
      start += angle;
    });
  }

  function paletteColor(i) {
    var p = themeColor("--p", "#5b4bc4");
    var t = themeColor("--t", "#00696d");
    var mix = getComputedStyle(document.documentElement).getPropertyValue("--s-container").trim() || "#e7e0f5";
    var set = [p, t, "#b3261e", "#7b4e00", mix, "#3f5aa6"];
    return set[i % set.length];
  }

  function startIfacePoll() {
    stopIfacePoll();
    var lastMap = null, lastT = 0, tickCount = 0;

    var tick = function () {
      if (document.hidden) return Promise.resolve();
      return API.netIfaces().then(function (list) {
        var now = Date.now();
        var byName = {};
        list.forEach(function (n) { byName[n.name] = n; });

        if (lastMap && now > lastT) {
          var dt = (now - lastT) / 1000;
          list.forEach(function (n) {
            var prev = lastMap[n.name];
            if (!prev) return;
            var rx = Math.max(0, (n.rx - prev.rx) / dt);
            var tx = Math.max(0, (n.tx - prev.tx) / dt);
            var er = $('[data-rx="' + n.name + '"]'), et = $('[data-tx="' + n.name + '"]');
            if (er) er.textContent = "↓ " + fmtRate(rx);
            if (et) et.textContent = "↑ " + fmtRate(tx);
          });

          var sel = state.netSel;
          var cur = byName[sel], prevSel = lastMap[sel];
          if (cur && prevSel) {
            var srx = Math.max(0, (cur.rx - prevSel.rx) / dt);
            var stx = Math.max(0, (cur.tx - prevSel.tx) / dt);
            live.ifaceHist.push({ rx: srx, tx: stx });
            if (live.ifaceHist.length > HIST_MAX) live.ifaceHist.shift();
            var a = $("#if-rx"), b = $("#if-tx");
            if (a) a.textContent = fmtRate(srx);
            if (b) b.textContent = fmtRate(stx);
            var tr = $("#if-total-rx"), tt = $("#if-total-tx");
            if (tr) tr.textContent = fmtBytes(cur.rx / 1024);
            if (tt) tt.textContent = fmtBytes(cur.tx / 1024);
            var rxSeries = live.ifaceHist.map(function (d) { return d.rx; });
            var txSeries = live.ifaceHist.map(function (d) { return d.tx; });
            // 手机端刚打开时历史点很少，补零让曲线铺满整条时间轴，不只剩最右边一根针
            if (isMobileView() && live.ifaceHist.length < HIST_MAX) {
              var zeroPad = [];
              for (var zi = HIST_MAX - live.ifaceHist.length; zi > 0; zi--) zeroPad.push(0);
              rxSeries = zeroPad.concat(rxSeries);
              txSeries = zeroPad.concat(txSeries);
            }
            drawSpark($("#iface-chart"), [
              { values: rxSeries, color: themeColor("--p", "#5b4bc4") },
              { values: txSeries, color: themeColor("--t", "#00696d") }
            ], fmtRate);
          }
        }

        list.forEach(function (n) {
          var el = $('[data-total="' + n.name + '"]');
          if (el) el.textContent = "累计 ↓ " + fmtBytes(n.rx / 1024) + " ↑ " + fmtBytes(n.tx / 1024);
        });

        var sel2 = state.netSel, c2 = byName[sel2];
        if (c2) {
          donut($("#donut-dir"), [
            { label: "下行", value: c2.rx, color: paletteColor(0) },
            { label: "上行", value: c2.tx, color: paletteColor(1) }
          ], fmtBytes((c2.rx + c2.tx) / 1024));
          updateMobileDir(c2);
        }

        if (++tickCount % 3 === 1) {
          API.connTraffic().then(function (conns) {
            var top = conns.slice(0, 5).map(function (c, i) {
              return { label: c.peer, value: c.sent + c.recv, color: paletteColor(i) };
            });
            var rest = conns.slice(5).reduce(function (a, c) { return a + c.sent + c.recv; }, 0);
            if (rest > 0) top.push({ label: "其他", value: rest, color: paletteColor(5) });
            donut($("#donut-peer"), top, "对端 " + conns.length);
            updateMobilePeers(conns);
          });
        }

        lastMap = byName; lastT = now;
      });
    };

    tick();
    // 与首页一样：350ms 后补一帧，网速不用等第一次 3 秒轮询
    setTimeout(function () { if (live.ifaceTimer) once("iface", tick); }, 350);
    live.ifaceTimer = setInterval(function () { once("iface", tick); }, 3000);
  }

  function stopIfacePoll() {
    if (live.ifaceTimer) clearInterval(live.ifaceTimer);
    live.ifaceTimer = null;
  }

  /* ---------------- 服务 ---------------- */
  function renderServices() {
    var list = state.services || [];
    var rows = list.map(function (u) {
      return '<tr><td class="svc-name" title="' + esc(u.name) + '"><b>' + esc(u.name) + "</b></td>" +
        '<td class="muted svc-desc" title="' + esc(u.desc || "") + '">' + esc(u.desc || "—") + "</td>" +
        '<td class="svc-status"><span class="chip chip-accent">运行中</span></td>' +
        '<td class="actions svc-actions">' +
        '<button class="btn btn-text" data-svc="' + esc(u.unit) + '" data-verb="restart">重启</button>' +
        '<button class="btn btn-text danger-text" data-svc="' + esc(u.unit) + '" data-verb="stop">停止</button>' +
        "</td></tr>";
    }).join("");
    return '<section class="panel"><div class="panel-head"><div class="panel-title"><h3>运行中的服务</h3>' +
      '<span class="muted">' + list.length + " 个</span></div></div>" +
      (list.length
        ? '<div class="table-wrap"><table class="table svc-table"><thead><tr><th>服务</th><th>描述</th><th>状态</th>' +
          '<th class="th-actions">操作</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : emptyBlock("没有运行中的服务", "")) +
      "</section>";
  }


  /* ---------------- 更新 ---------------- */

  /* ---------------- 虚拟机 ---------------- */
  function vmErrText(err) {
    return (err && err.message) ? err.message : String(err);
  }

  function vmStateInfo(v) {
    var s = String((v && v.state) || "").toLowerCase();
    if (s === "running") return { cls: "on", label: "运行中", chip: "chip-ok" };
    if (s === "paused") return { cls: "paused", label: "已暂停", chip: "chip-muted" };
    if (s === "crashed") return { cls: "crashed", label: "已崩溃", chip: "chip-warn" };
    if (!s || s === "shut off" || s === "shutoff") return { cls: "off", label: "已关机", chip: "chip-muted" };
    return { cls: "other", label: v.state, chip: "chip-muted" };
  }

  function vmSize(n) {
    n = Number(n) || 0;
    return n > 0 ? fmtBytes(n / 1024) : "—";
  }

  function vmDiskTotal(v) {
    return (v.disks || []).reduce(function (a, d) {
      return a + (d.device === "disk" ? (d.capacity || 0) : 0);
    }, 0);
  }

  function vmDiskUsed(v) {
    return (v.disks || []).reduce(function (a, d) {
      return a + (d.device === "disk" ? (d.allocation || 0) : 0);
    }, 0);
  }

  function renderVmSetup(env) {
    var commands = env.commands || {};
    var code = [];
    if (!commands.virsh || !commands["qemu-img"]) {
      code.push("sudo apt install -y libvirt-daemon-system libvirt-clients qemu-system-x86 virt-install");
    } else if (!commands["virt-install"]) {
      code.push("sudo apt install -y virt-install");
    }
    code.push("sudo systemctl enable --now libvirtd");
    return '<div class="vm-setup"><div class="vm-setup-ico">' + icon("monitor", 22) + "</div>" +
      '<div class="vm-setup-main"><b>libvirt 还没就绪</b>' +
      '<p class="muted">' + esc(env.error || "无法连接到虚拟机服务。") + "</p>" +
      '<pre class="vm-code">' + esc(code.join("\n")) + "</pre>" +
      '<p class="muted small">装好后点右上角刷新。ISO 放在 <span class="mono">' +
        esc(env.imagesDir || "/var/lib/libvirt/images") + "</span>、<span class=\"mono\">/srv</span> 或 <span class=\"mono\">/home</span> 下会自动出现在创建向导里。</p>" +
      "</div></div>";
  }

  function renderVmCard(v) {
    var st = vmStateInfo(v);
    var running = st.cls === "on";
    var paused = st.cls === "paused";
    var total = vmDiskTotal(v);
    var used = vmDiskUsed(v);
    var pct = total ? Math.round(used * 100 / total) : 0;
    var net = (v.nets || [])[0];
    var ip = v.primaryIp || (net && net.ips && net.ips[0]) || "—";
    var actions = "";
    if (running) {
      if (v.graphics && v.graphics.port) {
        actions += '<button class="btn btn-primary btn-sm" data-vm-console="' + esc(v.name) + '">控制台</button>';
      }
      actions += '<button class="btn btn-text btn-sm" data-vm="shutdown" data-vm-name="' + esc(v.name) + '">关机</button>';
    } else if (paused) {
      actions += '<button class="btn btn-primary btn-sm" data-vm="resume" data-vm-name="' + esc(v.name) + '">继续</button>';
    } else {
      actions += '<button class="btn btn-primary btn-sm" data-vm="start" data-vm-name="' + esc(v.name) + '">开机</button>';
    }
    actions += '<button class="btn btn-text btn-sm" data-vm-detail="' + esc(v.name) + '">详情</button>';
    return '<article class="vm-card"><div class="vm-card-head">' +
      '<span class="vm-dot ' + st.cls + '"></span>' +
      '<div class="vm-card-title"><b title="' + esc(v.name) + '">' + esc(v.name) + "</b>" +
        '<span class="muted">' + esc((v.arch || "x86_64")) +
        (v.snapshots ? " · " + v.snapshots + " 个快照" : "") + "</span></div>" +
      '<span class="chip ' + st.chip + '">' + esc(st.label) + "</span>" +
      "</div>" +
      '<div class="vm-specs">' +
        '<div><span>vCPU</span><b>' + esc(v.vcpu || "—") + "</b></div>" +
        '<div><span>内存</span><b>' + esc(vmSize(v.memMax)) + "</b></div>" +
        '<div><span>磁盘</span><b>' + esc(vmSize(total)) + "</b></div>" +
        '<div><span>IP</span><b class="mono" title="' + esc(ip) + '">' + esc(ip) + "</b></div>" +
      "</div>" +
      (total ? '<div class="vm-meter" title="磁盘已分配 ' + pct + '%"><span data-w="' + pct + '"></span></div>' : "") +
      '<div class="vm-card-foot">' +
        '<label class="switch mini"><input type="checkbox" data-vm-auto="' + esc(v.name) + '"' +
          (v.autostart ? " checked" : "") + " /><span>开机自启</span></label>" +
        '<span class="vm-actions">' + actions + "</span>" +
      "</div></article>";
  }

  function renderVmsPage() {
    var env = state.vmEnv;
    var list = state.vms;
    var running = (list || []).filter(function (v) { return vmStateInfo(v).cls === "on"; }).length;
    var sub = (env === undefined || env === null) ? "检查中…" :
      (!env.available ? "libvirt 未就绪" :
        ((list === undefined || list === null) ? "查询中…" :
          (list.length ? running + " 台运行中 · 共 " + list.length + " 台" : "尚未创建")));
    var head = '<section class="panel vms-panel">' +
      '<div class="panel-head"><div class="panel-title"><h3>虚拟机</h3>' +
      '<span class="muted">' + esc(sub) + "</span></div>" +
      '<div class="panel-tools">' +
        '<button class="btn btn-text" id="vms-refresh">刷新</button>' +
        '<button class="btn btn-primary" id="vm-create"' + (env && env.available ? "" : " disabled") + ">创建虚拟机</button>" +
      "</div></div>";

    if (env === undefined || env === null) {
      return head + '<div class="vm-loading">正在检查 libvirt…</div></section>';
    }
    if (!env.available) return head + renderVmSetup(env) + "</section>";
    if (state.vmsError) {
      return head + '<div class="vm-error">' + esc(state.vmsError) + "</div>" +
        '<div class="vm-loading">点右上角「刷新」重试，或检查 libvirtd 状态。</div></section>';
    }
    if (list === undefined || list === null) {
      return head + '<div class="vm-loading">正在读取虚拟机…</div></section>';
    }
    if (!list.length) {
      return head + '<div class="vm-empty">' + icon("monitor", 26) +
        "<b>还没有虚拟机</b><span>点右上角「创建虚拟机」，挂上 ISO 后就能在浏览器里装系统。</span>" +
        '<button class="btn btn-primary btn-sm" id="vm-create-empty">创建第一台</button>' +
        "</div></section>";
    }
    return head + '<div class="vm-grid">' + list.map(renderVmCard).join("") + "</div></section>";
  }

  function buildVmCreateDialog(env) {
    var netOpts = "";
    (env.networks || []).forEach(function (n) {
      netOpts += '<option value="network:' + esc(n.name) + '">' +
        (n.name === "default" ? "NAT（default 网络）" : "libvirt 网络 · " + esc(n.name)) +
        (n.active ? "" : "（创建时自动启动）") + "</option>";
    });
    (env.bridges || []).forEach(function (b) {
      netOpts += '<option value="bridge:' + esc(b) + '">桥接 · ' + esc(b) + "</option>";
    });
    netOpts += '<option value="none">无网络（隔离，稍后可在 XML 里加）</option>';
    var defaultNet = (env.networks || []).some(function (n) { return n.name === "default"; })
      ? "network:default"
      : ((env.bridges || []).length ? "bridge:" + env.bridges[0] : "none");

    var isoOpts = '<option value="">空白磁盘（可稍后插入 ISO）</option>';
    (env.isos || []).forEach(function (i) {
      isoOpts += '<option value="' + esc(i.path) + '">' + esc(i.name) +
        " · " + fmtBytes((i.size || 0) / 1024) + "</option>";
    });
    isoOpts += '<option value="__custom">手动输入 ISO 路径…</option>';

    openDialog(
      '<form class="dialog-form vm-create-form" id="vm-form">' +
        '<h2>创建虚拟机</h2>' +
        '<label class="field"><span>名称</span>' +
          '<input name="name" required maxlength="64" placeholder="vm01" autocomplete="off" />' +
        "</label>" +
        '<div class="field-row">' +
          '<label class="field"><span>vCPU</span><input name="vcpu" type="number" value="2" min="1" max="32" /></label>' +
          '<label class="field"><span>内存 (MB)</span><input name="memory" type="number" value="2048" min="256" step="256" /></label>' +
          '<label class="field"><span>磁盘 (GB)</span><input name="disk" type="number" value="20" min="1" max="4096" /></label>' +
        "</div>" +
        '<label class="field"><span>网络</span><select name="netMode">' + netOpts + "</select></label>" +
        '<label class="field"><span>或手动填桥接名（可选，覆盖上面的选择）</span>' +
          '<input name="bridge" placeholder="br0" autocomplete="off" /></label>' +
        '<label class="field"><span>安装镜像</span><select name="iso" id="vm-iso">' + isoOpts + "</select></label>" +
        '<label class="field" id="vm-iso-path-wrap" hidden><span>ISO 路径</span>' +
          '<input name="isoPath" placeholder="/srv/.../debian-13.iso" autocomplete="off" /></label>' +
        '<div class="switch-row">' +
          '<label class="switch"><input type="checkbox" name="start" checked /><span>创建后自动开机</span></label>' +
          '<label class="switch"><input type="checkbox" name="autostart" /><span>开机自启</span></label>' +
          '<label class="switch" title="Windows 安装盘没有 virtio 驱动时勾选"><input type="checkbox" name="compat" /><span>Windows 兼容（SATA + e1000e）</span></label>' +
        "</div>" +
        '<div class="form-error" id="vm-form-error" hidden></div>' +
        '<p class="muted small">磁盘：<span class="mono">' + esc(env.imagesDir) +
          "/&lt;名称&gt;.qcow2</span> · 剩余 " + esc(vmSize(env.imagesFree)) +
          "。选了 ISO 就可以在「控制台」里装系统。</p>" +
        '<div class="dialog-actions">' +
          '<button type="button" class="btn btn-text" data-close>取消</button>' +
          '<button type="submit" class="btn btn-primary" id="vm-submit">创建</button>' +
        "</div>" +
      "</form>",
      function (dlg) {
        dlg.classList.add("dialog-wide");
        $("#vm-form select[name=netMode]", dlg).value = defaultNet;
        $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
        var iso = $("#vm-iso", dlg);
        iso.addEventListener("change", function () {
          $("#vm-iso-path-wrap", dlg).hidden = iso.value !== "__custom";
        });
        $("#vm-form", dlg).addEventListener("submit", function (ev) {
          ev.preventDefault();
          var f = ev.target;
          var errBox = $("#vm-form-error", dlg);
          var fail = function (msg) {
            errBox.hidden = false;
            errBox.textContent = msg;
          };
          var name = f.elements.name.value.trim();
          if (!name) return fail("请填写名称");
          var netVal = f.elements.netMode.value;
          var customBridge = f.elements.bridge.value.trim();
          var netMode = "none", netName = "";
          if (customBridge) {
            netMode = "bridge"; netName = customBridge;
          } else if (netVal.indexOf("network:") === 0) {
            netMode = "network"; netName = netVal.slice(8);
          } else if (netVal.indexOf("bridge:") === 0) {
            netMode = "bridge"; netName = netVal.slice(7);
          }
          var isoVal = f.elements.iso.value;
          var isoPath = f.elements.isoPath.value.trim();
          var spec = {
            name: name,
            vcpu: Number(f.elements.vcpu.value),
            memory: Number(f.elements.memory.value),
            disk: Number(f.elements.disk.value),
            netMode: netMode,
            netName: netName,
            iso: isoPath || (isoVal === "__custom" ? "" : isoVal),
            start: f.elements.start.checked,
            autostart: f.elements.autostart.checked,
            compat: f.elements.compat.checked
          };
          var btn = $("#vm-submit", dlg);
          btn.disabled = true;
          btn.textContent = "创建中…";
          errBox.hidden = true;
          API.vmCreate(spec).then(function (r) {
            dlg.close();
            toast("虚拟机 " + spec.name + " 已创建", "success");
            (r && r.warnings || []).forEach(function (w) { toast(w, "error"); });
            return refresh();
          }).then(function () {
            setTimeout(refresh, 2500);
            setTimeout(refresh, 6000);
          }).catch(function (err) {
            btn.disabled = false;
            btn.textContent = "创建";
            fail(vmErrText(err));
          });
        });
      }
    );
  }

  function vmCreateDialog() {
    // 每次都重新读环境：新放进镜像目录的 ISO 能立刻出现在下拉框里
    API.vmEnv().then(function (e) {
      state.vmEnv = e;
      if (!e.available) {
        toast("libvirt 未就绪，按页面提示先安装", "error");
        return;
      }
      buildVmCreateDialog(e);
    }).catch(function (err) { toast("读取 libvirt 信息失败：" + vmErrText(err), "error"); });
  }

  function vmConsoleOpen(name) {
    window.open("/console.html?vm=" + encodeURIComponent(name), "_blank", "noopener");
  }

  function loadVmSnapshots(dlg, v) {
    var box = $("#vm-snap-list", dlg);
    if (!box) return;
    API.vmSnapshots(v.name).then(function (list) {
      if (!list || !list.length) {
        box.innerHTML = '<span class="muted small">还没有快照</span>';
        return;
      }
      box.innerHTML = list.map(function (s) {
        var when = s.created ? new Date(s.created * 1000).toLocaleString() : "";
        return '<div class="snap-row"><div class="grow"><b>' + esc(s.name) + "</b>" +
          (s.description ? ' <span class="muted">' + esc(s.description) + "</span>" : "") +
          '<div class="muted small">' + esc(when) + (s.state ? " · " + esc(s.state) : "") + "</div></div>" +
          '<button class="btn btn-text btn-sm" data-snap-revert="' + esc(s.name) + '">恢复</button>' +
          '<button class="btn btn-text btn-sm danger-text" data-snap-del="' + esc(s.name) + '">删除</button>' +
          "</div>";
      }).join("");
      $$("[data-snap-revert]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var snap = b.dataset.snapRevert;
          confirmDialog("恢复快照 " + snap + "？", "虚拟机会回到快照时的状态，未保存的数据会丢失。", function () {
            b.disabled = true;
            API.vmSnapshotRevert(v.name, snap).then(function () {
              toast("已请求恢复快照", "success");
              dlg.close();
              setTimeout(refresh, 1200);
            }).catch(function (err) { b.disabled = false; toast("恢复失败：" + vmErrText(err), "error"); });
          });
        });
      });
      $$("[data-snap-del]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var snap = b.dataset.snapDel;
          confirmDialog("删除快照 " + snap + "？", "快照数据会永久删除。", function () {
            b.disabled = true;
            API.vmSnapshotDelete(v.name, snap).then(function () {
              toast("快照已删除", "success");
              loadVmSnapshots(dlg, v);
            }).catch(function (err) { b.disabled = false; toast("删除失败：" + vmErrText(err), "error"); });
          });
        });
      });
    }).catch(function (err) {
      box.innerHTML = '<span class="muted small">读取快照失败：' + esc(vmErrText(err)) + "</span>";
    });
  }

  function vmDetailDialog(name) {
    var v = (state.vms || []).filter(function (x) { return x.name === name; })[0];
    if (!v) { toast("虚拟机不存在，请刷新页面", "error"); return; }
    var st = vmStateInfo(v);
    var running = st.cls === "on";
    var paused = st.cls === "paused";
    var off = !running && !paused;
    var actions = "";
    if (running) {
      if (v.graphics && v.graphics.port) {
        actions += '<button class="btn btn-primary btn-sm" data-vmd-console="1">控制台</button>';
      }
      actions += '<button class="btn btn-text btn-sm" data-vmd-act="reboot">重启</button>' +
        '<button class="btn btn-text btn-sm" data-vmd-act="suspend">暂停</button>' +
        '<button class="btn btn-text btn-sm danger-text" data-vmd-act="destroy">强制停止</button>';
    } else if (paused) {
      actions += '<button class="btn btn-primary btn-sm" data-vmd-act="resume">继续</button>' +
        '<button class="btn btn-text btn-sm danger-text" data-vmd-act="destroy">强制停止</button>';
    } else {
      actions += '<button class="btn btn-primary btn-sm" data-vmd-act="start">开机</button>';
    }

    var diskRows = (v.disks || []).map(function (d) {
      var isCd = d.device === "cdrom";
      var act = isCd
        ? '<button class="btn btn-text btn-sm" data-vmd-cdrom="' + esc(d.target) + '">' +
          (d.path ? "更换/弹出" : "插入 ISO") + "</button>"
        : '<button class="btn btn-text btn-sm" data-vmd-resize="' + esc(d.target) + '">扩容</button>';
      return "<tr><td><b>" + esc(d.target) + '</b><div class="muted small">' +
        esc(isCd ? "光驱" : (d.format || "磁盘")) + "</div></td>" +
        '<td class="mono vm-path" title="' + esc(d.path) + '">' +
        esc(d.path ? d.path.split("/").pop() : "空") + "</td>" +
        "<td>" + (isCd ? (d.path ? "已挂载" : "空") :
          vmSize(d.capacity) + (d.allocation ? ' <span class="muted small">/ 已用 ' + vmSize(d.allocation) + "</span>" : "")) + "</td>" +
        '<td class="vm-row-act">' + act + "</td></tr>";
    }).join("");

    var netRows = (v.nets || []).map(function (n) {
      return "<tr><td>" + esc(n.iface) + "</td><td>" + esc(n.type) + "</td><td>" +
        esc(n.source || "—") + '</td><td class="mono">' + esc(n.mac || "—") +
        '</td><td class="mono">' + esc((n.ips || []).join(", ") || "—") + "</td></tr>";
    }).join("");

    var res = off ? '<div class="vm-section"><h3>资源调整</h3>' +
      '<div class="vm-res-grid">' +
        '<label class="field"><span>vCPU</span><input id="vm-res-vcpu" type="number" min="1" max="32" value="' +
          esc(v.vcpu || 1) + '" /></label>' +
        '<label class="field"><span>内存 (MB)</span><input id="vm-res-mem" type="number" min="256" step="256" value="' +
          esc(Math.round((v.memMax || 0) / 1048576)) + '" /></label>' +
        '<button class="btn btn-primary btn-sm" id="vm-res-save">保存</button>' +
      "</div><p class=\"muted small\">仅关机状态可调；提高 vCPU 时会同步提高上限。</p></div>" : "";

    openDialog(
      '<div class="dialog-form vm-detail">' +
        '<div class="vm-detail-head"><div class="vm-detail-title"><h2>' + esc(v.name) + "</h2>" +
          '<span class="chip ' + st.chip + '">' + esc(st.label) + "</span>" +
          (v.autostart ? '<span class="chip chip-muted">开机自启</span>' : "") +
        '</div><div class="vm-detail-actions">' + actions + "</div></div>" +
        '<div class="vm-facts">' +
          "<div><span>vCPU</span><b>" + esc(v.vcpu || "—") + "</b></div>" +
          "<div><span>内存</span><b>" + esc(vmSize(v.memMax)) + "</b></div>" +
          "<div><span>磁盘</span><b>" + esc(vmSize(vmDiskTotal(v))) + "</b></div>" +
          "<div><span>快照</span><b>" + esc(v.snapshots || 0) + "</b></div>" +
          "<div><span>架构</span><b>" + esc(v.arch || "—") + "</b></div>" +
          '<div><span>UUID</span><b class="mono" title="' + esc(v.uuid) + '">' + esc((v.uuid || "").slice(0, 8)) + "…</b></div>" +
        "</div>" +
        '<div class="vm-section"><h3>磁盘</h3>' +
          (diskRows ? '<div class="table-wrap"><table class="vm-table"><thead><tr><th>设备</th><th>镜像</th><th>容量</th><th></th></tr></thead><tbody>' +
            diskRows + "</tbody></table></div>" : '<p class="muted small">没有磁盘</p>') + "</div>" +
        '<div class="vm-section"><h3>网络</h3>' +
          (netRows ? '<div class="table-wrap"><table class="vm-table"><thead><tr><th>接口</th><th>类型</th><th>来源</th><th>MAC</th><th>IP</th></tr></thead><tbody>' +
            netRows + "</tbody></table></div>" : '<p class="muted small">没有网卡</p>') + "</div>" +
        '<div class="vm-section"><h3>快照</h3><div id="vm-snap-list" class="snap-list"><span class="muted small">读取中…</span></div>' +
          '<div class="vm-snap-create"><input id="vm-snap-name" class="vm-input" placeholder="快照名（留空自动生成）" />' +
          '<button class="btn btn-text btn-sm" id="vm-snap-add">创建快照</button></div>' +
          '<p class="muted small">内部快照保存在 qcow2 里；Windows + UEFI 的虚拟机可能不支持。</p></div>' +
        res +
        '<div class="vm-detail-foot"><button class="btn btn-text btn-sm danger-text" id="vm-delete">删除虚拟机</button>' +
          '<button class="btn btn-text btn-sm" data-close>关闭</button></div>' +
      "</div>",
      function (dlg) {
        dlg.classList.add("dialog-wide");
        $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
        $("#vm-delete", dlg).addEventListener("click", function () {
          dlg.close();
          vmDeleteDialog(v);
        });
        var con = $("[data-vmd-console]", dlg);
        if (con) con.addEventListener("click", function () { vmConsoleOpen(v.name); });
        $$("[data-vmd-act]", dlg).forEach(function (b) {
          b.addEventListener("click", function () {
            var act = b.dataset.vmdAct;
            var doIt = function () {
              b.disabled = true;
              API.vmAction(v.name, act).then(function () {
                toast("指令已发送", "success");
                dlg.close();
                setTimeout(refresh, 1200);
                setTimeout(refresh, 4000);
              }).catch(function (err) {
                b.disabled = false;
                toast("操作失败：" + vmErrText(err), "error");
              });
            };
            if (act === "start" || act === "resume") return doIt();
            confirmDialog((act === "reboot" ? "重启 " : act === "suspend" ? "暂停 " : "强制停止 ") +
              v.name + "？", "", doIt);
          });
        });
        $$("[data-vmd-resize]", dlg).forEach(function (b) {
          b.addEventListener("click", function () {
            var target = b.dataset.vmdResize;
            var disk = (v.disks || []).filter(function (d) { return d.target === target; })[0];
            if (!disk) return;
            var cur = Math.round((disk.capacity || 0) / 1073741824);
            var input = prompt("把 " + target + " 扩容到多少 GB？（当前 " + cur + " GB，只能增大）", String(cur + 10));
            if (!input) return;
            var gb = Number(input);
            if (!(gb > cur)) { toast("新容量必须大于当前容量", "error"); return; }
            b.disabled = true;
            API.vmDiskResize(v.name, target, gb).then(function () {
              toast("磁盘已扩容；还需要在 guest 里扩展分区/文件系统", "success");
              dlg.close();
              refresh();
            }).catch(function (err) {
              b.disabled = false;
              toast("扩容失败：" + vmErrText(err), "error");
            });
          });
        });
        $$("[data-vmd-cdrom]", dlg).forEach(function (b) {
          b.addEventListener("click", function () {
            var target = b.dataset.vmdCdrom;
            var disk = (v.disks || []).filter(function (d) { return d.target === target; })[0];
            dlg.close();
            vmCdromDialog(v.name, disk || {});
          });
        });
        $("#vm-snap-add", dlg).addEventListener("click", function () {
          var input = $("#vm-snap-name", dlg);
          var snap = input.value.trim();
          var btn = $("#vm-snap-add", dlg);
          btn.disabled = true;
          API.vmSnapshotCreate(v.name, snap).then(function () {
            input.value = "";
            toast("快照已创建", "success");
            loadVmSnapshots(dlg, v);
          }).catch(function (err) {
            toast("创建快照失败：" + vmErrText(err), "error");
          }).then(function () { btn.disabled = false; });
        });
        var save = $("#vm-res-save", dlg);
        if (save) {
          save.addEventListener("click", function () {
            var vcpu = Number($("#vm-res-vcpu", dlg).value);
            var mem = Number($("#vm-res-mem", dlg).value);
            if (!vcpu || !mem) { toast("请填写 vCPU 和内存", "error"); return; }
            save.disabled = true;
            API.vmConfig(v.name, vcpu, mem).then(function () {
              toast("资源已更新，下次开机生效", "success");
              dlg.close();
              refresh();
            }).catch(function (err) {
              save.disabled = false;
              toast("调整失败：" + vmErrText(err), "error");
            });
          });
        }
        loadVmSnapshots(dlg, v);
      }
    );
  }

  function vmDeleteDialog(v) {
    var blocked = vmStateInfo(v).cls === "on" || vmStateInfo(v).cls === "paused";
    openDialog(
      '<div class="dialog-form"><h2>删除 ' + esc(v.name) + "</h2>" +
        '<p class="muted">虚拟机会从 libvirt 中移除，操作不可恢复。</p>' +
        (blocked ? '<p class="chip chip-warn">正在运行或暂停，请先关机</p>' : "") +
        '<label class="switch"><input type="checkbox" id="del-disks" checked /><span>同时删除磁盘文件</span></label>' +
        '<div class="dialog-actions"><button class="btn btn-text" data-close>取消</button>' +
        '<button class="btn btn-danger" id="del-ok"' + (blocked ? " disabled" : "") + ">删除</button></div></div>",
      function (dlg) {
        $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
        $("#del-ok", dlg).addEventListener("click", function () {
          var removeDisks = $("#del-disks", dlg).checked;
          var btn = $("#del-ok", dlg);
          btn.disabled = true;
          btn.textContent = "删除中…";
          API.vmDelete(v.name, removeDisks).then(function (r) {
            dlg.close();
            toast("已删除 " + v.name + (r && r.removed && r.removed.length ? "（含磁盘）" : ""), "success");
            refresh();
          }).catch(function (err) {
            btn.disabled = false;
            btn.textContent = "删除";
            toast("删除失败：" + vmErrText(err), "error");
          });
        });
      }
    );
  }

  function vmCdromDialog(name, disk) {
    API.vmIsos().then(function (isos) {
      var opts = (isos || []).map(function (i) {
        return '<option value="' + esc(i.path) + '">' + esc(i.name) + " · " + fmtBytes((i.size || 0) / 1024) + "</option>";
      }).join("");
      openDialog(
        '<div class="dialog-form"><h2>光驱 · ' + esc(name) + "</h2>" +
          '<p class="muted small">当前：<span class="mono">' + esc(disk.path || "空") + "</span></p>" +
          '<label class="field"><span>选择镜像</span><select id="cd-iso"><option value="">弹出光盘</option>' +
            opts + "</select></label>" +
          '<label class="field"><span>或手动输入 ISO 路径</span><input id="cd-path" placeholder="/srv/...iso" /></label>' +
          '<div class="dialog-actions"><button class="btn btn-text" data-close>取消</button>' +
          '<button class="btn btn-primary" id="cd-ok">应用</button></div></div>',
        function (dlg) {
          $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
          $("#cd-ok", dlg).addEventListener("click", function () {
            var iso = $("#cd-path", dlg).value.trim() || $("#cd-iso", dlg).value;
            var btn = $("#cd-ok", dlg);
            btn.disabled = true;
            API.vmCdrom(name, iso).then(function () {
              dlg.close();
              toast(iso ? "已挂载光盘；运行中的虚拟机重启后才会从光盘引导" : "已弹出光盘", "success");
              refresh();
            }).catch(function (err) {
              btn.disabled = false;
              toast("更换光盘失败：" + vmErrText(err), "error");
            });
          });
        }
      );
    }).catch(function (err) { toast("读取镜像失败：" + vmErrText(err), "error"); });
  }


  function renderUpdates() {
    var apt = state.apt || { count: 0, packages: [] };
    var auto = state.autoUpgrade;
    var portal = state.portal || {};
    var ctrs = state.containers || [];
    var log = state.aptLog || [];
    var out = [];

    var upCount = Number(apt.count) || 0;
    var newCount = Number(apt.newCount) || 0;
    var removeCount = Number(apt.removeCount) || 0;
    var heroCount = upCount || newCount;
    var heroLabel = upCount ? "个软件包可更新"
      : newCount ? "个新依赖待安装" : "系统已是最新";
    var heroNote = upCount
      ? "完整升级" + (newCount ? "，另安装 " + newCount + " 个新依赖" : "") +
        (removeCount ? "，移除 " + removeCount + " 个包" : "") + "；完成后可能需要重启"
      : newCount ? "完整升级会安装这些新依赖；完成后可能需要重启"
      : "没有待安装的更新";

    /* ① 状态区：一眼看到有没有要更新的 */
    var pkgChips = (apt.packages || []).slice(0, 8).map(function (p) {
      return '<span class="pkg-chip">' + esc(p.name) +
        '<i>' + esc(p.to) + "</i></span>";
    }).join("");

    out.push('<section class="upd-hero' + (heroCount ? "" : " is-clean") + '">' +
      '<div class="upd-hero-main">' +
        '<div class="upd-num">' + (heroCount || "0") + "</div>" +
        '<div class="upd-hero-text"><b>' + heroLabel + "</b>" +
          '<span class="muted">' + heroNote + "</span>" +
        "</div>" +
      "</div>" +
      '<div class="upd-hero-actions">' +
        '<button class="btn btn-text" id="apt-check">重新检查</button>' +
        '<button class="btn btn-primary" id="apt-upgrade"' + (heroCount ? "" : " disabled") + ">立即升级</button>" +
      "</div>" +
      (pkgChips ? '<div class="pkg-chips">' + pkgChips + "</div>" : "") +
      "</section>");

    /* ② 自动升级：开关 + 周期 */
    var SCHED = { daily: "每天 03:00", weekly: "每周日 03:00", monthly: "每月 1 日 03:00" };
    var enabled = !!(auto && auto.enabled);
    var sched = (auto && auto.schedule) || "daily";
    out.push('<section class="panel panel-tight upd-switch-row">' +
      '<label class="switch"><input type="checkbox" id="auto-toggle"' +
        (enabled ? " checked" : "") + (auto === null ? " disabled" : "") +
        ' /><span>无人值守自动升级</span></label>' +
      '<select class="select" id="auto-freq"' + (enabled && auto !== null ? "" : " disabled") + ">" +
        Object.keys(SCHED).map(function (k) {
          return '<option value="' + k + '"' + (sched === k ? " selected" : "") + ">" + SCHED[k] + "</option>";
        }).join("") +
      "</select>" +
      '<span class="muted small">' +
        (auto === null ? "未安装 unattended-upgrades" : "到点自动安装更新，随机延迟 15 分钟") +
      "</span></section>");

    /* ③ 组件：统一成列表 */
    var rows = [];
    if (portal.source) {
      rows.push('<div class="comp-row"><div class="comp-main"><b>控制台</b>' +
        '<span class="muted mono">' + esc(portal.source) + "</span></div>" +
        '<span class="muted small">' + (portal.deployed ? "部署于 " + esc(portal.deployed.slice(5, 16).replace("T", " ")) : "本地源码") + "</span>" +
        '<button class="btn btn-text" id="redeploy">重新部署</button></div>');
    }
    ctrs.forEach(function (c) {
      rows.push('<div class="comp-row"><div class="comp-main"><b>' + esc(c.name) + "</b>" +
        '<span class="muted mono">' + esc(c.image) + "</span></div>" +
        '<span class="chip chip-muted">' + esc(c.status) + "</span>" +
        '<button class="btn btn-text" data-pull="' + esc(c.image) + '">拉取镜像</button>' +
        '<button class="btn btn-text" data-vnc="' + esc(c.name) + '">查看口令</button></div>');
    });
    if (rows.length) {
      out.push('<section class="panel"><div class="panel-head"><div class="panel-title">' +
        '<h3>组件</h3><span class="muted">' + rows.length + " 个</span></div></div>" +
        '<div class="comp-list">' + rows.join("") + "</div></section>");
    }

    /* ④ 更新日志：按天分组的时间线 */
    if (log.length) out.push(renderUpdateLog(log));

    return out.join("");
  }

  function renderUpdateLog(log) {
    var byDay = [];
    log.slice(0, 10).forEach(function (e) {
      var day = (e.date || "").slice(0, 10);
      var bucket = byDay[byDay.length - 1];
      if (!bucket || bucket.day !== day) { bucket = { day: day, items: [] }; byDay.push(bucket); }
      bucket.items.push(e);
    });

    var body = byDay.map(function (b) {
      var items = b.items.map(function (e) {
        var parts = [];
        function line(list, cls, label) {
          if (!list.length) return "";
          var shown = list.slice(0, 5).map(function (p) { return esc(p.name); }).join("、");
          var more = list.length > 5 ? " 等 " + list.length + " 个" : "";
          return '<div class="log-line"><span class="dot ' + cls + '"></span>' +
            '<span class="log-kind">' + label + "</span>" +
            '<span class="log-pkgs">' + shown + more + "</span></div>";
        }
        parts.push(line(e.upgrade, "up", "升级"));
        parts.push(line(e.install, "in", "安装"));
        parts.push(line(e.remove, "rm", "移除"));
        var tm = (/(\d{2}:\d{2}):\d{2}\s*$/.exec(e.date || "") || [])[1] || "";
        return '<div class="log-item"><div class="log-time mono">' +
          esc(tm) + "</div><div>" + parts.join("") + "</div></div>";
      }).join("");
      return '<div class="log-day"><div class="log-day-label">' + esc(b.day) + "</div>" +
        '<div class="log-day-items">' + items + "</div></div>";
    }).join("");

    return '<section class="panel"><div class="panel-head"><div class="panel-title">' +
      '<h3>更新日志</h3><span class="muted">最近 ' + Math.min(10, log.length) + " 次</span></div></div>" +
      '<div class="timeline">' + body + "</div></section>";
  }



  /* ---------------- 工具：日志 / 终端 / 文件 / 虚拟机 / 应用 ---------------- */
  var TOOL_TABS = [
    { id: "logs", label: "日志" },
    { id: "terminal", label: "终端" },
    { id: "files", label: "文件" }
  ];

  function toolData() {
    if (!state.tool || state.tool === "apps") state.tool = "logs";
    if (!state.td) {
      state.td = { logs: null, units: [], fs: null, fsPath: state.user && state.user.home ? state.user.home : "/",
        apps: null, query: "", unit: "", clip: null };
    }
    return state.td;
  }

  function fmtClock(ts) {
    var d = new Date(ts * 1000);
    var p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }

  function toolPage(id) {
    var body = id === "terminal" ? renderTerm() : (id === "files" ? renderFiles() : renderLogs());
    return '<section class="tool-shell"><div class="tool-body" id="tool-body">' + body + "</div></section>";
  }

  function renderTools() {
    var d = toolData();
    var nav = TOOL_TABS.map(function (t) {
      return '<button class="tool-tab' + (state.tool === t.id ? " active" : "") +
        '" data-tool="' + t.id + '">' + t.label + "</button>";
    }).join("");
    return '<section class="tool-shell"><div class="tool-nav">' + nav + "</div>" +
      '<div class="tool-body" id="tool-body">' + renderToolBody() + "</div></section>";
  }

  function renderToolBody() {
    if (state.tool === "terminal") return renderTerm();
    if (state.tool === "files") return renderFiles();
    return renderLogs();
  }

  /* ---- 日志 ---- */
  function renderLogs() {
    var d = toolData();
    var rows;
    if (d.logs === null) {
      rows = '<div class="tool-empty">正在读取日志…</div>';
    } else {
      var q = (d.query || "").toLowerCase();
      var seen = d.logs.filter(function (e) {
        return !q || e.msg.toLowerCase().indexOf(q) >= 0 || e.unit.toLowerCase().indexOf(q) >= 0;
      }).slice(-400).reverse();
      rows = seen.length ? seen.map(function (e) {
        var cls = e.pri <= 3 ? "err" : e.pri === 4 ? "warn" : "info";
        return '<div class="logi ' + cls + '"><span class="mono">' + fmtClock(e.t) + "</span>" +
          '<span class="logi-unit">' + esc(e.unit.replace(/\.service$/, "")) + "</span>" +
          '<span class="logi-msg">' + esc(e.msg) + "</span></div>";
      }).join("") : '<div class="tool-empty">没有匹配的日志</div>';
    }

    var units = (d.units || []).map(function (u) {
      return '<option value="' + esc(u) + '"' + (d.unit === u ? " selected" : "") + ">" + esc(u) + "</option>";
    }).join("");

    return '<div class="tool-bar">' +
      '<input class="tool-input" id="log-q" placeholder="搜索日志…" value="' + esc(d.query) + '" />' +
      '<select class="select" id="log-unit"><option value="">全部单元</option>' + units + "</select>" +
      '<button class="btn btn-text" id="log-refresh">刷新</button></div>' +
      '<div class="logi-list">' + rows + "</div>";
  }

  /* ---- 终端 ---- */
  var XTERM = { promise: null };
  var termX = { term: null, fit: null, ws: null, box: null, ro: null, timer: null, opening: false, exited: false, failed: false };

  function termHost() {
    return (state.info && state.info.host) || (state.user && state.user.host) ||
      location.hostname || "debnas";
  }

  function termUser() {
    return (state.user && state.user.name) || "user";
  }

  function termVisible() {
    return state.view === "terminal" || (state.view === "tools" && state.tool === "terminal");
  }

  function loadXterm() {
    if (XTERM.promise) return XTERM.promise;
    XTERM.promise = new Promise(function (resolve, reject) {
      var ready = 0;
      var done = function () { if (++ready >= 2) resolve(); };
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "./xterm/xterm.css";
      css.onload = done;
      css.onerror = function () { reject(new Error("xterm.css 加载失败")); };
      document.head.appendChild(css);
      var s1 = document.createElement("script");
      s1.src = "./xterm/xterm.js";
      s1.onload = function () {
        var s2 = document.createElement("script");
        s2.src = "./xterm/addon-fit.js";
        s2.onload = done;
        s2.onerror = function () { reject(new Error("addon-fit.js 加载失败")); };
        document.head.appendChild(s2);
      };
      s1.onerror = function () { reject(new Error("xterm.js 加载失败")); };
      document.head.appendChild(s1);
    });
    return XTERM.promise;
  }

  function termStatus(text, cls) {
    var el = $("#term-status");
    if (!el) return;
    el.textContent = text;
    el.className = "term-status" + (cls ? " " + cls : "");
  }

  function disposeTerm() {
    if (termX.timer) { clearTimeout(termX.timer); termX.timer = null; }
    if (termX.ro) { try { termX.ro.disconnect(); } catch (e) {} termX.ro = null; }
    if (termX.ws) {
      try { termX.ws.onclose = null; termX.ws.close(); } catch (e) {}
      termX.ws = null;
    }
    if (termX.fit) { try { termX.fit.dispose(); } catch (e) {} termX.fit = null; }
    if (termX.term) { try { termX.term.dispose(); } catch (e) {} termX.term = null; }
    termX.box = null;
    termX.opening = false;
  }

  function connectTerm() {
    if (!termX.term) return;
    if (termX.ws) {
      try { termX.ws.onclose = null; termX.ws.close(); } catch (e) {}
      termX.ws = null;
    }
    var cols = termX.term.cols || 100, rows = termX.term.rows || 26;
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var url = proto + "//" + location.host + "/api/term?cols=" + cols + "&rows=" + rows;
    termX.exited = false;
    termX.failed = false;
    termStatus("连接中…", "wait");
    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      termStatus("连接失败", "err");
      return;
    }
    ws.binaryType = "arraybuffer";
    termX.ws = ws;
    ws.onopen = function () {
      termStatus("已连接", "ok");
      try { termX.fit.fit(); } catch (e) {}
    };
    ws.onmessage = function (ev) {
      if (!termX.term) return;
      if (typeof ev.data === "string") {
        try {
          var msg = JSON.parse(ev.data);
          if (msg && msg.type === "exit") {
            termX.exited = true;
            termStatus("已退出", "off");
          } else if (msg && msg.type === "error") {
            termX.exited = true;
            termX.failed = true;
            termStatus("创建失败", "err");
            termX.term.write("\r\n\x1b[31m" + String(msg.message || "PTY 错误") + "\x1b[0m\r\n");
          }
        } catch (e) {}
        return;
      }
      termX.term.write(new Uint8Array(ev.data));
    };
    ws.onerror = function () { termStatus("连接失败", "err"); };
    ws.onclose = function () {
      if (termX.ws !== ws) return;
      termX.ws = null;
      termStatus(termX.failed ? "创建失败" : termX.exited ? "已退出" : "已断开",
                 termX.failed ? "err" : "off");
      if (termX.term && !termX.exited) {
        termX.term.write("\r\n\x1b[38;5;244m[连接已断开，点右上角重连]\x1b[0m\r\n");
      }
    };
  }

  function mountTerminal() {
    var box = $("#term-xterm");
    if (!box) { disposeTerm(); return; }
    if (termX.box === box && termX.term) {
      try { termX.fit.fit(); } catch (e) {}
      termX.term.focus();
      return;
    }
    if (termX.opening) return;
    disposeTerm();
    termX.box = box;
    termX.opening = true;
    box.innerHTML = '<div class="term-loading"><span class="term-spinner"></span>正在加载终端…</div>';
    loadXterm().then(function () {
      if (!document.body.contains(box)) { termX.opening = false; return; }
      box.innerHTML = "";
      var term = new Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontSize: 13,
        fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace',
        lineHeight: 1.25,
        scrollback: 5000,
        theme: {
          background: "#0d1017", foreground: "#d7dce8", cursor: "#7ee787",
          cursorAccent: "#0d1017", selectionBackground: "#2b3242",
          black: "#0d1017", red: "#ff7b72", green: "#7ee787", yellow: "#e3b341",
          blue: "#79c0ff", magenta: "#d2a8ff", cyan: "#56d4dd", white: "#c9d1d9",
          brightBlack: "#6e7681", brightRed: "#ffa198", brightGreen: "#aff5b4",
          brightYellow: "#f2cc60", brightBlue: "#a5d6ff", brightMagenta: "#e2c5ff",
          brightCyan: "#9be9ef", brightWhite: "#f0f6fc"
        }
      });
      var fit = new FitAddon.FitAddon();
      term.loadAddon(fit);
      term.open(box);
      fit.fit();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          if (termX.fit && termX.box === box) {
            try { termX.fit.fit(); } catch (e) {}
          }
        });
      }
      termX.term = term;
      termX.fit = fit;
      termX.opening = false;
      term.focus();
      term.onData(function (data) {
        if (!termX.ws || termX.ws.readyState !== 1) return;
        termX.ws.send(new TextEncoder().encode(data));
      });
      term.onResize(function (size) {
        if (!termX.ws || termX.ws.readyState !== 1) return;
        termX.ws.send(JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }));
      });
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(function () {
          if (termX.timer) clearTimeout(termX.timer);
          termX.timer = setTimeout(function () {
            if (termX.fit && termX.box === box) {
              try { termX.fit.fit(); } catch (e) {}
            }
          }, 120);
        });
        ro.observe(box);
        termX.ro = ro;
      }
      connectTerm();
    }).catch(function (e) {
      termX.opening = false;
      XTERM.promise = null;
      box.innerHTML = '<div class="term-error">终端组件加载失败：' +
        esc(e && e.message ? e.message : e) + "</div>";
    });
  }

  function renderTerm() {
    var user = termUser(), host = termHost();
    return '<div class="term-wrap"><div class="term-bar">' +
        '<span class="term-lights"><i></i><i></i><i></i></span>' +
        '<div class="term-title"><b>' + esc(user) + "@" + esc(host) + "</b><span>/bin/bash · PTY</span></div>" +
        '<div class="term-tools"><span class="term-status wait" id="term-status">连接中…</span>' +
        '<button class="term-btn" id="term-reconnect" type="button">重连</button>' +
        '<button class="term-btn" id="term-clear" type="button">清空</button></div></div>' +
        '<div class="term-xterm" id="term-xterm"></div></div>';
  }

  /* ---- 文件 ---- */
  var FILE_KINDS = {
    md: "Markdown", txt: "文本", log: "日志", json: "JSON", yml: "YAML", yaml: "YAML",
    sh: "脚本", py: "Python", js: "JavaScript", html: "网页", css: "样式",
    png: "图片", jpg: "图片", jpeg: "图片", gif: "图片", webp: "图片", svg: "图片",
    mp4: "视频", mkv: "视频", mp3: "音频", flac: "音频",
    zip: "压缩包", gz: "压缩包", xz: "压缩包", tar: "压缩包", "7z": "压缩包",
    iso: "镜像", img: "镜像", deb: "软件包", conf: "配置", service: "单元", pem: "证书", crt: "证书"
  };

  function fileKind(name, dir) {
    if (dir) return "目录";
    var i = name.lastIndexOf(".");
    var ext = i > 0 ? name.slice(i + 1).toLowerCase() : "";
    return FILE_KINDS[ext] || (ext ? ext.toUpperCase() + " 文件" : "文件");
  }

  function renderFiles() {
    var d = toolData();
    if (typeof d.showHidden !== "boolean") d.showHidden = false;
    var parts = d.fsPath.split("/").filter(Boolean);
    var crumbs = '<button class="crumb" data-fs="/">/</button>' +
      parts.map(function (p, i) {
        return '<button class="crumb" data-fs="/' + parts.slice(0, i + 1).join("/") + '">' + esc(p) + "</button>";
      }).join("");

    var listed = (d.fs || []).filter(function (f) {
      return d.showHidden || f.name.charAt(0) !== ".";
    });

    var body;
    if (d.fs === null) body = '<div class="tool-empty">读取中…</div>';
    else if (!listed.length) body = '<div class="tool-empty">空目录</div>';
    else {
      body = listed.map(function (f) {
        var p = (d.fsPath === "/" ? "" : d.fsPath) + "/" + f.name;
        var cut = !!(d.clip && d.clip.mode === "cut" && d.clip.path === p);
        return '<div class="fsr' + (cut ? " is-cut" : "") + '" data-path="' + esc(p) + '"' +
          (f.dir ? ' data-dir="1"' : "") + '><span class="fsr-ico">' + (f.dir ? "▸" : "·") + "</span>" +
          '<button class="fsr-name' + (f.dir ? " is-dir" : "") + '"' +
            (f.dir ? ' data-fs="' + esc(p) + '"' : ' data-file="' + esc(p) + '"') + ">" + esc(f.name) + "</button>" +
          '<span class="fsr-meta">' + esc(fileKind(f.name, f.dir)) + "</span>" +
          '<span class="fsr-meta">' + (f.dir ? "—" : fmtSize(f.size)) + "</span>" +
          '<span class="fsr-meta">' + esc(f.owner) + "</span>" +
          '<span class="fsr-meta">' + new Date(f.mtime).toLocaleDateString() + "</span>" +
          '<span class="fsr-act">' + (f.dir ? "" :
            '<button class="btn btn-text" data-dl="' + esc(p) + '">下载</button>') +
          '<button class="btn btn-text danger" data-del="' + esc(p) + '">删除</button></span></div>';
      }).join("");
    }

    return '<div class="tool-bar"><div class="crumbs">' + crumbs + "</div>" +
      '<span class="grow"></span>' +
      '<label class="switch mini"><input type="checkbox" id="fs-hidden"' + (d.showHidden ? " checked" : "") +
        ' /><span>显示隐藏文件</span></label>' +
      '<button class="btn btn-text" data-mkdir="1">新建文件夹</button>' +
      (d.clip ? '<button class="btn btn-text" data-paste="1" title="粘贴 ' + esc(fsBase(d.clip.path)) + '">粘贴</button>' : '') +
      '<label class="btn btn-text upload-btn">上传<input type="file" id="fs-upload" multiple hidden /></label>' +
      '<button class="btn btn-text" data-fs="' + esc(d.fsPath) + '">刷新</button></div>' +
      '<div class="fs-list">' + body + "</div>";
  }

  /* ---------------- 文件操作与右键菜单 ---------------- */
  function fsBase(p) {
    var parts = String(p || "").split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "/";
  }

  function fsDir(p) {
    var parts = String(p || "").split("/").filter(Boolean);
    parts.pop();
    return "/" + parts.join("/");
  }

  function fsJoin(base, name) {
    return (base === "/" ? "" : base) + "/" + name;
  }

  var FS_CHUNK = 1280 * 1024;

  function fsBlobBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(",")[1] || ""); };
      fr.onerror = function () {
        var e = fr.error || {};
        reject(new Error("读取本地文件失败" + (e.name ? "（" + e.name + "）" : "")));
      };
      fr.onabort = function () { reject(new Error("读取本地文件被中止")); };
      fr.readAsDataURL(blob);
    });
  }

  var fsXferEl = null;

  function fsEta(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "";
    if (seconds < 60) return Math.ceil(seconds) + " 秒";
    var m = Math.floor(seconds / 60);
    var sec = Math.round(seconds % 60);
    return m + " 分" + (sec ? " " + sec + " 秒" : "");
  }

  function fsXferClose() {
    var el = fsXferEl;
    fsXferEl = null;
    document.body.classList.remove("xfer-open");
    if (!el) return;
    el.classList.remove("show");
    setTimeout(function () { el.remove(); }, 260);
  }

  function fsXferPlace(el) {
    var mobile = window.matchMedia("(max-width: 900px)").matches;
    var head = document.querySelector(".page-head");
    var tabs = document.getElementById("nav");
    var view = document.getElementById("view");
    el.classList.toggle("is-mobile", mobile);
    if (mobile) {
      if (view && view.parentNode) view.parentNode.insertBefore(el, view);
      else document.body.appendChild(el);
    } else if (head && tabs && tabs.parentNode === head) {
      head.insertBefore(el, tabs);
    } else {
      document.body.appendChild(el);
    }
  }

  function fsXferPanel(onCancel) {
    fsXferClose();
    var el = document.createElement("div");
    el.className = "xfer show";
    el.innerHTML =
      '<div class="xfer-main">' +
        '<span class="xfer-ico">\u2191</span>' +
        '<div class="xfer-info">' +
          '<div class="xfer-line1">' +
            '<b class="xfer-title">正在上传</b>' +
            '<span class="xfer-count"></span>' +
            '<span class="xfer-file"></span>' +
          '</div>' +
          '<div class="xfer-track"><div class="xfer-fill"></div></div>' +
          '<div class="xfer-line2">' +
            '<span class="xfer-bytes">0 B</span>' +
            '<span class="xfer-speed"></span>' +
            '<span class="xfer-eta"></span>' +
          '</div>' +
        '</div>' +
        '<div class="xfer-side">' +
          '<b class="xfer-pct">0%</b>' +
          '<button type="button" class="xfer-cancel">取消</button>' +
        '</div>' +
      '</div>';
    fsXferPlace(el);
    document.body.classList.add("xfer-open");
    fsXferEl = el;
    var icoEl = el.querySelector(".xfer-ico");
    var titleEl = el.querySelector(".xfer-title");
    var countEl = el.querySelector(".xfer-count");
    var fileEl = el.querySelector(".xfer-file");
    var fillEl = el.querySelector(".xfer-fill");
    var bytesEl = el.querySelector(".xfer-bytes");
    var pctEl = el.querySelector(".xfer-pct");
    var speedEl = el.querySelector(".xfer-speed");
    var etaEl = el.querySelector(".xfer-eta");
    var cancelEl = el.querySelector(".xfer-cancel");
    var api = {
      cancelled: false,
      finished: false,
      setFile: function (name, index, count) {
        if (api.finished) return;
        fileEl.textContent = name;
        countEl.textContent = count > 1 ? "第 " + index + " / " + count + " 个" : "";
      },
      update: function (sent, total, speed) {
        if (api.finished) return;
        var pct = total > 0 ? Math.min(100, sent * 100 / total) : 100;
        fillEl.style.width = pct.toFixed(2) + "%";
        bytesEl.textContent = fmtSize(sent) + (total > 0 ? " / " + fmtSize(total) : "");
        pctEl.textContent = pct.toFixed(1) + "%";
        speedEl.textContent = speed > 0 ? fmtSize(speed) + "/s" : "计算速度…";
        etaEl.textContent = speed > 0 && total > sent
          ? "剩余 " + fsEta((total - sent) / speed) : "";
      },
      finish: function (detail, kind) {
        api.finished = true;
        api.cancelled = false;
        if (kind === "error") {
          el.classList.add("is-error");
          icoEl.textContent = "!";
          titleEl.textContent = "上传失败";
        } else if (kind === "done") {
          el.classList.add("is-done");
          icoEl.textContent = "\u2713";
          titleEl.textContent = "上传完成";
        } else {
          el.classList.add("is-cancelled");
          icoEl.textContent = "\u00d7";
          titleEl.textContent = "已取消";
        }
        countEl.textContent = "";
        fileEl.textContent = detail;
        bytesEl.textContent = "";
        speedEl.textContent = "";
        etaEl.textContent = "";
        cancelEl.disabled = false;
        cancelEl.textContent = "关闭";
        var delay = kind === "error" ? 9000 : 4500;
        setTimeout(function () { if (fsXferEl === el) fsXferClose(); }, delay);
      }
    };
    cancelEl.addEventListener("click", function () {
      if (api.finished) { fsXferClose(); return; }
      if (api.cancelled) return;
      api.cancelled = true;
      cancelEl.disabled = true;
      cancelEl.textContent = "取消中…";
      if (onCancel) onCancel();
    });
    return api;
  }

  function fsUploadOne(file, dir, onProgress, token) {
    var path = fsJoin(dir, file.name);
    var chunks = Math.ceil(file.size / FS_CHUNK);
    var id = null;
    return API.uploadStart(path).then(function (r) {
      id = r.id;
      var seq = 0;
      var step = function () {
        if (token && token.cancelled) throw new Error("已取消");
        if (seq >= chunks) return API.uploadFinish(id);
        var start = seq * FS_CHUNK;
        var blob = file.slice(start, Math.min(start + FS_CHUNK, file.size));
        return fsBlobBase64(blob).then(function (b64) {
          if (token && token.cancelled) throw new Error("已取消");
          return API.uploadChunk(id, seq, b64).then(function () {
            seq += 1;
            if (onProgress) onProgress(Math.min(file.size, seq * FS_CHUNK));
            return step();
          });
        });
      };
      return step();
    }).catch(function (err) {
      if (id) { try { API.uploadAbort(id); } catch (e) {} }
      throw err;
    });
  }

  var fsUploadBusy = false;

  function fsUpload(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var d = toolData();
    if (!files.length) return;
    if (fsUploadBusy) { toast("已有上传任务在进行，请等它结束", "error"); return; }
    fsUploadBusy = true;
    var dir = d.fsPath;
    var token = { cancelled: false };
    var panel = fsXferPanel(function () { token.cancelled = true; });
    var totalBytes = files.reduce(function (n, f) { return n + f.size; }, 0);
    var failed = [];
    var done = 0;
    var doneBytes = 0;
    var idx = 0;
    var total = files.length;
    var speed = 0;
    var lastT = Date.now();
    var lastB = 0;

    function sample(sent) {
      var now = Date.now();
      if (now - lastT >= 400) {
        var inst = (sent - lastB) * 1000 / (now - lastT);
        if (inst >= 0) speed = speed ? speed * 0.7 + inst * 0.3 : inst;
        lastT = now;
        lastB = sent;
      }
    }

    function next() {
      if (token.cancelled || idx >= total) return Promise.resolve();
      var f = files[idx];
      idx += 1;
      panel.setFile(f.name, idx, total);
      return fsUploadOne(f, dir, function (sent) {
        var overall = doneBytes + sent;
        sample(overall);
        panel.update(overall, totalBytes, speed);
      }, token).then(function () {
        done += 1;
        doneBytes += f.size;
        panel.update(doneBytes, totalBytes, speed);
        return next();
      }).catch(function (err) {
        if (token.cancelled) return Promise.resolve();
        failed.push(f.name + "：" + ((err && err.message) || String(err)));
        return next();
      });
    }

    next().then(function () {
      fsUploadBusy = false;
      if (token.cancelled) {
        panel.finish("未完成的分片已经清理，不会留下半截文件", "");
      } else if (failed.length) {
        panel.finish("成功 " + done + " 个，失败 " + failed.length + " 个：" + failed[0], "error");
      } else {
        panel.finish("共 " + fmtSize(totalBytes) + "，已全部写入目标目录", "done");
      }
      fsReload();
    }).catch(function (err) {
      fsUploadBusy = false;
      panel.finish("上传中断：" + ((err && err.message) || err), "error");
    });
  }

  function fsReload() {
    var d = toolData();
    d.fs = null;
    rerenderTool();
    loadTool("files");
  }

  function fsDownload(path) {
    var a = document.createElement("a");
    a.href = "/api/download?path=" + encodeURIComponent(path);
    a.download = fsBase(path);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 1000);
  }

  function fsDelete(path) {
    confirmDialog("删除 " + fsBase(path) + "？", "目录会连同内容一起删除，不可恢复。", function () {
      API.fsAction("rm", path)
        .then(function () { toast("已删除 " + fsBase(path), "success"); fsReload(); })
        .catch(function (err) { toast("删除失败：" + err, "error"); });
    });
  }

  function fsNewFolder() {
    var d = toolData();
    var dir = prompt("新建文件夹名称");
    if (dir === null) return;
    dir = String(dir).trim();
    if (!dir || dir === "." || dir === ".." || dir.indexOf("/") >= 0) {
      toast("文件夹名不能为空，也不能包含 /", "error");
      return;
    }
    API.fsAction("mkdir", fsJoin(d.fsPath, dir))
      .then(function () { toast("已创建 " + dir, "success"); fsReload(); })
      .catch(function (err) { toast("创建失败：" + err, "error"); });
  }

  function fsRename(path) {
    var name = prompt("重命名为", fsBase(path));
    if (name === null) return;
    name = String(name).trim();
    if (!name || name === "." || name === ".." || name.indexOf("/") >= 0) {
      toast("名称不能为空，也不能包含 /", "error");
      return;
    }
    if (name === fsBase(path)) return;
    var dest = fsJoin(fsDir(path), name);
    API.fsAction("move", path, dest)
      .then(function () {
        var d = toolData();
        if (d.clip && d.clip.path === path) d.clip.path = dest;
        toast("已重命名", "success");
        fsReload();
      })
      .catch(function (err) { toast("重命名失败：" + err, "error"); });
  }

  function fsSetClip(mode, path, isDir) {
    var d = toolData();
    d.clip = { mode: mode, path: path, dir: !!isDir };
    toast((mode === "cut" ? "已剪切 " : "已复制 ") + fsBase(path) + "，到目标目录右键粘贴");
    rerenderTool();
  }

  function fsUniqueCopy(dirPath, name) {
    var d = toolData();
    var used = {};
    (d.fs || []).forEach(function (f) { used[f.name] = 1; });
    var dot = name.lastIndexOf(".");
    var stem = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot) : "";
    var cand = stem + " 副本" + ext;
    var n = 2;
    while (used[cand]) { cand = stem + " 副本 " + n + ext; n += 1; }
    return cand;
  }

  function fsPasteTo(dirPath) {
    var d = toolData();
    var clip = d.clip;
    if (!clip) { toast("剪贴板是空的", "error"); return; }
    if (clip.dir && dirPath.indexOf(clip.path.replace(/\/+$/, "") + "/") === 0) {
      toast("不能把目录粘贴到它自己里面", "error");
      return;
    }
    var dest;
    if (fsDir(clip.path) === dirPath) {
      if (clip.mode === "cut") { toast("剪切的内容请到其他目录粘贴", "error"); return; }
      dest = fsJoin(dirPath, fsUniqueCopy(dirPath, fsBase(clip.path)));
    } else {
      dest = fsJoin(dirPath, fsBase(clip.path));
    }
    var verb = clip.mode === "cut" ? "move" : "copy";
    API.fsAction(verb, clip.path, dest)
      .then(function () {
        if (clip.mode === "cut") d.clip = null;
        toast((clip.mode === "cut" ? "已移动" : "已复制") + "到 " + dirPath, "success");
        fsReload();
      })
      .catch(function (err) {
        toast((clip.mode === "cut" ? "移动" : "复制") + "失败：" + err, "error");
      });
  }

  var fsMenuEl = null;
  var fsPressTimer = null;
  var fsPressX = 0;
  var fsPressY = 0;
  var fsSuppressClick = 0;

  function fsCloseMenu() {
    if (fsMenuEl) { fsMenuEl.remove(); fsMenuEl = null; }
  }

  function fsShowMenu(items, x, y) {
    fsCloseMenu();
    var el = document.createElement("div");
    el.className = "menu fs-menu";
    items.forEach(function (it) {
      if (it.sep) {
        var sp = document.createElement("div");
        sp.className = "fs-menu-sep";
        el.appendChild(sp);
        return;
      }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "menu-item" + (it.danger ? " menu-danger" : "");
      b.textContent = it.label;
      b.disabled = !!it.disabled;
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        fsCloseMenu();
        it.action();
      });
      el.appendChild(b);
    });
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    var r = el.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) el.style.left = Math.max(8, window.innerWidth - r.width - 8) + "px";
    if (y + r.height > window.innerHeight - 8) el.style.top = Math.max(8, window.innerHeight - r.height - 8) + "px";
    fsMenuEl = el;
  }

  function fsRowMenu(path, isDir, x, y) {
    var d = toolData();
    var items = [];
    if (isDir) items.push({ label: "打开", action: function () { d.fsPath = path; fsReload(); } });
    else items.push({ label: "下载", action: function () { fsDownload(path); } });
    items.push({ sep: true });
    items.push({ label: "剪切", action: function () { fsSetClip("cut", path, isDir); } });
    items.push({ label: "复制", action: function () { fsSetClip("copy", path, isDir); } });
    if (isDir && d.clip) {
      items.push({ label: "粘贴到此处", action: function () { fsPasteTo(path); } });
    }
    items.push({ sep: true });
    items.push({ label: "重命名", action: function () { fsRename(path); } });
    items.push({ label: "删除", danger: true, action: function () { fsDelete(path); } });
    fsShowMenu(items, x, y);
  }

  function fsBackgroundMenu(x, y) {
    var d = toolData();
    fsShowMenu([
      { label: "粘贴", disabled: !d.clip, action: function () { fsPasteTo(d.fsPath); } },
      { sep: true },
      { label: "新建文件夹", action: fsNewFolder },
      { label: "上传文件", action: function () { var inp = document.getElementById("fs-upload"); if (inp) inp.click(); } },
      { label: "刷新", action: fsReload }
    ], x, y);
  }

  /* ---- 虚拟机 ---- */


  function rerenderTool() {
    var box = $("#tool-body");
    if (!box) return;
    box.innerHTML = renderToolBody();
    applyDynamicStyles(box);
    if (termVisible()) mountTerminal();
    else disposeTerm();
  }

  function loadTool(tab) {
    state.tool = tab;
    var d = toolData();
    if (tab === "logs") {
      return Promise.all([
        API.journal(150, d.unit || ""),
        d.units.length ? Promise.resolve(d.units) : API.journalUnits()
      ]).then(function (r) {
        d.logs = r[0]; d.units = r[1] || [];
        rerenderTool();
      });
    }
    if (tab === "files") {
      return API.listDir(d.fsPath).then(function (items) {
        d.fs = items; rerenderTool();
      }).catch(function (err) {
        d.fs = []; toast("读取目录失败：" + err, "error"); rerenderTool();
      });
    }
    return Promise.resolve();
  }

  /* ---------------- 视图调度 ---------------- */
  function render() {
    fsCloseMenu();
    if (fsPressTimer) { clearTimeout(fsPressTimer); fsPressTimer = null; }
    var meta = VIEW_META[state.view];
    $("#page-title").textContent = meta.title;
    var mobileTitle = $("#mobile-page-title");
    if (mobileTitle) mobileTitle.textContent = meta.title;
    $("#page-sub").textContent = meta.sub;
    $$(".tab[data-view]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === state.view);
    });

    var view = $("#view");
    renderGutter();
    refreshHwRail();

    if (state.view === "home") {
      view.innerHTML = renderHome();
      startLive();
    } else {
      stopLive();
      stopIfacePoll();
      if (state.view === "shares") view.innerHTML = renderShares();
      else if (state.view === "users") view.innerHTML = renderUsers();
      else if (state.view === "storage") { view.innerHTML = renderStorage(); hydrateSmart(); }
      else if (state.view === "network") { view.innerHTML = renderNetwork(); startIfacePoll(); }
      else if (state.view === "services") view.innerHTML = renderServices();
      else if (state.view === "updates") view.innerHTML = renderUpdates();
      else if (state.view === "credentials") view.innerHTML = renderCredentials();
      else if (state.view === "vms") view.innerHTML = renderVmsPage();
      else if (state.view === "tools") view.innerHTML = renderTools();
      else view.innerHTML = toolPage(state.view);
    }
    if (state.view === "tools") loadTool(state.tool || "logs");
    if (state.view === "logs" || state.view === "terminal" || state.view === "files") loadTool(state.view);
    applyDynamicStyles(view);
    if (state.view === "network") refreshNetInfo(state.netSel);
    if (termVisible()) mountTerminal();
    else disposeTerm();
  }

  function go(view) {
    if (!VIEW_META[view]) return;
    state.view = view;
    render();
    refresh();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function refresh() {
    var jobs = [];
    if (termVisible()) return Promise.resolve();  // 终端由 WebSocket 自己维持
    if (state.view === "home") {
      jobs.push(API.info().then(function (i) { state.info = i; }));
      jobs.push(API.listShares().then(function (s) { state.shares = s; }));
      jobs.push(API.listUsers().then(function (u) { state.users = u; }));
      // 应用探测和 QQ 日志都可能慢（podman / curl / 24h 日志），放到后台更新面板，
      // 不阻塞首页首屏；先到先渲染，晚到的直接替换对应面板。
      if (!state.webAt || Date.now() - state.webAt > 30000) once("apps", refreshAppsPanel);
      once("qq", pollQq);
    } else if (state.view === "shares") {
      jobs.push(API.listShares().then(function (s) { state.shares = s; }));
      jobs.push(API.smbGlobal().then(function (g) { state.smbGlobal = g; }).catch(function () {}));
    } else if (state.view === "users") {
      jobs.push(Promise.all([API.listUsers(), API.groupMap()]).then(function (r) {
        var groups = r[1] || {};
        state.users = (r[0] || []).map(function (u) {
          u.groupName = groups[u.gid] || String(u.gid);
          return u;
        });
      }));
      jobs.push(API.loginHistory().then(function (l) { state.logins = l; }));
    } else if (state.view === "credentials") {
      jobs.push(API.credentials().then(function (d) { state.credentials = d; }));
    } else if (state.view === "storage") {
      jobs.push(API.storage().then(function (d) { state.storage = d; }));
    } else if (state.view === "network") {
      jobs.push(API.network().then(function (n) { state.net = n; }));
    } else if (state.view === "vms") {
      jobs.push(API.vms().then(function (l) {
        state.vms = l;
        state.vmsError = null;
      }).catch(function (e) {
        state.vms = [];
        state.vmsError = vmErrText(e);
      }));
      jobs.push(API.vmEnv().then(function (env) {
        state.vmEnv = env;
      }).catch(function (e) {
        state.vmEnv = { available: false, error: vmErrText(e), commands: {} };
      }));
    } else if (state.view === "services") {
      jobs.push(API.services().then(function (l) { state.services = l; }));
    } else {
      jobs.push(API.aptSim().then(function (a) { state.apt = a; }));
      jobs.push(API.autoUpgradeGet().then(function (v) { state.autoUpgrade = v; }));
      jobs.push(API.portalInfo().then(function (i) { state.portal = i; }));
      jobs.push(API.containers().then(function (c) { state.containers = c; }));
      jobs.push(API.aptHistory().then(function (h) { state.aptLog = h; }));
    }
    return Promise.all(jobs).then(render).catch(function (e) {
      var msg = (e && e.message) ? e.message : String(e);
      toast("加载失败：" + msg, "error");
      var v = $("#view");
      if (v && state.view !== "home") {
        v.innerHTML = emptyBlock("加载失败", msg + (e && e.stack ? "\n" + String(e.stack).split("\n")[1] : ""));
      }
    });
  }

  /* ---------------- 对话框 ---------------- */
  function openDialog(html, onMount) {
    var dlg = document.createElement("dialog");
    dlg.className = "dialog";
    dlg.innerHTML = html;
    document.body.appendChild(dlg);
    dlg.addEventListener("close", function () { dlg.remove(); });
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg) dlg.close();
    });
    if (onMount) onMount(dlg);
    dlg.showModal();
    return dlg;
  }

  function shareDialog(existing) {
    var s = existing || { name: "", path: "", comment: "", readOnly: false, browseable: true, guestOk: false };
    var isNew = !existing;
    openDialog(
      '<form method="dialog" class="dialog-form">' +
        "<h2>" + (isNew ? "新建共享" : "编辑共享") + "</h2>" +
        '<label class="field"><span>共享名</span>' +
          '<input name="name" required pattern="[A-Za-z0-9._-]+" value="' + esc(s.name) + '"' +
          (isNew ? "" : " readonly") + ' placeholder="share" /></label>' +
        '<label class="field"><span>目录路径</span>' +
          '<input name="path" required value="' + esc(s.path) + '" placeholder="/home/user/share" /></label>' +
        '<label class="field"><span>备注</span>' +
          '<input name="comment" value="' + esc(s.comment) + '" placeholder="可选" /></label>' +
        '<div class="field-row">' +
          '<label class="switch"><input type="checkbox" name="readOnly"' + (s.readOnly ? " checked" : "") + ' /><span>只读</span></label>' +
          '<label class="switch"><input type="checkbox" name="browseable"' + (s.browseable ? " checked" : "") + ' /><span>可浏览</span></label>' +
          '<label class="switch"><input type="checkbox" name="guestOk"' + (s.guestOk ? " checked" : "") + ' /><span>允许访客</span></label>' +
          '<label class="switch"><input type="checkbox" name="macos"' + (s.macos ? " checked" : "") + ' /><span>macOS 优化</span></label>' +
        "</div>" +
        '<div class="dialog-actions">' +
          '<button type="button" class="btn btn-text" data-close>取消</button>' +
          '<button type="submit" class="btn btn-primary">' + (isNew ? "创建" : "保存") + "</button>" +
        "</div>" +
      "</form>",
      function (dlg) {
        $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
        $("form", dlg).addEventListener("submit", function (e) {
          e.preventDefault();
          var f = new FormData(e.target);
          var data = {
            name: String(f.get("name")).trim(),
            path: String(f.get("path")).trim(),
            comment: String(f.get("comment")).trim(),
            readOnly: f.get("readOnly") === "on",
            browseable: f.get("browseable") === "on",
            guestOk: f.get("guestOk") === "on",
            macos: f.get("macos") === "on",
            create: isNew
          };
          dlg.close();
          toast("正在保存…", "info");
          API.saveShare(data)
            .then(function () { toast("已保存 " + data.name, "success"); return refresh(); })
            .catch(function (err) { toast("保存失败：" + err, "error"); });
        });
      }
    );
  }

  function confirmDialog(title, body, onOk, okText, danger) {
    var okClass = danger === false ? "btn-primary" : "btn-danger";
    openDialog(
      '<div class="dialog-form"><h2>' + esc(title) + "</h2><p class=\"muted\">" + esc(body) + "</p>" +
      '<div class="dialog-actions"><button class="btn btn-text" data-close>取消</button>' +
      '<button class="btn ' + okClass + '" data-ok>' + esc(okText || "删除") + "</button></div></div>",
      function (dlg) {
        $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
        $("[data-ok]", dlg).addEventListener("click", function () { dlg.close(); onOk(); });
      }
    );
  }

  function groupsDialog() {
    API.listGroups().then(function (groups) {
      var rows = groups.map(function (g) {
        return '<li class="group-row"><div><b>' + esc(g.name) + "</b>" +
          '<span class="muted">GID ' + g.gid + " · " + g.members.length + " 名成员</span></div>" +
          '<button class="icon-btn sm danger" data-delgroup="' + esc(g.name) + '" title="删除组">' + icon("trash", 14) + "</button></li>";
      }).join("");
      openDialog(
        '<div class="dialog-form"><h2>管理组</h2>' +
        '<ul class="group-list">' + (rows || '<li class="muted">没有可管理的组</li>') + "</ul>" +
        '<form method="dialog" class="inline-form" id="new-group-form">' +
          '<input name="name" placeholder="新组名" pattern="[a-z_][a-z0-9_-]*" required />' +
          '<button class="btn btn-primary" type="submit">创建</button></form>' +
        '<div class="dialog-actions"><button class="btn btn-text" data-close>关闭</button></div></div>',
        function (dlg) {
          $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
          $("#new-group-form", dlg).addEventListener("submit", function (e) {
            e.preventDefault();
            var name = new FormData(e.target).get("name");
            API.createGroup(String(name).trim())
              .then(function () { toast("已创建组 " + name, "success"); dlg.close(); return refresh(); })
              .catch(function (err) { toast("创建失败：" + err, "error"); });
          });
          $$("[data-delgroup]", dlg).forEach(function (b) {
            b.addEventListener("click", function () {
              var name = b.dataset.delgroup;
              API.deleteGroup(name)
                .then(function () { toast("已删除组 " + name, "success"); dlg.close(); return refresh(); })
                .catch(function (err) { toast("删除失败：" + err, "error"); });
            });
          });
        }
      );
    });
  }

  function sshDialog(user) {
    API.sshKeys(user).then(function (keys) {
      var rows = keys.map(function (k, i) {
        var short = k.length > 56 ? k.slice(0, 56) + "…" : k;
        return '<li class="group-row"><code class="mono key-text">' + esc(short) + "</code>" +
          '<button class="icon-btn sm danger" data-delkey="' + i + '" title="删除">' + icon("trash", 14) + "</button></li>";
      }).join("");
      openDialog(
        '<div class="dialog-form"><h2>SSH 密钥 · ' + esc(user) + "</h2>" +
        '<ul class="group-list">' + (rows || '<li class="muted">还没有授权密钥</li>') + "</ul>" +
        '<form method="dialog" id="ssh-form">' +
          '<label class="field"><span>粘贴公钥（ssh-ed25519 AAAA… 或 ssh-rsa AAAA…）</span>' +
          '<textarea name="key" rows="3" required placeholder="ssh-ed25519 AAAA... user@host"></textarea></label>' +
          '<div class="dialog-actions"><button type="button" class="btn btn-text" data-close>取消</button>' +
          '<button class="btn btn-primary" type="submit">添加</button></div></form></div>',
        function (dlg) {
          $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
          $("#ssh-form", dlg).addEventListener("submit", function (e) {
            e.preventDefault();
            var key = String(new FormData(e.target).get("key")).trim();
            if (!/^ssh-|^ecdsa-|^sk-/.test(key)) { toast("格式不像公钥", "error"); return; }
            dlg.close();
            API.sshAdd(user, key)
              .then(function () { toast("已添加密钥", "success"); return refresh(); })
              .catch(function (err) { toast("添加失败：" + err, "error"); });
          });
          $$("[data-delkey]", dlg).forEach(function (b) {
            b.addEventListener("click", function () {
              dlg.close();
              API.sshRemove(user, Number(b.dataset.delkey))
                .then(function () { toast("已删除密钥", "success"); return refresh(); })
                .catch(function (err) { toast("删除失败：" + err, "error"); });
            });
          });
        }
      );
    });
  }

  function chageDialog(name) {
    openDialog(
      '<form method="dialog" class="dialog-form">' +
        "<h2>密码策略 · " + esc(name) + "</h2>" +
        '<label class="field"><span>密码有效期（天，-1 表示永不过期）</span>' +
        '<input name="days" type="number" min="-1" value="90" /></label>' +
        '<label class="switch"><input type="checkbox" name="force" /><span>下次登录强制修改密码</span></label>' +
        '<div class="dialog-actions"><button type="button" class="btn btn-text" data-close>取消</button>' +
        '<button type="submit" class="btn btn-primary">应用</button></div>' +
      "</form>",
      function (dlg) {
        $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
        $("form", dlg).addEventListener("submit", function (e) {
          e.preventDefault();
          var f = new FormData(e.target);
          dlg.close();
          API.chageSet(name, Number(f.get("days")), f.get("force") === "on")
            .then(function () { toast("密码策略已更新", "success"); })
            .catch(function (err) { toast("失败：" + err, "error"); });
        });
      }
    );
  }

  function netDialog(dev) {
    Promise.all([API.netDetail(dev), API.netConnections()]).then(function (r) {
      var d = r[0] || {};
      var conn = (r[1] || []).filter(function (c) { return c.device === dev; })[0];
      openDialog(
        '<form method="dialog" class="dialog-form">' +
          "<h2>网络配置 · " + esc(dev) + "</h2>" +
          (conn ? '<p class="muted">连接：' + esc(conn.name) + "</p>" : '<p class="muted">未找到对应连接</p>') +
          '<label class="field"><span>IPv4 地址</span><input name="addr" value="' + esc(d.addr || "") + '" placeholder="192.168.1.10" /></label>' +
          '<label class="field"><span>子网前缀</span><input name="prefix" type="number" min="1" max="32" value="' + esc(d.prefix || 24) + '" /></label>' +
          '<label class="field"><span>网关</span><input name="gw" value="' + esc(d.gw || "") + '" placeholder="192.168.1.1" /></label>' +
          '<label class="field"><span>DNS（逗号分隔）</span><input name="dns" value="' + esc(d.dns || "") + '" placeholder="223.5.5.5" /></label>' +
          '<div class="dialog-actions"><button type="button" class="btn btn-text" data-close>取消</button>' +
          '<button type="submit" class="btn btn-primary" ' + (conn ? "" : "disabled") + ">应用</button></div>" +
        "</form>",
        function (dlg) {
          $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
          $("form", dlg).addEventListener("submit", function (e) {
            e.preventDefault();
            var f = new FormData(e.target);
            dlg.close();
            toast("正在应用网络配置…", "info");
            API.netSetIpv4(conn.name, String(f.get("addr")).trim(), f.get("prefix"),
                           String(f.get("gw")).trim(), String(f.get("dns")).trim())
              .then(function () { toast("已应用", "success"); return refresh(); })
              .catch(function (err) { toast("失败：" + err, "error"); });
          });
        }
      );
    });
  }

  function userDialog() {
    openDialog(
      '<form method="dialog" class="dialog-form">' +
        "<h2>新建用户</h2>" +
        '<label class="field"><span>用户名</span><input name="name" required pattern="[a-z_][a-z0-9_-]*" placeholder="alice" /></label>' +
        '<label class="field"><span>全名（可选）</span><input name="gecos" placeholder="Alice" /></label>' +
        '<label class="field"><span>密码</span><input name="password" type="password" required minlength="6" /></label>' +
        '<label class="field"><span>登录 Shell</span><select name="shell">' +
          '<option value="/bin/bash">/bin/bash</option>' +
          '<option value="/bin/zsh">/bin/zsh</option>' +
          '<option value="/usr/sbin/nologin">/usr/sbin/nologin（仅共享）</option>' +
        "</select></label>" +
        '<label class="switch"><input type="checkbox" name="samba" checked /><span>同时创建 Samba 账号</span></label>' +
        '<div class="dialog-actions">' +
          '<button type="button" class="btn btn-text" data-close>取消</button>' +
          '<button type="submit" class="btn btn-primary">创建</button>' +
        "</div>" +
      "</form>",
      function (dlg) {
        $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
        $("form", dlg).addEventListener("submit", function (e) {
          e.preventDefault();
          var f = new FormData(e.target);
          var data = {
            name: String(f.get("name")).trim(),
            gecos: String(f.get("gecos")).trim(),
            password: String(f.get("password")),
            shell: String(f.get("shell")),
            samba: f.get("samba") === "on"
          };
          dlg.close();
          toast("正在创建…", "info");
          API.createUser(data)
            .then(function () { toast("已创建 " + data.name, "success"); return refresh(); })
            .catch(function (err) { toast("创建失败：" + err, "error"); });
        });
      }
    );
  }

  function passwordSelfDialog() {
    openDialog(
      '<form method="dialog" class="dialog-form">' +
        "<h2>修改登录密码</h2>" +
        '<p class="muted">修改的是系统账户密码（SSH / 登录用），Samba 密码请在「共享」页单独设置。</p>' +
        '<label class="field"><span>新密码</span><input name="pw" type="password" required minlength="6" /></label>' +
        '<label class="field"><span>确认密码</span><input name="pw2" type="password" required minlength="6" /></label>' +
        '<div class="dialog-actions"><button type="button" class="btn btn-text" data-close>取消</button>' +
        '<button type="submit" class="btn btn-primary">保存</button></div>' +
      "</form>",
      function (dlg) {
        $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
        $("form", dlg).addEventListener("submit", function (e) {
          e.preventDefault();
          var f = new FormData(e.target);
          if (f.get("pw") !== f.get("pw2")) { toast("两次密码不一致", "error"); return; }
          dlg.close();
          API.changePassword(state.user.name, String(f.get("pw")))
            .then(function () { toast("密码已更新", "success"); })
            .catch(function (err) { toast("修改失败：" + err, "error"); });
        });
      }
    );
  }

  function aboutDialog() {
    var s = state.info || {};
    openDialog(
      '<div class="dialog-form"><h2>NAS 控制台</h2>' +
      '<p class="muted">Debian NAS · 自建控制台</p>' +
      '<ul class="about-list">' +
        "<li><span>主机</span><b>" + esc(s.host || "—") + "</b></li>" +
        "<li><span>内核</span><b>" + esc(s.kernel || "—") + "</b></li>" +
        "<li><span>运行时长</span><b>" + fmtUptime(s.uptime || 0) + "</b></li>" +
        "<li><span>当前用户</span><b>" + esc(state.user ? state.user.name : "—") + "</b></li>" +
        "<li><span>界面版本</span><b>" + esc(window.__DEBNAS_BUILD || "dev") + "</b></li>" +
      "</ul>" +
      '<div class="dialog-actions"><button class="btn btn-primary" data-close>知道了</button></div></div>',
      function (dlg) {
        $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
      }
    );
  }

  function showRebootCurtain() {
    if ($("#reboot-curtain")) return;
    var node = document.createElement("div");
    node.id = "reboot-curtain";
    node.className = "reboot-curtain";
    node.innerHTML = '<div class="reboot-card">' +
      '<span class="reboot-icon">' + icon("power", 26) + "</span>" +
      "<b>系统正在重启</b>" +
      '<span class="reboot-text">连接即将断开，NAS 通常会在 1 分钟内恢复。稍后刷新此页面即可。</span>' +
      '<span class="reboot-dots"><i></i><i></i><i></i></span>' +
    "</div>";
    document.body.appendChild(node);
    requestAnimationFrame(function () { node.classList.add("show"); });
  }

  function rebootDialog() {
    confirmDialog("重启系统？",
      "所有连接会断开，正在运行的虚拟机、容器和传输任务都会中断。系统通常需要约 1 分钟恢复。",
      function () {
        API.reboot().then(function () {
          showRebootCurtain();
        }).catch(function (err) {
          toast("重启失败：" + err, "error");
        });
      }, "重启");
  }

  function passwordDialog(name) {
    openDialog(
      '<form method="dialog" class="dialog-form">' +
        "<h2>设置 Samba 密码</h2><p class=\"muted\">用户 " + esc(name) + "</p>" +
        '<label class="field"><span>新密码</span><input name="password" type="password" required minlength="6" /></label>' +
        '<label class="field"><span>确认密码</span><input name="confirm" type="password" required minlength="6" /></label>' +
        '<div class="dialog-actions">' +
          '<button type="button" class="btn btn-text" data-close>取消</button>' +
          '<button type="submit" class="btn btn-primary">保存</button>' +
        "</div>" +
      "</form>",
      function (dlg) {
        $("[data-close]", dlg).addEventListener("click", function () { dlg.close(); });
        $("form", dlg).addEventListener("submit", function (e) {
          e.preventDefault();
          var f = new FormData(e.target);
          if (f.get("password") !== f.get("confirm")) { toast("两次密码不一致", "error"); return; }
          dlg.close();
          API.setSambaPassword(name, String(f.get("password")))
            .then(function () { toast("已更新 " + name + " 的 Samba 密码", "success"); return refresh(); })
            .catch(function (err) { toast("设置失败：" + err, "error"); });
        });
      }
    );
  }

  /* ---------------- 移动端抽屉 ---------------- */
  function setNavOpen(open) {
    var nav = $("#nav"), btn = $("#nav-toggle"), back = $("#nav-backdrop");
    if (!nav || !btn || !back) return;
    var was = document.body.classList.contains("nav-open");
    var mobile = window.matchMedia("(max-width: 900px)").matches;
    document.body.classList.toggle("nav-open", !!open && mobile);
    btn.setAttribute("aria-expanded", open && mobile ? "true" : "false");
    btn.setAttribute("aria-label", open && mobile ? "关闭菜单" : "打开菜单");
    if (open && mobile) {
      back.hidden = false;
      requestAnimationFrame(function () { back.classList.add("show"); });
      var active = nav.querySelector(".tab.active");
      if (active) setTimeout(function () {
        try { active.focus({ preventScroll: true }); } catch (e) {}
      }, 180);
    } else {
      back.classList.remove("show");
      setTimeout(function () {
        if (!document.body.classList.contains("nav-open")) back.hidden = true;
      }, 260);
      if (was) {
        try { btn.focus({ preventScroll: true }); } catch (e) {}
      }
    }
  }

  function syncThemeUI() {
    if (!window.Theme || !Theme.current) return;
    var cur = Theme.current();
    var mode = cur.mode || "auto";
    var device = cur.deviceDark == null ? "未知" : (cur.deviceDark ? "深色" : "浅色");
    var hint = $("#menu-theme-hint");
    if (hint) {
      hint.textContent = mode === "auto"
        ? (cur.deviceDark == null ? "跟随系统" : "跟随系统 · " + device)
        : (mode === "dark" ? "手动 · 深色" : "手动 · 浅色");
    }
    $$("#theme-mode [data-mode]").forEach(function (b) {
      var on = b.dataset.mode === mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var dev = $("#theme-device");
    if (dev) {
      dev.textContent = cur.deviceDark == null
        ? "设备深色模式：未知（浏览器未提供）"
        : "设备深色模式：" + (cur.deviceDark ? "已开启" : "未开启");
    }
    if (window.__updateAccentUI) window.__updateAccentUI();
  }

  /* ---------------- 事件 ---------------- */
  function bindGlobal() {
    $("#nav").addEventListener("click", function (e) {
      var b = e.target.closest("[data-view]");
      if (b) { setNavOpen(false); go(b.dataset.view); }
    });

    var navToggle = $("#nav-toggle"), navClose = $("#nav-close"), navBack = $("#nav-backdrop");
    if (navToggle) navToggle.addEventListener("click", function () {
      setNavOpen(!document.body.classList.contains("nav-open"));
    });
    if (navClose) navClose.addEventListener("click", function () { setNavOpen(false); });
    if (navBack) navBack.addEventListener("click", function () { setNavOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setNavOpen(false);
    });

    // 文件页右键菜单
    document.addEventListener("contextmenu", function (e) {
      if (!e.target.closest || !e.target.closest("#tool-body")) return;
      if (state.tool !== "files") return;
      e.preventDefault();
      // 长按在部分浏览器会先触发 contextmenu，随后还有一次 click，别让它把菜单关掉
      if (e.pointerType === "touch" ||
          (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) {
        fsSuppressClick = Date.now() + 900;
      }
      var row = e.target.closest(".fsr");
      if (row && row.dataset.path) {
        fsRowMenu(row.dataset.path, row.dataset.dir === "1", e.clientX, e.clientY);
      } else {
        fsBackgroundMenu(e.clientX, e.clientY);
      }
    });
    document.addEventListener("click", function (e) {
      if (fsSuppressClick && Date.now() < fsSuppressClick) return;
      if (fsMenuEl && !fsMenuEl.contains(e.target)) fsCloseMenu();
    });

    // 手机：长按 550ms 弹同一套菜单
    document.addEventListener("touchstart", function (e) {
      if (state.tool !== "files" || e.touches.length !== 1) return;
      if (!e.target.closest || !e.target.closest("#tool-body")) return;
      var target = e.target;
      fsPressX = e.touches[0].clientX;
      fsPressY = e.touches[0].clientY;
      clearTimeout(fsPressTimer);
      fsPressTimer = setTimeout(function () {
        fsPressTimer = null;
        fsSuppressClick = Date.now() + 900;
        var row = target.closest(".fsr");
        if (row && row.dataset.path) {
          fsRowMenu(row.dataset.path, row.dataset.dir === "1", fsPressX, fsPressY);
        } else {
          fsBackgroundMenu(fsPressX, fsPressY);
        }
      }, 550);
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      if (!fsPressTimer) return;
      var t = e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - fsPressX) > 10 || Math.abs(t.clientY - fsPressY) > 10) {
        clearTimeout(fsPressTimer);
        fsPressTimer = null;
      }
    }, { passive: true });

    ["touchend", "touchcancel"].forEach(function (ev) {
      document.addEventListener(ev, function () {
        if (fsPressTimer) { clearTimeout(fsPressTimer); fsPressTimer = null; }
      }, { passive: true });
    });
    document.addEventListener("scroll", function () { fsCloseMenu(); }, true);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") fsCloseMenu();
    });
    var navMq = window.matchMedia("(max-width: 900px)");
    var navMqHandler = function (e) { if (!e.matches) setNavOpen(false); };
    if (navMq.addEventListener) navMq.addEventListener("change", navMqHandler);
    else if (navMq.addListener) navMq.addListener(navMqHandler);

    var xferMq = window.matchMedia("(max-width: 900px)");
    var xferMqHandler = function () { if (fsXferEl) fsXferPlace(fsXferEl); };
    if (xferMq.addEventListener) xferMq.addEventListener("change", xferMqHandler);
    else if (xferMq.addListener) xferMq.addListener(xferMqHandler);

    // 跨越 720px 时网络 / 共享 / 存储页要在桌面和手机两套布局之间切换
    var layoutMq = window.matchMedia("(max-width: 720px)");
    var layoutMqHandler = function () {
      if (state.view === "network" && !(state.net || []).length) return;
      if (state.view === "network" || state.view === "shares" || state.view === "storage") render();
    };
    if (layoutMq.addEventListener) layoutMq.addEventListener("change", layoutMqHandler);
    else if (layoutMq.addListener) layoutMq.addListener(layoutMqHandler);

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        ["realtimeTimer", "qqTimer", "appTimer", "mihomoTimer", "dsTimer", "hwTimer", "ifaceTimer"].forEach(function (k) {
          if (live[k]) { clearInterval(live[k]); live[k] = null; }
        });
        live.started = false;
        live.netLast = null;
      } else {
        if (state.view === "home") startLive();
        startQqPolling();
        startAppPolling();
        startMihomoPolling();
        startDeepseekPolling();
        startHwPolling();
        if (state.view === "network") startIfacePoll();
      }
    });

    document.addEventListener("click", function (e) {
      if (fsSuppressClick && Date.now() < fsSuppressClick) {
        var pressed = e.target.closest && e.target.closest("#tool-body .fsr");
        if (pressed) { fsSuppressClick = 0; return; }
      }
      var nav = e.target.closest("[data-nav]");
      if (nav) go(nav.dataset.nav);

      var edit = e.target.closest("[data-edit]");
      if (edit) {
        var s = state.shares.filter(function (x) { return x.name === edit.dataset.edit; })[0];
        if (s) shareDialog(s);
      }

      var del = e.target.closest("[data-del]");
      if (del) {
        var name = del.dataset.del;
        confirmDialog("删除共享 " + name + "？", "仅删除共享定义，不会删除磁盘上的文件。", function () {
          API.deleteShare(name)
            .then(function () { toast("已删除 " + name, "success"); return refresh(); })
            .catch(function (err) { toast("删除失败：" + err, "error"); });
        });
      }

      var pw = e.target.closest("[data-passwd]");
      if (pw) passwordDialog(pw.dataset.passwd);

      var du = e.target.closest("[data-deluser]");
      if (du) {
        var u = du.dataset.deluser;
        confirmDialog("删除用户 " + u + "？", "用户主目录会保留，Samba 账号一并移除。", function () {
          API.deleteUser(u)
            .then(function () { toast("已删除 " + u, "success"); return refresh(); })
            .catch(function (err) { toast("删除失败：" + err, "error"); });
        });
      }

      var svc = e.target.closest("[data-svc]");
      if (svc) {
        var unit = svc.dataset.svc, verb = svc.dataset.verb;
        confirmDialog((verb === "stop" ? "停止 " : "重启 ") + unit + "？", "操作会立即生效。", function () {
          API.serviceAction(unit, verb)
            .then(function () { toast("已" + (verb === "stop" ? "停止 " : "重启 ") + unit, "success"); return refresh(); })
            .catch(function (err) { toast("操作失败：" + err, "error"); });
        });
      }

      var open = e.target.closest("[data-open]");
      if (open) window.open(appUrl(open.dataset.open), "_blank", "noopener");

      if (e.target.id === "save-global") {
        var payload = {};
        $$("[data-key]").forEach(function (inp) { payload[inp.dataset.key] = inp.value.trim(); });
        toast("正在保存…", "info");
        API.smbGlobalSet(payload)
          .then(function () { toast("全局配置已更新", "success"); return refresh(); })
          .catch(function (err) { toast("保存失败：" + err, "error"); });
      }

      if (e.target.id === "export-conf") {
        API.exportConf().then(function (txt) {
          var blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "smb.conf";
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        }).catch(function (err) { toast("导出失败：" + err, "error"); });
      }

      if (e.target.id === "import-conf") {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".conf,.txt";
        input.addEventListener("change", function () {
          var f = input.files && input.files[0];
          if (!f) return;
          f.text().then(function (txt) {
            confirmDialog("导入并覆盖配置？", "会先备份现有 smb.conf，校验失败自动回滚。", function () {
              toast("正在导入…", "info");
              API.importConf(txt)
                .then(function () { toast("配置已导入", "success"); return refresh(); })
                .catch(function (err) { toast("导入失败：" + err, "error"); });
            });
          });
        });
        input.click();
      }

      if (e.target.id === "add-share") shareDialog(null);
      var chip = e.target.closest("[data-sel]");
      if (chip) {
        state.netSel = chip.dataset.sel;
        live.ifaceHist = [];
        render();
        return;
      }

      var revealBtn = e.target.closest("[data-reveal]");
      if (revealBtn) {
        var credRow = revealBtn.closest(".cred-row");
        var credVal = credRow && credRow.querySelector(".cred-value");
        if (credVal) credVal.textContent = revealBtn.dataset.reveal;
        revealBtn.remove();
        return;
      }

      var copyBtn = e.target.closest("[data-copy]");
      if (copyBtn) {
        copyText(copyBtn.dataset.copy);
        return;
      }

      if (e.target.id === "apt-check") { toast("正在检查…", "info"); refresh(); }

      if (e.target.id === "apt-upgrade") {
        var aptNow = state.apt || {};
        var extraNew = Number(aptNow.newCount) || 0;
        var extraRemove = Number(aptNow.removeCount) || 0;
        var upBtn = e.target;
        confirmDialog("升级所有可更新的软件包？",
          "将执行完整升级（full-upgrade）" +
          (extraNew ? "，会安装 " + extraNew + " 个新依赖（含内核）" : "") +
          (extraRemove ? "，并移除 " + extraRemove + " 个包" : "") +
          "。过程中请勿关闭页面，完成后可能需要重启。",
          function () {
            upBtn.disabled = true;
            upBtn.textContent = "升级中…";
            toast("正在升级，请稍候…", "info");
            API.aptUpgrade()
              .then(function (r) {
                if (r && r.ok === false) {
                  throw new Error(String(r.err || "apt 返回失败").slice(-300));
                }
                toast("升级完成", "success");
                return refresh();
              })
              .catch(function (err) {
                upBtn.disabled = false;
                upBtn.textContent = "立即升级";
                toast("升级失败：" + err, "error");
              });
          }, "开始升级", false);
      }

      if (e.target.id === "auto-toggle") {
        var on = e.target.checked;
        var cur = (state.autoUpgrade && state.autoUpgrade.schedule) || "daily";
        API.autoUpgradeSet(on, cur)
          .then(function () { toast(on ? "已开启自动升级" : "已关闭自动升级", "success"); return refresh(); })
          .catch(function (err) { toast("设置失败：" + err, "error"); e.target.checked = !on; });
      }

      if (e.target.id === "auto-freq") {
        var freq = e.target.value;
        var nowOn = !!(state.autoUpgrade && state.autoUpgrade.enabled);
        API.autoUpgradeSet(nowOn, freq)
          .then(function () { toast("更新周期已保存", "success"); return refresh(); })
          .catch(function (err) { toast("保存失败：" + err, "error"); });
      }

      if (e.target.id === "redeploy") {
        confirmDialog("重新部署控制台？", "会用源码目录覆盖当前安装，并刷新页面资源版本。", function () {
          toast("正在部署…", "info");
          API.redeployPortal(state.portal.source)
            .then(function () { toast("已开始后台部署，约 5 秒后服务重启，稍后刷新页面", "success"); })
            .catch(function (err) { toast("部署失败：" + err, "error"); });
        });
      }

      var pullBtn = e.target.closest("[data-pull]");
      if (pullBtn) {
        var img = pullBtn.dataset.pull;
        toast("正在拉取 " + img + "…", "info");
        API.pullImage(img)
          .then(function () { toast("已拉取，容器重建后生效", "success"); })
          .catch(function (err) { toast("拉取失败：" + err, "error"); });
        return;
      }

      var vncBtn = e.target.closest("[data-vnc]");
      if (vncBtn) {
        var cname = vncBtn.dataset.vnc;
        toast("正在读取口令…", "info");
        API.vncPassword((state.user || {}).name, cname).then(function (r) {
          if (r && r.password) {
            toast("noVNC 口令：" + r.password, "success");
            if (navigator.clipboard) navigator.clipboard.writeText(r.password).catch(function () {});
          } else {
            toast("读取失败：" + ((r && r.error) || "未知错误"), "error");
          }
        }).catch(function (err) { toast("读取失败：" + err, "error"); });
        return;
      }

      if (e.target.id === "manage-groups") groupsDialog();

      var sshBtn = e.target.closest("[data-ssh]");
      if (sshBtn) sshDialog(sshBtn.dataset.ssh);

      var link = e.target.closest("[data-link]");
      if (link) {
        var dev = link.dataset.link;
        confirmDialog("改变接口 " + dev + " 状态？", "停用后该接口会断开，可能影响当前访问。", function () {
          API.netLink(dev, link.textContent.indexOf("停用") === 0 ? "disconnect" : "connect")
            .then(function () { toast("操作已下发", "success"); return refresh(); })
            .catch(function (err) { toast("失败：" + err, "error"); });
        });
      }

      var ch = e.target.closest("[data-chage]");
      if (ch) chageDialog(ch.dataset.chage);

      var net = e.target.closest("[data-net]");
      if (net) netDialog(net.dataset.net);

      if (e.target.id === "menu-passwd") passwordSelfDialog();
      if (e.target.id === "menu-about") aboutDialog();

      if (e.target.id === "add-user") userDialog();
    });

    /* ---- 工具页交互 ---- */
    document.addEventListener("click", function (e) {
      var tb = e.target.closest("[data-tool]");
      if (tb) {
        state.tool = tb.dataset.tool;
        var v = $("#view");
        if (v) v.innerHTML = renderTools();
        loadTool(state.tool);
        if (state.tool === "terminal") mountTerminal();
        else disposeTerm();
        return;
      }

      var fsb = e.target.closest("[data-fs]");
      if (fsb) {
        var d = toolData();
        d.fsPath = fsb.dataset.fs || "/";
        d.fs = null;
        rerenderTool();
        loadTool("files");
        return;
      }

      var dl = e.target.closest("[data-dl], [data-file]");
      if (dl) {
        fsDownload(dl.dataset.dl || dl.dataset.file);
        return;
      }

      var del = e.target.closest("[data-del]");
      if (del) {
        fsDelete(del.dataset.del);
        return;
      }

      if (e.target.closest("[data-mkdir]")) {
        fsNewFolder();
        return;
      }

      if (e.target.closest("[data-paste]")) {
        fsPasteTo(toolData().fsPath);
        return;
      }

      var detail = e.target.closest("[data-vm-detail]");
      if (detail) {
        vmDetailDialog(detail.dataset.vmDetail);
        return;
      }

      var consoleBtn = e.target.closest("[data-vm-console]");
      if (consoleBtn) {
        vmConsoleOpen(consoleBtn.dataset.vmConsole);
        return;
      }

      var vmBtn = e.target.closest("[data-vm]");
      if (vmBtn) {
        var vmName = vmBtn.dataset.vmName, vmAct = vmBtn.dataset.vm;
        var runVmAction = function () {
          vmBtn.disabled = true;
          API.vmAction(vmName, vmAct)
            .then(function () {
              toast("指令已发送", "success");
              setTimeout(refresh, 1200);
              setTimeout(refresh, 4000);
            })
            .catch(function (err) {
              vmBtn.disabled = false;
              toast("操作失败：" + err, "error");
            });
        };
        if (vmAct === "start" || vmAct === "resume") {
          runVmAction();
          return;
        }
        confirmDialog((vmAct === "shutdown" ? "关闭 " : vmAct === "reboot" ? "重启 " : "强制停止 ") +
          vmName + "？", "", runVmAction);
        return;
      }

      if (e.target.id === "vm-create" || e.target.id === "vm-create-empty") {
        vmCreateDialog();
        return;
      }
      if (e.target.id === "vms-refresh") {
        state.vms = null;
        state.vmsError = null;
        state.vmEnv = null;
        render();
        refresh();
        return;
      }
      if (e.target.id === "log-refresh") {
        var d3 = toolData();
        d3.logs = null;
        rerenderTool();
        loadTool("logs");
      }
    });

    document.addEventListener("input", function (e) {
      if (e.target.id !== "log-q") return;
      var d = toolData();
      d.query = e.target.value;
      rerenderTool();
      var box = $("#log-q");
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    });

    document.addEventListener("change", function (e) {
      var autoName = e.target.getAttribute && e.target.getAttribute("data-vm-auto");
      if (autoName && API.vmAutostart) {
        API.vmAutostart(autoName, e.target.checked)
          .then(function () { toast(e.target.checked ? "已设为开机自启" : "已取消开机自启", "success"); })
          .catch(function (err) { e.target.checked = !e.target.checked; toast("设置失败：" + err, "error"); });
        return;
      }
      if (e.target.id === "fs-hidden") {
        var df = toolData();
        df.showHidden = e.target.checked;
        rerenderTool();
        return;
      }
      if (e.target.id === "log-unit") {
        var d = toolData();
        d.unit = e.target.value;
        d.logs = null;
        loadTool("logs");
        return;
      }
      if (e.target.id === "fs-upload") {
        var picked = Array.prototype.slice.call(e.target.files || []);
        e.target.value = "";
        fsUpload(picked);
      }
    });

    document.addEventListener("click", function (e) {
      if (e.target.closest("#term-clear")) {
        if (termX.term) termX.term.clear();
        return;
      }
      if (e.target.closest("#term-reconnect")) {
        connectTerm();
      }
    });

    document.addEventListener("click", function (e) {
      if (e.target.closest("#mh-fold")) {
        setMihomoOpen(!mihomoOpen());
        renderMihomoDock(true);
        return;
      }
      var mb = e.target.closest("[data-mh-mode]");
      if (mb) {
        mihomoSetMode(mb.getAttribute("data-mh-mode"));
        return;
      }
      if (e.target.closest("#mh-test")) { mihomoTest(); return; }
      if (e.target.closest("#mh-import")) {
        var file = $("#mh-import-file");
        if (file) file.click();
        return;
      }
      if (e.target.closest("#mh-stop")) {
        confirmDialog("关闭 mihomo？", "代理会立即中断，已建立的连接也会断开。",
          function () { mihomoService("stop"); });
        return;
      }
      if (e.target.closest("#mh-restart")) { mihomoService("restart"); return; }
      if (e.target.closest("#mh-start")) { mihomoService("start"); return; }
      if (e.target.closest("#mh-retry")) { pollMihomo(); return; }
      if (e.target.closest("#ds-fold")) {
        setDeepseekOpen(!deepseekOpen());
        renderDeepseekDock(true);
        return;
      }
      if (e.target.closest("#ds-refresh")) { pollDeepseek(true); return; }
    });

    document.addEventListener("change", function (e) {
      if (e.target.id === "mh-node") mihomoSelect(e.target.value);
      if (e.target.id === "mh-import-file") {
        mihomoImportFile(e.target.files && e.target.files[0]);
        e.target.value = "";
      }
    });

    /* 头像菜单：深浅色 / 主题色 / 注销 */
    var userMenu = $("#user-menu");
    var rebootBtn = $("#reboot-btn");
    if (rebootBtn) rebootBtn.addEventListener("click", rebootDialog);

    // 左侧消息栏贴着底部时跟随新消息；用户往上翻后不强行拉回
    var gutterFeed = $("#gutter-feed");
    if (gutterFeed) {
      gutterFeed.addEventListener("scroll", function () {
        var near = gutterFeed.scrollHeight - gutterFeed.scrollTop - gutterFeed.clientHeight < 48;
        gutterFeed.dataset.follow = near ? "1" : "0";
      }, { passive: true });
      gutterFeed.addEventListener("load", function (e) {
        if (e.target && e.target.tagName === "IMG" && gutterFeed.dataset.follow !== "0") {
          gutterFeed.scrollTop = gutterFeed.scrollHeight;
        }
      }, true);
    }

    $("#avatar").addEventListener("click", function (e) {
      e.stopPropagation();
      userMenu.hidden = !userMenu.hidden;
    });


    document.addEventListener("click", function (e) {
      if (!userMenu.hidden && !e.target.closest(".user-wrap")) userMenu.hidden = true;
    });

    $("#menu-theme").addEventListener("click", function () {
      Theme.toggleDark();
      syncThemeUI();
      userMenu.hidden = true;
    });

    $("#menu-logout").addEventListener("click", function () {
      userMenu.hidden = true;
      if (window.cockpit && cockpit.logout) cockpit.logout();
    });

    /* 主题色选择 */
    var pop = $("#accent-popover");
    $("#menu-accent").addEventListener("click", function (e) {
      e.stopPropagation();
      userMenu.hidden = true;
      pop.hidden = false;
      syncThemeUI();
      if (window.__updateAccentUI) window.__updateAccentUI();
      var r = $("#avatar").getBoundingClientRect();
      pop.style.top = (r.bottom + 8) + "px";
      pop.style.left = Math.max(12, r.right - 236) + "px";
    });


    document.addEventListener("click", function (e) {
      if (!pop.hidden && !pop.contains(e.target) && e.target.id !== "menu-accent") pop.hidden = true;
    });

    var sw = $("#swatches");
    sw.innerHTML = ACCENTS.map(function (c, i) {
      return '<button class="swatch sw-' + i + '" data-color="' + c + '" title="' + c + '">' +
        '<span class="swatch-check">✓</span></button>';
    }).join("");

    console.log("[DebNAS] accent swatches:", ACCENTS.length, ACCENTS.join(" "));

    function updateAccentUI() {
      var cur = (Theme.current().accent || "").toLowerCase();
      $$(".swatch").forEach(function (b) {
        b.classList.toggle("sel", b.dataset.color.toLowerCase() === cur);
      });
      var dot = $("#accent-dot"), hex = $("#accent-hex");
      if (dot) dot.style.background = cur;
      if (hex) hex.textContent = cur;
      var input = $("#accent-custom");
      if (input && /^#[0-9a-f]{6}$/.test(cur)) input.value = cur;
    }
    window.__updateAccentUI = updateAccentUI;
    updateAccentUI();

    var modeBox = $("#theme-mode");
    if (modeBox) modeBox.addEventListener("click", function (e) {
      var b = e.target.closest("[data-mode]");
      if (!b) return;
      Theme.setMode(b.dataset.mode);
      syncThemeUI();
    });
    window.addEventListener("debnas-theme-changed", syncThemeUI);
    syncThemeUI();
    sw.addEventListener("click", function (e) {
      var b = e.target.closest("[data-color]");
      if (!b) return;
      Theme.setAccent(b.dataset.color);
      if (window.__updateAccentUI) window.__updateAccentUI();
    });
    $("#accent-custom").addEventListener("input", function (e) {
      Theme.setAccent(e.target.value);
      if (window.__updateAccentUI) window.__updateAccentUI();
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    try {
      var qv = new URLSearchParams(location.search).get("view");
      if (qv) state.view = qv;
    } catch (e) { /* 忽略 */ }

    // 嵌入 Cockpit 时标记，背景交给外壳，避免接缝
    try { if (window.parent && window.parent !== window) document.body.classList.add("in-cockpit"); } catch (e) {}
    var ready = (window.cockpit && cockpit.transport && cockpit.transport.wait)
      ? new Promise(function (res) { cockpit.transport.wait(res); })
      : Promise.resolve();

    ready.then(function () { return cockpit.user(); }).then(function (user) {
      state.user = user;
      $("#avatar").textContent = (user.name || "?").charAt(0).toUpperCase();
      return ThemeStore.init(user.home);
    }).then(function (prefs) {
      Theme.hydrate(prefs);
      $("#accent-custom").value = Theme.current().accent;
      window.__setTool = function (t) {
        state.tool = t;
        if (state.view === "tools") {
          var v = $("#view");
          if (v) v.innerHTML = renderTools();
          loadTool(t);
        }
      };

      bindGlobal();
      render();
      startQqPolling();
      startAppPolling();
      startMihomoPolling();
      startDeepseekPolling();
      startHwPolling();
      return refresh();
    }).catch(function (err) {
      $("#view").innerHTML = emptyBlock("加载失败", String(err));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
