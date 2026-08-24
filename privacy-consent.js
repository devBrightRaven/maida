(function () {
  "use strict";

  const measurementId = "G-ZJKKRRTFXW";
  const preferenceKey = "br_ga4_consent_v1";
  const cookieMaxAge = 31536000;
  const scriptSelector = 'script[data-br-ga4="true"]';
  const translations = {
    en: {
      title: "Optional analytics",
      body: "Bright Raven uses Google Analytics only if you allow it. Google may receive the page URL, referrer, approximate location, and browser or device information. No analytics request is made before your choice.",
      allow: "Allow analytics",
      decline: "No thanks",
      manage: "Privacy choices",
      close: "Close privacy choices",
      policy: "Read the privacy policy",
      currentGranted: "Current choice: analytics allowed.",
      currentDenied: "Current choice: analytics declined.",
      savedGranted: "Analytics allowed. You can change this choice at any time.",
      savedDenied: "Analytics declined. No analytics request will be made."
    },
    ja: {
      title: "任意のアクセス解析",
      body: "Bright Raven は、許可された場合にのみ Google Analytics を使用します。Google にページ URL、参照元、おおよその地域、ブラウザーや端末の情報が送られる場合があります。選択前にアクセス解析の通信は行いません。",
      allow: "アクセス解析を許可",
      decline: "許可しない",
      manage: "プライバシー設定",
      close: "プライバシー設定を閉じる",
      policy: "プライバシーポリシーを読む",
      currentGranted: "現在の選択：アクセス解析を許可しています。",
      currentDenied: "現在の選択：アクセス解析を許可していません。",
      savedGranted: "アクセス解析を許可しました。この選択はいつでも変更できます。",
      savedDenied: "アクセス解析を許可しませんでした。アクセス解析の通信は行いません。"
    },
    zhHans: {
      title: "可选的网站分析",
      body: "只有在你允许后，Bright Raven 才会使用 Google Analytics。Google 可能会收到页面网址、来源页面、大致位置、浏览器或设备信息。你选择之前不会发送任何网站分析请求。",
      allow: "允许网站分析",
      decline: "不用，谢谢",
      manage: "隐私选项",
      close: "关闭隐私选项",
      policy: "阅读隐私政策",
      currentGranted: "目前选择：已允许网站分析。",
      currentDenied: "目前选择：已拒绝网站分析。",
      savedGranted: "已允许网站分析。你可以随时修改这个选择。",
      savedDenied: "已拒绝网站分析。不会发送网站分析请求。"
    },
    zhHant: {
      title: "選用的網站分析",
      body: "只有在你允許後，Bright Raven 才會使用 Google Analytics。Google 可能會收到頁面網址、來源頁面、大致位置、瀏覽器或裝置資訊。你選擇之前不會送出任何網站分析請求。",
      allow: "允許網站分析",
      decline: "不用，謝謝",
      manage: "隱私選項",
      close: "關閉隱私選項",
      policy: "閱讀隱私政策",
      currentGranted: "目前選擇：已允許網站分析。",
      currentDenied: "目前選擇：已拒絕網站分析。",
      savedGranted: "已允許網站分析。你可以隨時修改這個選擇。",
      savedDenied: "已拒絕網站分析。不會送出網站分析請求。"
    }
  };

  function languageKey() {
    const lang = (document.documentElement.lang || "en").toLowerCase();
    if (lang.startsWith("ja")) return "ja";
    if (lang.includes("hans") || lang === "zh-cn") return "zhHans";
    if (lang.includes("hant") || lang === "zh-tw" || lang === "zh-hk") return "zhHant";
    return "en";
  }

  function usesSharedDomain() {
    return location.hostname === "brightraven.world" || location.hostname.endsWith(".brightraven.world");
  }

  function clearHostOnlyCookie() {
    if (!location.hostname.endsWith(".brightraven.world")) return;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${preferenceKey}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  }

  function readCookie() {
    clearHostOnlyCookie();
    const entry = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${preferenceKey}=`));
    const value = entry?.slice(preferenceKey.length + 1);
    return value === "granted" || value === "denied" ? value : null;
  }

  function writeCookie(status) {
    const domain = usesSharedDomain() ? "; Domain=.brightraven.world" : "";
    const secure = location.protocol === "https:" ? "; Secure" : "";
    clearHostOnlyCookie();
    document.cookie = `${preferenceKey}=${status}; Max-Age=${cookieMaxAge}; Path=/; SameSite=Lax${domain}${secure}`;
    return readCookie() === status;
  }

  function clearLocalPreference() {
    try {
      localStorage.removeItem(preferenceKey);
    } catch (_error) {}
  }

  function readPreference() {
    clearLocalPreference();
    const cookie = readCookie();
    if (cookie) writeCookie(cookie);
    return cookie;
  }

  function writePreference(status) {
    writeCookie(status);
    clearLocalPreference();
  }

  function deleteAnalyticsCookies() {
    const names = document.cookie
      .split(";")
      .map((entry) => entry.split("=")[0].trim())
      .filter((name) => name.startsWith("_ga"));
    const hostParts = location.hostname.split(".");
    const baseDomain = hostParts.length >= 2 ? `.${hostParts.slice(-2).join(".")}` : "";

    for (const name of names) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      if (baseDomain) {
        document.cookie = `${name}=; Max-Age=0; path=/; domain=${baseDomain}; SameSite=Lax`;
      }
    }
  }

  function disableAnalytics() {
    window[`ga-disable-${measurementId}`] = true;
    document.querySelectorAll(scriptSelector).forEach((script) => script.remove());
    if (Array.isArray(window.dataLayer)) window.dataLayer.length = 0;
    window.gtag = function () {};
    deleteAnalyticsCookies();
  }

  function enableAnalytics() {
    if (document.querySelector(scriptSelector)) return;

    window[`ga-disable-${measurementId}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: false });
    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: location.href,
      page_path: `${location.pathname}${location.search}`
    });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.dataset.brGa4 = "true";
    document.head.append(script);
  }

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #br-consent-root, #br-consent-root * { box-sizing: border-box; }
      #br-consent-root {
        --brc-bg: #ffffff;
        --brc-surface: #f4f4f2;
        --brc-text: #202020;
        --brc-muted: #525252;
        --brc-border: #3f3f3f;
        --brc-focus: #005fcc;
        position: relative;
        z-index: 2147483000;
        color: var(--brc-text);
        font-family: Arial, "Helvetica Neue", "PingFang TC", "Noto Sans TC", "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif;
        letter-spacing: 0;
      }
      #br-consent-root [hidden] { display: none !important; }
      .br-consent-panel {
        position: fixed;
        right: max(0.75rem, env(safe-area-inset-right));
        bottom: max(0.75rem, env(safe-area-inset-bottom));
        left: max(0.75rem, env(safe-area-inset-left));
        width: min(52rem, calc(100% - 1.5rem));
        max-width: calc(100% - 1.5rem);
        margin-inline: auto;
        padding: 1rem;
        border: 2px solid var(--brc-border);
        border-radius: 6px;
        background: var(--brc-bg);
        box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.24);
        overflow-wrap: anywhere;
      }
      .br-consent-heading-row {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 1rem;
      }
      .br-consent-title {
        margin: 0;
        color: var(--brc-text);
        font: 700 1.125rem/1.35 Arial, "Helvetica Neue", "PingFang TC", "Noto Sans TC", "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif;
        letter-spacing: 0;
      }
      .br-consent-copy, .br-consent-current {
        max-width: 72ch;
        margin: 0.65rem 0 0;
        color: var(--brc-text);
        font-size: 1rem;
        line-height: 1.55;
      }
      .br-consent-current { color: var(--brc-muted); }
      .br-consent-policy {
        display: inline-block;
        min-height: 2.75rem;
        margin-top: 0.35rem;
        padding-block: 0.65rem;
        color: #064f91;
        text-decoration: underline;
        text-underline-offset: 0.18em;
      }
      .br-consent-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 0.75rem;
      }
      .br-consent-button, .br-consent-close {
        min-height: 2.75rem;
        border: 2px solid var(--brc-border);
        border-radius: 4px;
        color: var(--brc-text);
        background: var(--brc-surface);
        font: 700 1rem/1.2 Arial, "Helvetica Neue", "PingFang TC", "Noto Sans TC", "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif;
        letter-spacing: 0;
        cursor: pointer;
      }
      .br-consent-button {
        flex: 1 1 12rem;
        padding: 0.65rem 1rem;
      }
      .br-consent-button:hover, .br-consent-close:hover {
        color: var(--brc-bg);
        background: var(--brc-text);
      }
      .br-consent-button:focus-visible, .br-consent-manage:focus-visible, .br-consent-close:focus-visible, .br-consent-policy:focus-visible {
        outline: 3px solid var(--brc-focus);
        outline-offset: 3px;
      }
      .br-consent-close {
        flex: 0 0 2.75rem;
        width: 2.75rem;
        padding: 0;
        font-size: 1.35rem;
      }
      .br-consent-manage {
        display: inline-flex;
        align-items: center;
        min-height: 2.75rem;
        margin: 0.25rem;
        padding: 0.5rem;
        border: 0;
        color: var(--brc-muted);
        background: transparent;
        font: 700 0.9rem/1.2 Arial, "Helvetica Neue", "PingFang TC", "Noto Sans TC", "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif;
        text-decoration: underline;
        text-underline-offset: 0.18em;
        cursor: pointer;
      }
      .br-consent-manage:hover {
        color: var(--brc-text);
      }
      .br-consent-status {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      @media (prefers-color-scheme: dark) {
        #br-consent-root {
          --brc-bg: #191919;
          --brc-surface: #292929;
          --brc-text: #f4f4f2;
          --brc-muted: #c9c9c5;
          --brc-border: #d8d8d4;
          --brc-focus: #74b9ff;
        }
        .br-consent-policy { color: #9dcbff; }
      }
      @media (prefers-contrast: more) {
        #br-consent-root {
          --brc-bg: #ffffff;
          --brc-surface: #ffffff;
          --brc-text: #000000;
          --brc-muted: #202020;
          --brc-border: #000000;
          --brc-focus: #005fcc;
        }
        .br-consent-policy { color: #003f80; }
      }
      @media (prefers-contrast: more) and (prefers-color-scheme: dark) {
        #br-consent-root {
          --brc-bg: #000000;
          --brc-surface: #000000;
          --brc-text: #ffffff;
          --brc-muted: #eeeeee;
          --brc-border: #ffffff;
          --brc-focus: #70b7ff;
        }
        .br-consent-policy { color: #a8d4ff; }
      }
      @media (prefers-reduced-motion: reduce) {
        #br-consent-root *, #br-consent-root *::before, #br-consent-root *::after {
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
          animation-duration: 0.01ms !important;
        }
      }
    `;
    document.head.append(style);
  }

  function buildInterface() {
    let text = translations[languageKey()];
    const root = document.createElement("div");
    root.id = "br-consent-root";

    const panel = document.createElement("section");
    panel.className = "br-consent-panel";
    panel.setAttribute("aria-labelledby", "br-consent-title");
    panel.innerHTML = `
      <div class="br-consent-heading-row">
        <h2 class="br-consent-title" id="br-consent-title" tabindex="-1"></h2>
        <button class="br-consent-close" type="button" hidden><span aria-hidden="true">&times;</span></button>
      </div>
      <p class="br-consent-copy"></p>
      <p class="br-consent-current" hidden></p>
      <a class="br-consent-policy" href="https://brightraven.world/privacy.html"></a>
      <div class="br-consent-actions">
        <button class="br-consent-button" type="button" data-consent="denied"></button>
        <button class="br-consent-button" type="button" data-consent="granted"></button>
      </div>
    `;

    const manage = document.createElement("button");
    manage.className = "br-consent-manage";
    manage.type = "button";

    const status = document.createElement("div");
    status.className = "br-consent-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");

    const title = panel.querySelector(".br-consent-title");
    const copy = panel.querySelector(".br-consent-copy");
    const current = panel.querySelector(".br-consent-current");
    const policy = panel.querySelector(".br-consent-policy");
    const close = panel.querySelector(".br-consent-close");
    const decline = panel.querySelector('[data-consent="denied"]');
    const allow = panel.querySelector('[data-consent="granted"]');

    function updateText() {
      text = translations[languageKey()];
      title.textContent = text.title;
      copy.textContent = text.body;
      policy.textContent = text.policy;
      close.setAttribute("aria-label", text.close);
      decline.textContent = text.decline;
      allow.textContent = text.allow;
      manage.textContent = text.manage;
      const preference = readPreference();
      current.textContent = preference === "granted" ? text.currentGranted : text.currentDenied;
    }

    updateText();
    new MutationObserver(updateText).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"]
    });

    function showPanel(fromManage) {
      const preference = readPreference();
      panel.hidden = false;
      manage.hidden = true;
      close.hidden = !fromManage;
      current.hidden = !preference;
      current.textContent = preference === "granted" ? text.currentGranted : text.currentDenied;
      if (fromManage) title.focus();
    }

    function hidePanel(returnFocus) {
      panel.hidden = true;
      manage.hidden = false;
      if (returnFocus) manage.focus();
    }

    function choose(next) {
      writePreference(next);
      if (next === "granted") enableAnalytics();
      else disableAnalytics();
      status.textContent = next === "granted" ? text.savedGranted : text.savedDenied;
      hidePanel(false);
    }

    decline.addEventListener("click", () => choose("denied"));
    allow.addEventListener("click", () => choose("granted"));
    manage.addEventListener("click", () => showPanel(true));
    close.addEventListener("click", () => hidePanel(true));
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !close.hidden) {
        event.preventDefault();
        hidePanel(true);
      }
    });

    root.append(panel, manage, status);
    (document.querySelector("footer") || document.body).append(root);

    const preference = readPreference();
    if (preference === "granted") {
      enableAnalytics();
      hidePanel(false);
    } else if (preference === "denied") {
      disableAnalytics();
      hidePanel(false);
    } else {
      disableAnalytics();
      showPanel(false);
    }
  }

  function start() {
    addStyles();
    buildInterface();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
