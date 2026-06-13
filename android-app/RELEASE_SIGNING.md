# Android release 签名说明

## 为什么必须统一签名

安卓覆盖安装要求：包名相同，签名也必须相同。

当前包名：`com.fwyanjiusuo.app`

如果旧 APK 和新 APK 签名不同，安装时会提示“软件包与现有软件包存在冲突”。

## 一次性生成 release keystore

在 Android Studio 中：

1. 打开 `android-app` 工程。
2. 点击 `Build > Generate Signed App Bundle or APK...`。
3. 选择 `APK`。
4. 点击 `Create new...`。
5. 保存 keystore，例如：`D:\fw-release.jks`。
6. Key alias 建议：`fw`。
7. Store password 和 Key password 自己设置，并永久保存。
8. Validity 建议填 `25` 年以上。

重要：`fw-release.jks`、Store password、Key password、Key alias 以后不能丢。

## 本地 release 打包

Android Studio 中选择刚才的 keystore，生成 release APK。

生成后的 APK 才能作为正式更新包。

## GitHub 自动打包需要的 Secrets

如果要让 GitHub Actions 自动生成同一个签名的 APK，需要在仓库设置里添加以下 Secrets：

- `FW_RELEASE_KEYSTORE_BASE64`
- `FW_RELEASE_STORE_PASSWORD`
- `FW_RELEASE_KEY_ALIAS`
- `FW_RELEASE_KEY_PASSWORD`

Windows PowerShell 把 keystore 转成 Base64：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("D:\fw-release.jks")) | Set-Clipboard
```

然后把剪贴板内容粘贴到 `FW_RELEASE_KEYSTORE_BASE64`。

## 第一次切换到 release 签名的注意事项

如果手机里当前安装的是 debug 签名版，不能直接覆盖 release 签名版。

需要先卸载一次旧版，再安装第一个 release 签名版。

从这个 release 签名版开始，以后所有新版都可以覆盖更新。
