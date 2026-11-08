/* 主题引擎：从一颗种子色推导 M3 风格的角色色，写入 CSS 变量。
   每个用户的选择存在 ~/.config/debnas-portal/prefs.json，跨浏览器生效。 */
(function () {
  "use strict";

  var DEFAULTS = { accent: "#5b4bc4", dark: null, mode: "auto" };
  var darkMq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var watchedSystem = false;

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return { r: 91, g: 75, b: 196 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    return "hsl(" + h.toFixed(1) + " " + Math.max(0, Math.min(100, s)).toFixed(1) + "% " +
      Math.max(0, Math.min(100, l)).toFixed(1) + "%)";
  }

  function luminance(hex) {
    var c = hexToRgb(hex);
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  /* ---- 色彩空间：sRGB ⇄ CIELAB，用于按 M3 的 tone（L*）取样 ---- */
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function rgbToLab(r, g, b) {
    var R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    var X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    var Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
    var Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    var f = function (t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116); };
    var fx = f(X), fy = f(Y), fz = f(Z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  /* 返回 {rgb, inGamut} */
  function labToRgb(L, a, b) {
    var fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    var inv = function (t) { var t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
    var X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
    var R = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
    var G = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
    var B = X * 0.0557 + Y * -0.2040 + Z * 1.0570;
    var enc = function (c) {
      var v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      return v * 255;
    };
    var r = enc(R), g = enc(G), b2 = enc(B);
    var inGamut = r >= -0.5 && r <= 255.5 && g >= -0.5 && g <= 255.5 && b2 >= -0.5 && b2 <= 255.5;
    var clamp = function (v) { return Math.max(0, Math.min(255, Math.round(v))); };
    return { rgb: [clamp(r), clamp(g), clamp(b2)], inGamut: inGamut };
  }

  /* 在给定色相下取某个 tone，色度超出色域就逐步降低 */
  function tone(hue, chroma, t) {
    var c = Math.max(0, chroma);
    for (var i = 0; i < 24; i++) {
      var a = c * Math.cos(hue), b = c * Math.sin(hue);
      var out = labToRgb(t, a, b);
      if (out.inGamut) return "rgb(" + out.rgb.join(" ") + ")";
      c *= 0.92;
    }
    var g = labToRgb(t, 0, 0).rgb;
    return "rgb(" + g.join(" ") + ")";
  }

  /* M3 角色色：tone 取标准值 */
  function palette(seed, dark) {
    var c = hexToRgb(seed);
    var lab = rgbToLab(c.r, c.g, c.b);
    var hue = Math.atan2(lab.b, lab.a);
    var chroma = Math.min(48, Math.hypot(lab.a, lab.b));
    var p = {};

    if (!dark) {
      p.primary = tone(hue, chroma, 40);
      p.onPrimary = tone(hue, 4, 100);
      p.primaryContainer = tone(hue, chroma * 0.55, 90);
      p.onPrimaryContainer = tone(hue, chroma * 0.4, 10);
      p.secondaryContainer = tone(hue, chroma * 0.22, 90);
      p.onSecondaryContainer = tone(hue, chroma * 0.18, 10);
      p.tertiary = tone(hue + 1.05, chroma * 0.8, 40);
      p.tertiaryContainer = tone(hue + 1.05, chroma * 0.45, 90);
      p.surface = tone(hue, chroma * 0.08, 98);
      p.surfaceContainer = tone(hue, chroma * 0.1, 94);
      p.surfaceHigh = tone(hue, chroma * 0.12, 90);
      p.card = "#ffffff";
      p.onSurface = tone(hue, chroma * 0.12, 10);
      p.onSurfaceVariant = tone(hue, chroma * 0.1, 30);
      p.outline = tone(hue, chroma * 0.1, 50);
      p.outlineVariant = tone(hue, chroma * 0.12, 80);
      p.error = "#b3261e";
      p.errorContainer = "#f9dedc";
      p.onErrorContainer = "#410e0b";
      p.success = "#146c2e";
      p.successContainer = "#d3f2d8";
      p.shadow = "0 1px 2px rgba(20,18,26,.10), 0 2px 8px 2px rgba(20,18,26,.07)";
      p.shadowLg = "0 8px 24px 4px rgba(20,18,26,.10), 0 2px 6px rgba(20,18,26,.08)";
      p.glow = 0.14;
    } else {
      p.primary = tone(hue, chroma * 0.75, 80);
      p.onPrimary = tone(hue, chroma * 0.4, 20);
      p.primaryContainer = tone(hue, chroma * 0.55, 30);
      p.onPrimaryContainer = tone(hue, chroma * 0.4, 90);
      p.secondaryContainer = tone(hue, chroma * 0.25, 30);
      p.onSecondaryContainer = tone(hue, chroma * 0.2, 90);
      p.tertiary = tone(hue + 1.05, chroma * 0.7, 80);
      p.tertiaryContainer = tone(hue + 1.05, chroma * 0.4, 30);
      p.surface = tone(hue, chroma * 0.1, 6);
      p.surfaceContainer = tone(hue, chroma * 0.1, 12);
      p.surfaceHigh = tone(hue, chroma * 0.1, 17);
      p.card = tone(hue, chroma * 0.1, 10);
      p.onSurface = tone(hue, chroma * 0.1, 90);
      p.onSurfaceVariant = tone(hue, chroma * 0.1, 80);
      p.outline = tone(hue, chroma * 0.1, 60);
      p.outlineVariant = tone(hue, chroma * 0.1, 30);
      p.error = "#ffb4ab";
      p.errorContainer = "#93000a";
      p.onErrorContainer = "#ffdad6";
      p.success = "#8edb9d";
      p.successContainer = "#1c4a28";
      p.shadow = "0 1px 2px rgba(0,0,0,.5), 0 2px 8px 2px rgba(0,0,0,.35)";
      p.shadowLg = "0 10px 30px 6px rgba(0,0,0,.5)";
      p.glow = 0.22;
    }
    return p;
  }

  /* 把种子色同步到 Cockpit 外壳（同源 iframe 可以直接改父文档） */
  function syncShell(pal) {
    try {
      if (!window.parent || window.parent === window) return;
      var root = window.parent.document.documentElement;
      root.style.setProperty("--debnas-p", pal.primary);
      root.style.setProperty("--debnas-p-container", pal.primaryContainer);
      root.style.setProperty("--debnas-on-p-container", pal.onPrimaryContainer);
    } catch (e) { /* 跨域时忽略 */ }
  }

  function apply(pal, dark) {
    var root = document.documentElement;
    var map = {
      "--p": pal.primary, "--on-p": pal.onPrimary,
      "--p-container": pal.primaryContainer, "--on-p-container": pal.onPrimaryContainer,
      "--s-container": pal.secondaryContainer, "--on-s-container": pal.onSecondaryContainer,
      "--t": pal.tertiary, "--t-container": pal.tertiaryContainer,
      "--surface": pal.surface, "--surface-container": pal.surfaceContainer,
      "--surface-high": pal.surfaceHigh, "--card": pal.card,
      "--on-surface": pal.onSurface, "--on-surface-variant": pal.onSurfaceVariant,
      "--outline": pal.outline, "--outline-variant": pal.outlineVariant,
      "--error": pal.error, "--error-container": pal.errorContainer,
      "--on-error-container": pal.onErrorContainer,
      "--success": pal.success, "--success-container": pal.successContainer,
      "--shadow": pal.shadow, "--shadow-lg": pal.shadowLg,
      "--glow": String(pal.glow)
    };
    Object.keys(map).forEach(function (k) { root.style.setProperty(k, map[k]); });
    root.classList.toggle("dark", !!dark);
    root.style.colorScheme = dark ? "dark" : "light";
    syncShell(pal);
    try {
      localStorage.setItem("debnas-theme", JSON.stringify({
        accent: state.accent, dark: !!dark, p: pal
      }));
    } catch (e) { /* 隐私模式等情况下忽略 */ }
  }

  var state = { accent: DEFAULTS.accent, dark: null, mode: "auto", deviceDark: null };

  /* ---- 与 Cockpit 外壳的暗色状态同步 ----
     外壳：localStorage["shell:style"] = "dark" | "light"，并给 <html> 加 pf-v6-theme-dark */
  function shellPref() {
    try { return window.localStorage.getItem("shell:style"); } catch (e) { return null; }
  }

  function isShellDark() {
    try {
      if (window.parent && window.parent !== window) {
        var doc = window.parent.document;
        if (doc && doc.documentElement.classList.contains("pf-v6-theme-dark")) return true;
      }
    } catch (e) { /* 跨域或不可访问时忽略 */ }
    var p = shellPref();
    if (p === "dark") return true;
    if (p === "light") return false;
    return null;
  }

  function pushShell(dark) {
    var style = dark ? "dark" : "light";
    try { window.localStorage.setItem("shell:style", style); } catch (e) {}
    try {
      if (window.parent && window.parent !== window) {
        var doc = window.parent.document;
        if (doc) doc.documentElement.classList.toggle("pf-v6-theme-dark", dark);
        window.parent.dispatchEvent(new CustomEvent("cockpit-style", { detail: { style: style } }));
      }
    } catch (e) {}
  }

  function detectDark() {
    return !!(darkMq && darkMq.matches);
  }

  function embedded() {
    try { return !!(window.parent && window.parent !== window); } catch (e) { return false; }
  }

  function resolveAuto() {
    // 独立打开时跟设备 prefers-color-scheme；只有嵌入 Cockpit 才优先跟外壳。
    // 不能读 shell:style：那是 pushShell 自己写的，会把自动模式反锁在旧值上。
    if (embedded()) {
      var shell = isShellDark();
      if (typeof shell === "boolean") return shell;
    }
    return detectDark();
  }

  function resolveDark(mode) {
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return resolveAuto();
  }

  function notify() {
    try { window.dispatchEvent(new CustomEvent("debnas-theme-changed")); } catch (e) {}
  }

  var Theme = {
    init: function () { return Promise.resolve(); },
    current: function () {
      return { accent: state.accent, dark: state.dark, mode: state.mode,
               deviceDark: state.deviceDark };
    },
    setAccent: function (hex, persist) {
      state.accent = hex;
      apply(palette(hex, state.dark), state.dark);
      if (persist !== false) Store.save();
      notify();
    },
    setMode: function (mode, persist) {
      if (mode !== "auto" && mode !== "light" && mode !== "dark") return;
      state.mode = mode;
      state.dark = resolveDark(mode);
      apply(palette(state.accent, state.dark), state.dark);
      pushShell(state.dark);
      if (persist !== false) Store.save();
      notify();
    },
    toggleDark: function () {
      Theme.setMode(state.dark ? "light" : "dark");
    },
    hydrate: function (prefs) {
      state.accent = (prefs && prefs.accent) || DEFAULTS.accent;
      state.deviceDark = darkMq ? darkMq.matches : null;
      if (prefs && (prefs.mode === "auto" || prefs.mode === "light" || prefs.mode === "dark")) {
        state.mode = prefs.mode;
      } else {
        // 默认跟随系统；旧的 dark 只作为历史字段保留，不再覆盖默认策略
        state.mode = "auto";
      }
      state.dark = resolveDark(state.mode);
      apply(palette(state.accent, state.dark), state.dark);
      pushShell(state.dark);
      Theme.followShell();
      Theme.watchSystem();
      notify();
    },

    /* 设备深色模式变化：auto 模式下实时跟随 */
    watchSystem: function () {
      if (!darkMq || watchedSystem) return;
      watchedSystem = true;
      var onChange = function (e) {
        state.deviceDark = typeof e.matches === "boolean" ? e.matches : detectDark();
        if (state.mode === "auto") {
          state.dark = resolveAuto();
          apply(palette(state.accent, state.dark), state.dark);
          pushShell(state.dark);
        }
        notify();
      };
      if (darkMq.addEventListener) darkMq.addEventListener("change", onChange);
      else if (darkMq.addListener) darkMq.addListener(onChange);
    },

    /* 外壳切换主题时（另一个 window 写 localStorage），跟着变 */
    followShell: function () {
      window.addEventListener("storage", function (e) {
        if (e.key !== "shell:style" || state.mode !== "auto" || !embedded()) return;
        state.dark = resolveAuto();
        apply(palette(state.accent, state.dark), state.dark);
        notify();
      });
    },
  };

  /* 偏好持久化：写用户 home，读不到就用默认 */
  var Store = {
    path: null,
    init: function (home) {
      Store.path = (home || "/root") + "/.config/debnas-portal/prefs.json";
      return cockpit.spawn(["cat", Store.path], { err: "out" })
        .then(function (txt) { return JSON.parse(txt); })
        .catch(function () { return {}; });
    },
    save: function () {
      if (!Store.path) return;
      var payload = JSON.stringify({ accent: state.accent, dark: state.dark, mode: state.mode });
      var cmd = "mkdir -p \"$(dirname '" + Store.path + "')\" && printf '%s' '" +
        payload.replace(/'/g, "'\\''") + "' > '" + Store.path + "'";
      cockpit.spawn(["sh", "-c", cmd], { err: "out" }).catch(function () {});
    }
  };

  window.Theme = Theme;
  window.ThemeStore = Store;
  window.m3Palette = palette;
})();
