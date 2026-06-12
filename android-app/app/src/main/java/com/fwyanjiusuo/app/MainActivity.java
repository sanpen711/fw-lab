package com.fwyanjiusuo.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://fwyanjiusuo.com/app/";
    private static final String APP_HOST = "fwyanjiusuo.com";
    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(webView);
        configureWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(HOME_URL);
        }
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
            settings.setUserAgentString(ua + " FWYanjiusuoAndroid/1.0");
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

    private boolean handleExternalUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null) return false;
        if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) && APP_HOST.equalsIgnoreCase(host)) {
            return false;
        }
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            } catch (ActivityNotFoundException ignored) {
                return true;
            }
        }
        return false;
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
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        moveTaskToBack(true);
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
