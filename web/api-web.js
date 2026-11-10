/* 独立后端下的数据层：用 /api/rpc 替代 cockpit.spawn */
(function () {
  "use strict";

  var smartCache = null;
  var smartCacheAt = 0;

  function csrf() {
    try { return sessionStorage.getItem("debnas-csrf") || ""; } catch (e) { return ""; }
  }

  function rpc(method, params) {
    return fetch("/api/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debnas-CSRF": csrf() },
      body: JSON.stringify({ method: method, params: params || {} })
    }).then(function (r) {
      if (r.status === 401) { location.href = "/"; throw new Error("未登录"); }
      return r.json().then(function (d) {
        if (!r.ok || d.error) throw new Error(d.error || "请求失败");
        var data = d.data;
        /* 命令型 RPC 把执行结果包在 data 里：ok:false 必须当成失败，
           否则 systemctl / samba / fs_action 出错时界面会误报成功。 */
        if (data && data.ok === false) {
          throw new Error(String(data.error || data.err || "操作失败").trim());
        }
        return data;
      });
    });
  }

  function info() {
    return rpc("info").then(function (d) {
      return {
        host: d.host, kernel: d.kernel, uptime: d.uptime,
        memTotal: d.memTotal, memAvailable: d.memAvailable,
        swapTotal: d.swapTotal, swapFree: d.swapFree,
        diskTotal: d.diskTotal, diskUsed: d.diskUsed, diskFree: d.diskFree,
        samba: d.samba ? "active" : "inactive"
      };
    });
  }

  window.API = {
    info: info,
    listShares: function () {
      return rpc("shares").then(function (d) {
        return (d.shares || []).map(function (s) {
          return {
            name: s.name, path: s.path, comment: s.comment,
            readOnly: !!s.readonly, guest: !!s.guest, browseable: s.browseable !== false
          };
        });
      });
    },
    listUsers: function () {
      return rpc("users").then(function (d) {
        var gidName = {};
        (d.groups || []).forEach(function (g) { gidName[g.gid] = g.name; });
        return (d.users || []).map(function (u) {
          return {
            name: u.name, uid: u.uid, gid: u.gid, home: u.home, shell: u.shell,
            groupName: gidName[u.gid] || String(u.gid), isRoot: u.uid === 0
          };
        });
      });
    },
    groupMap: function () {
      return rpc("users").then(function (d) {
        var m = {};
        (d.groups || []).forEach(function (g) { m[g.gid] = g.name; });
        return m;
      });
    },
    listGroups: function () {
      return rpc("users").then(function (d) {
        return (d.groups || []).filter(function (g) {
          return g.gid >= 1000 && ["root", "sudo", "users", "nogroup"].indexOf(g.name) < 0;
        });
      });
    },
    storage: function () {
      return rpc("storage").then(function (d) {
        return { disks: d.blockdevices || [], usage: d.usage || {} };
      });
    },
    appStatus: function () {
      return rpc("apps").then(function (list) {
        var out = {};
        (list || []).forEach(function (a) { out[a.port] = a.code; });
        return out;
      });
    },
    appServices: function () { return rpc("apps").then(function (l) { return l; }); },
    qqFeed: function () { return rpc("qq"); },
    credentials: function () { return rpc("credentials"); },
    mihomo: function () { return rpc("mihomo"); },
    deepseek: function (force) { return rpc("deepseek", force ? { force: true } : {}); },
    mihomoAction: function (p) { return rpc("mihomo_action", p || {}); },
    mihomoImport: function (data) { return rpc("mihomo_import", { data: data }); },
    powerSample: function () { return rpc("power"); },
    netSample: function () { return rpc("net"); },
    realtime: function () { return rpc("realtime"); },
    hwBasic: function () {
      return rpc("hw").then(function (d) {
        return { cpu: d.cpu, cores: d.cores, memTotal: d.memTotal, memAvailable: d.memAvailable };
      });
    },
    hwTemps: function () { return rpc("hw").then(function (d) { return d.temps; }); },
    cpuTimes: function () { return rpc("cputimes"); },
    services: function () { return rpc("services_list"); },
    serviceAction: function (name, action) { return rpc("service_action", { name: name, action: action }); },
    journal: function (lines, unit) {
      return rpc("journal", { lines: lines, unit: unit }).then(function (r) {
        return (r.out || "").split("\n").filter(Boolean).map(function (line) {
          try { return JSON.parse(line); } catch (e) { return null; }
        }).filter(Boolean).map(function (e) {
          var msg = e.MESSAGE;
          if (msg && typeof msg === "object" && msg.data) {
            try { msg = atob(msg.data); } catch (x) { msg = ""; }
          }
          return {
            t: Number(e.__REALTIME_TIMESTAMP || 0) / 1e6,
            unit: e._SYSTEMD_UNIT || e.SYSLOG_IDENTIFIER || "system",
            pri: Number(e.PRIORITY || 6),
            msg: String(msg == null ? "" : msg)
          };
        }).filter(function (e) { return e.msg; });
      });
    },
    journalUnits: function () {
      return rpc("services_list").then(function (l) {
        return (l || []).map(function (x) { return x.name; });
      });
    },
    listDir: function (path) {
      return rpc("listdir", { path: path }).then(function (r) {
        var items = [];
        (r.out || "").split("\n").forEach(function (line) {
          if (!line || /^total\s/.test(line)) return;
          var m = /^([dlrwxsStT-]{10})\s+\d+\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
          if (!m) return;
          var name = m[6].replace(/^.*?\d{10}\s+/, "");
          if (name === "." || name === "..") return;
          items.push({ name: name, dir: m[1][0] === "d", mode: m[1], owner: m[2],
                       group: m[3], size: Number(m[4]), mtime: Number(m[5]) * 1000 });
        });
        items.sort(function (a, b) {
          if (a.dir !== b.dir) return a.dir ? -1 : 1;
          return a.name.localeCompare(b.name, "zh");
        });
        return items;
      });
    },
    vms: function () { return rpc("vms"); },
    vmEnv: function () { return rpc("vm_env"); },
    vmAction: function (name, action) { return rpc("vm_action", { name: name, action: action }); },
    vmAutostart: function (name, on) { return rpc("vm_autostart", { name: name, on: !!on }); },
    vmIsos: function () { return rpc("vm_isos"); },
    vmCreate: function (spec) { return rpc("vm_create", spec || {}); },
    vmDelete: function (name, removeDisks) {
      return rpc("vm_delete", { name: name, removeDisks: removeDisks !== false });
    },
    vmConsole: function (name) { return rpc("vm_console", { name: name }); },
    vmSnapshots: function (name) { return rpc("vm_snapshots", { name: name }); },
    vmSnapshotCreate: function (name, snapshot, description) {
      return rpc("vm_snapshot_create", { name: name, snapshot: snapshot || "", description: description || "" });
    },
    vmSnapshotDelete: function (name, snapshot) {
      return rpc("vm_snapshot_delete", { name: name, snapshot: snapshot });
    },
    vmSnapshotRevert: function (name, snapshot) {
      return rpc("vm_snapshot_revert", { name: name, snapshot: snapshot });
    },
    vmConfig: function (name, vcpu, memory) {
      return rpc("vm_config", { name: name, vcpu: vcpu, memory: memory });
    },
    vmDiskResize: function (name, target, size) {
      return rpc("vm_disk_resize", { name: name, target: target, size: size });
    },
    vmCdrom: function (name, iso) { return rpc("vm_cdrom", { name: name, iso: iso || "" }); },
    cockpitApps: function () { return rpc("cockpit_apps"); },
    aptSim: function () { return rpc("apt_sim"); },
    aptUpgrade: function () { return rpc("apt_upgrade"); },
    autoUpgradeGet: function () { return rpc("auto_get"); },
    autoUpgradeSet: function (on, schedule) { return rpc("auto_set", { enabled: !!on, schedule: schedule || "daily" }); },
    portalInfo: function () { return rpc("portal_info"); },
    containers: function () { return rpc("containers"); },
    pullImage: function (image) { return rpc("pull", { image: image }); },
    aptHistory: function () { return rpc("apt_history"); },
    vncPassword: function (user) { return rpc("vnc", { user: user || "" }).then(function (r) { return JSON.parse(r.out || "{}"); }); },

    /* 共享与 Samba 全局配置 */
    saveShare: function (p) { return rpc("samba", { verb: "save", payload: p }); },
    deleteShare: function (name) { return rpc("samba", { verb: "delete", payload: { name: name } }); },
    smbGlobal: function () {
      return rpc("samba", { verb: "global-get" }).then(function (d) {
        return (d && d.global) || {};
      });
    },
    smbGlobalSet: function (p) { return rpc("samba", { verb: "global-set", payload: p || {} }); },
    exportConf: function () { return rpc("smb_export").then(function (d) { return d.text; }); },
    importConf: function (text) { return rpc("smb_import", { text: text }); },

    /* 用户、组与密码 */
    createUser: function (data) { return rpc("user_create", data || {}); },
    deleteUser: function (name) { return rpc("user_delete", { name: name }); },
    setSystemPassword: function (name, pw) { return rpc("user_password", { name: name, password: pw }); },
    setSambaPassword: function (name, pw) { return rpc("samba_password", { name: name, password: pw }); },
    changePassword: function (user, pw) { return rpc("user_password", { name: user, password: pw }); },
    chageSet: function (name, days, force) {
      return rpc("chage_set", { name: name, days: Number(days), force: !!force });
    },
    createGroup: function (name) { return rpc("group_create", { name: name }); },
    deleteGroup: function (name) { return rpc("group_delete", { name: name }); },

    /* SSH 授权密钥 */
    sshKeys: function (user) {
      return rpc("ssh_keys", { user: user }).then(function (d) { return d.keys || []; });
    },
    sshAdd: function (user, key) { return rpc("ssh_add", { user: user, key: key }); },
    sshRemove: function (user, index) { return rpc("ssh_remove", { user: user, index: Number(index) }); },

    /* 网络（NetworkManager） */
    netConnections: function () { return rpc("net_conns"); },
    netDetail: function (iface) { return rpc("net_detail", { iface: iface || "" }); },
    netSetIpv4: function (conn, addr, prefix, gw, dns) {
      return rpc("net_set4", { conn: conn, addr: addr, prefix: Number(prefix), gw: gw || "", dns: dns || "" });
    },
    netLink: function (dev, action) { return rpc("net_link", { dev: dev, action: action }); },

    /* 文件与容器 */
    fileBase64: function (path) {
      return rpc("file_read", { path: path }).then(function (d) { return d.b64; });
    },
    uploadStart: function (path) { return rpc("upload_start", { path: path }); },
    uploadChunk: function (id, seq, data) {
      return rpc("upload_chunk", { id: id, seq: seq, data: data });
    },
    uploadFinish: function (id) { return rpc("upload_finish", { id: id }); },
    uploadAbort: function (id) { return rpc("upload_abort", { id: id }); },
    /* 重新部署（后台排队，服务会短暂重启） */
    redeployPortal: function (source) { return rpc("portal_redeploy", { source: source || "" }); },

    smartHealth: function (dev) {
      var now = Date.now();
      var pending = (smartCache && now - smartCacheAt < 15000)
        ? Promise.resolve(smartCache)
        : rpc("smart").then(function (list) {
            smartCache = list || [];
            smartCacheAt = Date.now();
            return smartCache;
          });
      return pending.then(function (list) {
        var hit = (list || []).filter(function (d) { return d.name === dev; })[0];
        if (!hit) return { status: "unknown" };
        var status = hit.health === "PASSED" ? "ok"
          : hit.health === "FAILED" ? "bad"
          : hit.health === "UNAVAILABLE" ? "unavailable" : "unknown";
        return { status: status, temp: hit.temp, hours: hit.hours,
                 message: hit.message || "", model: hit.model || "" };
      });
    },
    loginHistory: function () { return rpc("login_history"); },
    connTraffic: function () { return rpc("conn_traffic"); },
    network: function () { return rpc("netifaces"); },
    networkInfo: function (iface) { return rpc("netinfo", { iface: iface || "" }); },
    netIfaces: function () { return rpc("netifaces"); },
    reboot: function () { return rpc("reboot"); },
    fsAction: function (verb, path, target) { return rpc("fs_action", { verb: verb, path: path, target: target }); },
    writeBase64: function (path, data) { return rpc("fs_action", { verb: "write", path: path, data: data }); }
  };
})();
