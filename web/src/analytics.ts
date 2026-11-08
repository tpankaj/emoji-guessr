/**
 * Cloudflare Web Analytics: cookie-free visitor counts, no consent banner needed.
 *
 * To turn it on, paste your site token here. Find it in the Cloudflare dashboard →
 * Analytics & Logs → Web Analytics → your site → the JS snippet's "token" value.
 * The token is public (it ends up in the page anyway). Empty = analytics off.
 */
export const CLOUDFLARE_ANALYTICS_TOKEN = "ededcb47c516452dbdecaa4dbc8da15c";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
let loaded = false;

/**
 * Loads the beacon once, after the address bar shows the final page (/q/<id> or a
 * not-found page), so each visit is recorded against the quiz actually played.
 * Skipped on local hosts so testing doesn't inflate the numbers.
 */
export function loadAnalytics() {
  if (loaded || !CLOUDFLARE_ANALYTICS_TOKEN || LOCAL_HOSTS.includes(location.hostname)) return;
  loaded = true;
  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.dataset.cfBeacon = JSON.stringify({ token: CLOUDFLARE_ANALYTICS_TOKEN });
  document.head.appendChild(script);
}
