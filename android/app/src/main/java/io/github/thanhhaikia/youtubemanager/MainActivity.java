package io.github.thanhhaikia.youtubemanager;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Hosts the web app, bundled in assets/www, inside a WebView. */
public class MainActivity extends Activity {
    // Reserved by Google for apps serving local content; a secure origin that never resolves on the network.
    static final String APP_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_HOST + "/index.html";
    private static final int RC_FILE = 40;

    // The web app needs a reasonably modern engine (Intl.DisplayNames, Promise.finally, CSS grid).
    private static final int MIN_WEBVIEW = 81;
    private static final String OUTDATED_PAGE = "<meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<body style='font-family:sans-serif;padding:24px;line-height:1.5'><h2>Quản lý kênh YouTube</h2>"
            + "<p>Thành phần hiển thị web của máy (Android System WebView) đã quá cũ nên chưa chạy được ứng dụng.</p>"
            + "<p>Hãy mở CH Play, cập nhật <b>Android System WebView</b> và <b>Chrome</b>, rồi mở lại ứng dụng.</p>";

    private WebView web;
    private NativeBridge bridge;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        bridge = new NativeBridge(this, web);
        web.addJavascriptInterface(bridge, "YTMNative");
        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new AppChrome());

        if (webViewMajorVersion(settings.getUserAgentString()) < MIN_WEBVIEW) {
            web.loadDataWithBaseURL(null, OUTDATED_PAGE, "text/html", "utf-8", null);
            return;
        }
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == RC_FILE) {
            if (fileCallback != null) fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        if (!bridge.onActivityResult(requestCode, resultCode, data)) super.onActivityResult(requestCode, resultCode, data);
    }

    private final class AppChrome extends WebChromeClient {
        /** Backs the "import backup" file input. */
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                startActivityForResult(intent, RC_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
        }
    }

    private final class AppClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (!APP_HOST.equals(request.getUrl().getHost())) return null;
            String path = request.getUrl().getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            try {
                return new WebResourceResponse(mimeType(path), "utf-8", getAssets().open("www" + path));
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                        Collections.<String, String>emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (APP_HOST.equals(request.getUrl().getHost())) return false;
            // The native bridge is only for the bundled app, so other pages open in the browser.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
            } catch (ActivityNotFoundException ignored) {
                // no browser installed
            }
            return true;
        }
    }

    /** Chromium version from a WebView user agent ("... Chrome/113.0.5672.136 ..."); 0 if it has none. */
    static int webViewMajorVersion(String userAgent) {
        Matcher m = Pattern.compile("Chrome/(\\d+)").matcher(userAgent == null ? "" : userAgent);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }
}
