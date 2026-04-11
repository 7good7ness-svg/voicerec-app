# VoiceRec - セットアップガイド

## Codemagicでビルドするまでの手順

### 1. Apple Developer Program への加入
- https://developer.apple.com で $99/年のプランに登録

### 2. App Store Connect でアプリを作成
- https://appstoreconnect.apple.com
- 「新規App」→ Bundle ID: `com.voicerec.app`
- App Apple IDをメモ（codemagic.yamlの `APP_STORE_APPLE_ID` に記入）

### 3. Google Cloud Console でOAuthクライアントIDを作成
- https://console.cloud.google.com
- 新しいプロジェクトを作成
- 「APIとサービス」→「認証情報」→「OAuthクライアントID」
- タイプ: iOSアプリ
- Bundle ID: `com.voicerec.app`
- 作成されたクライアントIDをコピー

### 4. プロジェクトにGoogle Client IDを設定
`VoiceRec/Resources/Info.plist` の以下2箇所を編集:
```xml
<!-- YOUR_GOOGLE_CLIENT_ID を実際の値に置き換え (例: 123456789-abcdef) -->
<key>GIDClientID</key>
<string>123456789-abcdef.apps.googleusercontent.com</string>

<key>CFBundleURLSchemes</key>
<array>
    <string>com.googleusercontent.apps.123456789-abcdef</string>
</array>
```

### 5. GitHubにプッシュ
```bash
cd C:\Users\user\Desktop\voicerec-app
git init
git add .
git commit -m "Initial VoiceRec project"
git remote add origin https://github.com/YOUR_USERNAME/voicerec-app.git
git push -u origin main
```

### 6. Codemagicの設定
1. https://codemagic.io にサインアップ（GitHub連携）
2. 「Add application」→ GitHubリポジトリを選択
3. 設定画面で以下を入力:

**App Store Connect APIキー（必須）**:
- App Store Connect → ユーザーとアクセス → キー でAPIキーを生成
- Codemagic → Team settings → Integrations → App Store Connect でキーを登録

**環境変数（Codemagic UI で設定）**:
| 変数名 | 値 |
|--------|-----|
| APP_STORE_CONNECT_PRIVATE_KEY | APIキー (.p8ファイルの内容) |
| APP_STORE_CONNECT_KEY_IDENTIFIER | キーID |
| APP_STORE_CONNECT_ISSUER_ID | Issuer ID |

4. `codemagic.yaml` の `APP_STORE_APPLE_ID` を実際のApp IDに更新
5. ビルドを実行 → TestFlightに自動配信

### 7. Developer Team ID の設定
`project.pbxproj` の `DEVELOPMENT_TEAM = "";` を自分のTeam IDに変更:
```
DEVELOPMENT_TEAM = "XXXXXXXXXX";  // 10文字の英数字
```
Team IDは: https://developer.apple.com/account → Membership details で確認

---

## 機能一覧

### Apple Watch
- ワンタップ録音開始/停止
- 録音一覧表示
- iPhoneへWatchConnectivityで転送

### iPhone
- 充実した再生機能（シーク、倍速、スキップ）
- 文字起こし（Speech Framework - オンデバイス・無料）
- 要約（NaturalLanguage Framework - オンデバイス・無料）
- 日英翻訳（Translation Framework iOS 17.4+）
- Google Drive アップロード
- 録音のリネーム・削除

## Bundle ID 対応表
| ターゲット | Bundle ID |
|-----------|-----------|
| iPhoneアプリ | com.voicerec.app |
| Watchアプリ | com.voicerec.app.watchkitapp |
