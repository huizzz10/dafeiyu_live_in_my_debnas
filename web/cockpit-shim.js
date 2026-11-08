/* 独立运行时替代 cockpit.js 的最小实现 */
(function () {
  "use strict";

  var user = null;
  var booting = null;

  function boot() {
    // 外壳和页面都会问一次，共用同一个请求，避免重复 /api/me
    if (booting) return booting;
    booting = fetch("/api/me").then(function (r) {
      if (r.status === 401) { location.href = "/"; throw new Error("未登录"); }
      return r.json();
    }).then(function (d) {
      user = { name: d.user, home: d.home || ("/home/" + d.user), full: d.user, id: 0,
               host: d.host || "" };
      try { sessionStorage.setItem("debnas-csrf", d.csrf); } catch (e) {}
      document.documentElement.classList.add("standalone");
      return user;
    });
    return booting;
  }

  window.cockpit = {
    user: function () {
      return boot();
    },
    transport: {
      wait: function (cb) {
        boot().then(function () { cb(); }, function () {});
      }
    },
    logout: function () {
      return fetch("/api/logout", { method: "POST" }).then(function () {
        location.href = "/";
      });
    },
    spawn: function (cmd, opts) {
      var argv = Array.isArray(cmd) ? cmd.map(String) : String(cmd).split(" ");
      var wantRoot = !!(opts && opts.superuser);
      var onData = null;
      var p = fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debnas-CSRF": (function () {
          try { return sessionStorage.getItem("debnas-csrf") || ""; } catch (e) { return ""; }
        })() },
        body: JSON.stringify({ argv: argv, root: wantRoot })
      }).then(function (r) {
        if (r.status === 401) { location.href = "/"; throw new Error("未登录"); }
        return r.json().then(function (d) {
          if (d.error) throw new Error(d.error);
          var out = d.out || "";
          if (onData) { onData(out); }
          return out;
        });
      });
      p.stream = function (cb) { onData = cb; return p; };
      p.input = function () { return p; };
      return p;
    }
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
