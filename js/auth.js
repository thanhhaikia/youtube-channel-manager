/* Google sign-in through Google Identity Services (token model, browser only, read-only scopes).
   Each sign-in returns an access token valid for about one hour for the chosen YouTube channel. */
(function (root) {
  'use strict';

  var GIS_URL = 'https://accounts.google.com/gsi/client';
  var SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  var MONETARY_SCOPE = 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly';
  var ANALYTICS_SCOPE = SCOPES[1];

  var gisPromise = null;

  function supported() {
    return /^https?:$/.test(root.location.protocol);
  }

  function loadGis() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = GIS_URL; s.async = true;
      s.onload = function () {
        if (root.google && root.google.accounts && root.google.accounts.oauth2) resolve();
        else reject(authError('gis_load', 'Không tải được thư viện đăng nhập Google.'));
      };
      s.onerror = function () { gisPromise = null; reject(authError('gis_load', 'Không tải được thư viện đăng nhập Google. Kiểm tra mạng hoặc trình chặn quảng cáo.')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  function authError(type, message) {
    var e = new Error(message);
    e.name = 'AuthError'; e.type = type;
    return e;
  }

  var MESSAGES = {
    popup_closed: 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.',
    popup_failed_to_open: 'Trình duyệt đã chặn cửa sổ đăng nhập Google. Hãy cho phép cửa sổ bật lên (pop-up) cho trang này rồi thử lại.',
    access_denied: 'Bạn chưa cấp quyền cho ứng dụng.',
    invalid_client: 'OAuth Client ID không đúng, hoặc địa chỉ trang này chưa được khai báo trong "Authorized JavaScript origins".',
    unsupported: 'Đăng nhập Google chỉ hoạt động khi mở ứng dụng qua địa chỉ http(s) (GitHub Pages hoặc localhost), không hoạt động khi mở tệp trực tiếp.'
  };

  /* opts: {clientId, monetary, hint, prompt}. Must be called from a user gesture. */
  function requestToken(opts) {
    if (!supported()) return Promise.reject(authError('unsupported', MESSAGES.unsupported));
    if (!opts.clientId) return Promise.reject(authError('no_client', 'Chưa nhập OAuth Client ID trong Cài đặt.'));
    return loadGis().then(function () {
      return new Promise(function (resolve, reject) {
        var scope = SCOPES.concat(opts.monetary ? [MONETARY_SCOPE] : []).join(' ');
        var client = root.google.accounts.oauth2.initTokenClient({
          client_id: opts.clientId,
          scope: scope,
          callback: function (resp) {
            if (!resp || resp.error || !resp.access_token) {
              var type = (resp && resp.error) || 'unknown';
              reject(authError(type, MESSAGES[type] || (resp && resp.error_description) || 'Đăng nhập Google thất bại (' + type + ').'));
              return;
            }
            resolve({ token: resp.access_token, expiresIn: Number(resp.expires_in) || 3600, scope: resp.scope || '' });
          },
          error_callback: function (err) {
            var type = (err && err.type) || 'unknown';
            reject(authError(type, MESSAGES[type] || (err && err.message) || 'Đăng nhập Google thất bại.'));
          }
        });
        var req = { prompt: opts.prompt == null ? '' : opts.prompt };
        if (opts.hint) req.login_hint = opts.hint;
        client.requestAccessToken(req);
      });
    });
  }

  function hasAnalyticsScope(scope) { return (scope || '').split(/\s+/).indexOf(ANALYTICS_SCOPE) >= 0; }

  function revoke(token) {
    try { if (root.google && root.google.accounts) root.google.accounts.oauth2.revoke(token, function () {}); } catch (e) { /* ignore */ }
  }

  function preload() { if (supported()) loadGis().then(null, function () {}); }

  root.YTM.auth = { preload: preload, SCOPES: SCOPES, MONETARY_SCOPE: MONETARY_SCOPE, supported: supported, requestToken: requestToken, hasAnalyticsScope: hasAnalyticsScope, revoke: revoke };
})(typeof self !== 'undefined' ? self : globalThis);
