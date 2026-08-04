package com.fwyanjiusuo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://fwyanjiusuo.com/app/";
    private static final String APP_HOST = "fwyanjiusuo.com";
    private static final String UPDATE_URL = "https://fwyanjiusuo.com/download/android-version.json";
    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;
    private boolean updateDialogShowing = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webView.setBackgroundColor(Color.parseColor("#10170F"));
        setContentView(webView);
        configureWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(HOME_URL);
        }
        checkForAppUpdate();
    }

    private void configureSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.parseColor("#10170F"));
            getWindow().setNavigationBarColor(Color.parseColor("#10170F"));
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        String ua = settings.getUserAgentString();
        if (ua != null && !ua.contains("FWYanjiusuoAndroid")) {
            settings.setUserAgentString(ua + " FWYanjiusuoAndroid/" + BuildConfig.VERSION_NAME);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    showOfflinePage();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && request != null) {
                    return handleExternalUrl(request.getUrl());
                }
                return false;
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalUrl(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (uploadCallback != null) {
                    uploadCallback.onReceiveValue(null);
                }
                uploadCallback = filePathCallback;
                Intent intent;
                try {
                    intent = fileChooserParams.createIntent();
                } catch (Exception e) {
                    intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("image/*");
                }
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    uploadCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private void showOfflinePage() {
        if (webView == null) return;
        String html = "<!doctype html><html lang=\"zh-CN\"><head>" +
                "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">" +
                "<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#10170f;color:#f4f7ec;font-family:system-ui,-apple-system,sans-serif}" +
                "main{width:min(420px,100%);padding:24px;border:1px solid rgba(244,247,236,.15);border-radius:22px;background:#162116;text-align:center}" +
                "h1{margin:0 0 10px;font-size:25px}p{margin:0;color:rgba(244,247,236,.72);line-height:1.7;font-weight:700}" +
                "a{display:block;margin-top:20px;padding:13px 18px;border-radius:999px;background:#f4f7ec;color:#10170f;text-decoration:none;font-weight:900}</style>" +
                "</head><body><main><h1>暂时无法连接</h1><p>请检查 Wi-Fi 或移动数据后重试。已经缓存的内容会在网络恢复后继续使用。</p>" +
                "<a href=\"" + HOME_URL + "\">重新连接</a></main></body></html>";
        webView.loadDataWithBaseURL(HOME_URL, html, "text/html", "UTF-8", null);
    }

    private boolean handleExternalUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null) return false;
        if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) && APP_HOST.equalsIgnoreCase(host)) {
            return false;
        }
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
            openExternalUrl(uri.toString());
            return true;
        }
        return false;
    }

    private void checkForAppUpdate() {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(UPDATE_URL + "?t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(6000);
                connection.setUseCaches(false);
                connection.setRequestMethod("GET");
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) return;
                String jsonText = readStream(connection.getInputStream());
                JSONObject json = new JSONObject(jsonText);
                int latestCode = json.optInt("versionCode", BuildConfig.VERSION_CODE);
                if (latestCode <= BuildConfig.VERSION_CODE) return;
                String versionName = json.optString("versionName", "新版");
                String apkUrl = json.optString("apkUrl", "");
                String notes = json.optString("notes", "发现新版本，建议更新后继续使用。");
                boolean forceUpdate = json.optBoolean("forceUpdate", false);
                if (apkUrl.trim().isEmpty()) return;
                runOnUiThread(() -> showUpdateDialog(versionName, notes, apkUrl, forceUpdate));
            } catch (Exception ignored) {
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private String readStream(InputStream inputStream) throws Exception {
        StringBuilder builder = new StringBuilder();
        BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, "UTF-8"));
        String line;
        while ((line = reader.readLine()) != null) {
            builder.append(line);
        }
        reader.close();
        return builder.toString();
    }

    private void showUpdateDialog(String versionName, String notes, String apkUrl, boolean forceUpdate) {
        if (isFinishing() || updateDialogShowing) return;
        updateDialogShowing = true;
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle("发现新版本 " + versionName)
                .setMessage(notes)
                .setPositiveButton("立即更新", (dialog, which) -> {
                    updateDialogShowing = false;
                    openExternalUrl(apkUrl);
                    if (forceUpdate) moveTaskToBack(true);
                });
        if (!forceUpdate) {
            builder.setNegativeButton("稍后再说", (dialog, which) -> updateDialogShowing = false);
        }
        AlertDialog dialog = builder.create();
        dialog.setOnCancelListener(d -> updateDialogShowing = false);
        dialog.setCanceledOnTouchOutside(!forceUpdate);
        dialog.show();
    }

    private void openExternalUrl(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "无法打开下载链接", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || uploadCallback == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        }
        uploadCallback.onReceiveValue(results);
        uploadCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        handleAppBackButton();
    }

    private void handleAppBackButton() {
        String script = "(function(){" +
                "try{" +
                "var fw=window.FWApp||{};" +
                "function q(s,r){return (r||document).querySelector(s);}" +
                "function qs(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}" +
                "function visible(el){if(!el||el.disabled||el.hidden)return false;var cur=el;while(cur&&cur!==document.body){if(cur.hidden)return false;var st=window.getComputedStyle?getComputedStyle(cur):null;if(st&&(st.display==='none'||st.visibility==='hidden'))return false;cur=cur.parentElement;}var cs=window.getComputedStyle?getComputedStyle(el):null;if(cs&&(cs.display==='none'||cs.visibility==='hidden'))return false;var r=el.getBoundingClientRect?el.getBoundingClientRect():null;return !r||(r.width>0&&r.height>0);}" +
                "function click(el){if(!visible(el))return false;el.click();return true;}" +
                "function clickFirst(sel,root){var arr=qs(sel,root);for(var i=0;i<arr.length;i++){if(click(arr[i]))return true;}return false;}" +
                "function go(name){if(fw&&typeof fw.openView==='function'){fw.openView(name);return true;}if(fw&&typeof fw.setView==='function'){fw.setView(name);return true;}return false;}" +
                "var active=q('[data-app-view].is-active');" +
                "var view=(fw.state&&fw.state.view)||(active&&active.dataset?active.dataset.appView:'');" +
                "var modal=q('dialog[open],.modal:not([hidden]),.app-modal:not([hidden]),[data-app-modal]:not([hidden])');" +
                "if(modal&&clickFirst('[data-modal-close],[data-close],.modal-close',modal))return true;" +
                "var buddy=q('[data-app-view=buddy]');" +
                "var buddyPanel=buddy?q('[data-buddy-chat-panel]',buddy):null;" +
                "var buddyChatting=!!(view==='buddy'&&buddy&&buddy.classList&&buddy.classList.contains('is-chatting')&&visible(buddyPanel));" +
                "if(buddyChatting){" +
                "if(window.FWAppBuddy&&typeof window.FWAppBuddy.closeChat==='function'){window.FWAppBuddy.closeChat(true);return true;}" +
                "if(clickFirst('[data-buddy-chat-back]',buddy))return true;" +
                "}" +
                "if(view==='profile'&&active&&clickFirst('[data-profile-back]',active))return true;" +
                "if(view==='bird-detail'&&window.FWAppBird&&typeof window.FWAppBird.backToBird==='function'){window.FWAppBird.backToBird();return true;}" +
                "if(active&&clickFirst('[data-square-detail-back],[data-mobile-bird-back],[data-profile-back],.back-btn',active))return true;" +
                "if(view==='square-detail'&&clickFirst('[data-square-detail-back]'))return true;" +
                "if(view==='bird-compose')return go('bird');" +
                "if(view==='rooms-compose')return go('rooms');" +
                "if(!view||view==='nav')return false;" +
                "return go('nav');" +
                "}catch(e){return false;}" +
                "})()";

        webView.evaluateJavascript(script, value -> {
            boolean handled = "true".equals(String.valueOf(value));
            if (handled) return;
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return;
            }
            moveTaskToBack(true);
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
