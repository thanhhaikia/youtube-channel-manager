package io.github.thanhhaikia.youtubemanager;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.AccountPicker;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Scope;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * What the web app cannot do inside a WebView: Google sign-in (Google blocks its sign-in pages
 * there) and saving files. Exposed to the bundled page as `YTMNative`; results of
 * `requestToken` go back through `window.YTMNativeCallback(id, result)`.
 * Only read-only scopes are requested, and tokens are never stored by this class.
 */
final class NativeBridge {
    private static final int RC_ACCOUNT = 41;
    private static final int RC_AUTH = 42;
    private static final int RC_SAVE = 43;
    private static final String GOOGLE = "com.google";
    private static final String SCOPE_BASE = "https://www.googleapis.com/auth/";

    private final Activity activity;
    private final WebView web;

    private String pendingId;
    private boolean pendingMonetary;
    private String pendingSaveText;

    NativeBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    /** Asks for an access token for `hint` (an email), or lets the user pick an account when it is empty. */
    @JavascriptInterface
    public void requestToken(final String id, final String hint, final boolean monetary, final boolean silent) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (pendingId != null) { fail(id, "busy", "Đang có một yêu cầu đăng nhập khác."); return; }
                if (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(activity) != ConnectionResult.SUCCESS) {
                    fail(id, "no_play_services", null);
                    return;
                }
                if (hint != null && !hint.isEmpty()) {
                    pendingId = id;
                    pendingMonetary = monetary;
                    authorize(hint, silent);
                } else if (silent) {
                    fail(id, "interaction_required", null);
                } else {
                    pendingId = id;
                    pendingMonetary = monetary;
                    Intent picker = AccountPicker.newChooseAccountIntent(new AccountPicker.AccountChooserOptions.Builder()
                            .setAllowableAccountsTypes(Arrays.asList(GOOGLE)).setAlwaysShowAccountPicker(true).build());
                    try {
                        activity.startActivityForResult(picker, RC_ACCOUNT);
                    } catch (ActivityNotFoundException e) {
                        finish("no_play_services", null);
                    }
                }
            }
        });
    }

    /** Package name and signing certificate SHA-1, as needed for the Android OAuth client in Google Cloud. */
    @JavascriptInterface
    public String appInfo() {
        JSONObject info = new JSONObject();
        try {
            info.put("packageName", activity.getPackageName());
            info.put("sha1", signingSha1());
        } catch (JSONException ignored) {
            // values are plain strings
        }
        return info.toString();
    }

    /** Forgets a token the API rejected so Play Services issues a new one next time. */
    @JavascriptInterface
    public void clearToken(final String token) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    GoogleAuthUtil.clearToken(activity.getApplicationContext(), token);
                } catch (Exception ignored) {
                    // best effort
                }
            }
        }).start();
    }

    /** Lets the user choose where to save a text file (backup JSON, CSV). */
    @JavascriptInterface
    public void saveFile(final String name, final String mime, final String text) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                pendingSaveText = text;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime == null || mime.isEmpty() ? "text/plain" : mime.split(";")[0]);
                intent.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    activity.startActivityForResult(intent, RC_SAVE);
                } catch (ActivityNotFoundException e) {
                    pendingSaveText = null;
                    toast("Máy này không có ứng dụng quản lý tệp để lưu.");
                }
            }
        });
    }

    /** Returns true when the result belonged to this bridge. */
    boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == RC_ACCOUNT) {
            String name = resultCode == Activity.RESULT_OK && data != null ? data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME) : null;
            if (name == null) finish("cancelled", null);
            else authorize(name, false);
            return true;
        }
        if (requestCode == RC_AUTH) {
            if (resultCode != Activity.RESULT_OK || data == null) { finish("cancelled", null); return true; }
            try {
                deliver(Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data));
            } catch (ApiException e) {
                finishWithException(e);
            }
            return true;
        }
        if (requestCode == RC_SAVE) {
            String text = pendingSaveText;
            pendingSaveText = null;
            Uri uri = resultCode == Activity.RESULT_OK && data != null ? data.getData() : null;
            if (uri != null && text != null) write(uri, text);
            return true;
        }
        return false;
    }

    private void authorize(String email, final boolean silent) {
        List<Scope> scopes = new ArrayList<>();
        scopes.add(new Scope(SCOPE_BASE + "youtube.readonly"));
        scopes.add(new Scope(SCOPE_BASE + "yt-analytics.readonly"));
        scopes.add(new Scope(SCOPE_BASE + "userinfo.email"));
        if (pendingMonetary) scopes.add(new Scope(SCOPE_BASE + "yt-analytics-monetary.readonly"));
        AuthorizationRequest request = AuthorizationRequest.builder()
                .setRequestedScopes(scopes).setAccount(new Account(email, GOOGLE)).build();
        Identity.getAuthorizationClient(activity).authorize(request)
                .addOnSuccessListener(activity, result -> {
                    if (!result.hasResolution()) { deliver(result); return; }
                    if (silent) { finish("interaction_required", null); return; }
                    try {
                        activity.startIntentSenderForResult(result.getPendingIntent().getIntentSender(), RC_AUTH, null, 0, 0, 0);
                    } catch (IntentSender.SendIntentException e) {
                        finish("unknown", e.getMessage());
                    }
                })
                .addOnFailureListener(activity, this::finishWithException);
    }

    private void deliver(AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null) { finish("unknown", "Google không trả về mã truy cập."); return; }
        JSONObject out = new JSONObject();
        try {
            out.put("token", token);
            out.put("scope", String.join(" ", result.getGrantedScopes()));
        } catch (JSONException ignored) {
            // values are plain strings
        }
        send(pendingId, out);
        pendingId = null;
    }

    private void finishWithException(Exception e) {
        int code = e instanceof ApiException ? ((ApiException) e).getStatusCode() : CommonStatusCodes.ERROR;
        if (code == CommonStatusCodes.DEVELOPER_ERROR) finish("not_configured", null);
        else if (code == CommonStatusCodes.CANCELED) finish("cancelled", null);
        else if (code == CommonStatusCodes.NETWORK_ERROR) finish("network", "Không kết nối được tới Google. Kiểm tra mạng rồi thử lại.");
        else finish("unknown", "Đăng nhập Google thất bại (mã " + code + ").");
    }

    private void finish(String error, String message) {
        String id = pendingId;
        pendingId = null;
        if (id != null) fail(id, error, message);
    }

    private void fail(String id, String error, String message) {
        JSONObject out = new JSONObject();
        try {
            out.put("error", error);
            if (message != null) out.put("message", message);
        } catch (JSONException ignored) {
            // values are plain strings
        }
        send(id, out);
    }

    private void send(String id, JSONObject result) {
        web.evaluateJavascript("window.YTMNativeCallback(" + JSONObject.quote(id) + "," + result + ")", null);
    }

    private void write(Uri uri, String text) {
        try (OutputStream out = activity.getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new java.io.IOException("no stream");
            out.write(text.getBytes(StandardCharsets.UTF_8));
            toast("Đã lưu tệp.");
        } catch (Exception e) {
            toast("Không lưu được tệp.");
        }
    }

    private void toast(String text) {
        Toast.makeText(activity, text, Toast.LENGTH_LONG).show();
    }

    @SuppressWarnings("deprecation")
    private String signingSha1() {
        try {
            PackageManager pm = activity.getPackageManager();
            Signature[] signatures;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo info = pm.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                signatures = info.signingInfo.getApkContentsSigners();
            } else {
                signatures = pm.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNATURES).signatures;
            }
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(signatures[0].toByteArray());
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) {
                if (hex.length() > 0) hex.append(':');
                hex.append(String.format("%02X", b));
            }
            return hex.toString();
        } catch (Exception e) {
            return "";
        }
    }
}
