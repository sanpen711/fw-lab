# F.w 研究所 Android APK

这是 F.w 研究所的安卓 WebView 壳工程。

## 默认配置

- App 名称：F.w 研究所
- 包名：com.fwyanjiusuo.app
- 默认打开地址：https://fwyanjiusuo.com/app/
- 屏幕方向：竖屏锁定
- 图片上传：支持网页中的文件选择/相册选择

## 工程说明

APK 只负责安卓外壳能力：

- 桌面图标
- WebView 打开手机端网页
- JavaScript / DOM Storage / localStorage 支持
- 安卓返回键基础处理
- 相册文件选择
- 外部链接跳出浏览器打开

业务功能仍然来自现有网站 `/app/`，例如搭子、回声、我的、观鸟台、学术研讨等。

## 用 Android Studio 打包

1. 打开 Android Studio。
2. 选择 `Open`，打开本目录 `android-app/`。
3. 等待 Gradle Sync 完成。
4. 连接安卓手机，点击 Run 进行测试。
5. 生成测试 APK：`Build > Build Bundle(s) / APK(s) > Build APK(s)`。
6. 生成正式 APK：`Build > Generate Signed Bundle / APK`，选择 APK，并使用自己的 release keystore 签名。

## 测试重点

- 首次打开是否进入 `https://fwyanjiusuo.com/app/`
- 登录状态是否保持
- 搭子、回声、我的是否正常打开
- 观鸟台图片选择是否正常
- 安卓返回键是否符合预期
- 切后台再回来是否正常
- 国产安卓手机上的键盘弹出、底部输入框、状态栏是否正常

## 注意

`*.jks`、`*.keystore` 和 `local.properties` 已加入忽略规则，不要把签名证书和本地 SDK 配置提交到仓库。
