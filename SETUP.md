# ZeroChat Firebase セットアップ

対象 Firebase プロジェクト: `zerochat-45a93`

この版は Firebase Authentication / Cloud Firestore / Realtime Database を使用します。Firebase の接続設定は `js/firebase.js` に登録済みなので、`.env` や GitHub Secrets は必要ありません。


## Webアプリの公開構成

このリポジトリはブラウザーで動作する ZeroChat 本体と、Firebase の設定ファイルを含みます。Windows の `.bat` や macOS の `.command` は含めていません。

- GitHub Pages: GitHub Actions が Vite で `dist/` を生成して公開します。
- Firebase Authentication: Google、メールアドレス・パスワード、匿名ログインを Firebase Console で有効にします。
- Cloud Firestore / Realtime Database: ルールファイルを Firebase Console から手動反映できます。

ローカルで確認する場合は、Node.js 22 以降を用意して、プロジェクトのルートで `npm install`、続けて `npm run dev` を実行してください。

## 1. Authentication を有効化

Firebase Console の **Authentication → Sign-in method** で、次の3方式を有効にします。

- **Email/Password**（メールアドレス・パスワード）
- **Google**（Google アカウント）
- **Anonymous**（匿名ログイン）

Google を有効にするときは、サポートメールも選択してください。

続けて **Authentication → Settings → Authorized domains** を開き、公開先のドメインを追加します。

- ローカル開発: `localhost`
- GitHub Pages: `ユーザー名.github.io`
- Firebase の標準ドメインは通常、最初から登録されています。

このアプリのGoogle認証はポップアップ方式です。OAuthのCallback URLやRedirect URLを個別に設定する必要はありません。

## 2. Cloud Firestore を作成

Firebase Console の **Firestore Database → Create database** からデータベースを作成します。

- 本番環境で開始する場合は **Production mode** を選択
- ロケーションは利用地域に合わせて選択（日本向けなら `asia-northeast1` / Tokyo）
- Firestore のロケーションは作成後に変更できないため、慎重に選択してください。

主なコレクションは次のとおりです。

| コレクション | 用途 |
|---|---|
| `profiles` | 表示名・アイコン・権限・BAN状態などの公開プロフィール |
| `private_profiles` | メールアドレス。本人と開発者だけが読み取り可能 |
| `rooms` | グループルーム・DM |
| `room_members` | 参加状態・ルーム内権限・既読設定 |
| `messages` | メッセージ・画像・投票 |
| `room_typing` | 参加ルーム内の入力中表示（短時間で自動的に非表示） |
| `reactions` | リアクション |
| `message_reads` | メッセージごとの既読 |
| `poll_votes` | 投票結果 |
| `saved_messages` | 保存したメッセージ |
| `reports` | 通報 |
| `audit_log` | 管理機能の操作記録 |

## 3. Realtime Database

既に作成済みの Realtime Database を使用します。

`https://zerochat-45a93-default-rtdb.firebaseio.com/`

オンライン状態を保存します。入力中表示は、DMの情報を他の利用者に公開しないようFirestoreの `room_typing` に保存し、参加中のルームメンバーだけが読み取れます。チャット本文やルーム情報も Firestore 側です。

## 4. 本番用 Security Rules と Indexes を反映

プロジェクト直下に以下の設定ファイルを用意しています。

- `firestore.rules` — Firestore の読み書き権限
- `firestore.indexes.json` — 複合インデックス
- `database.rules.json` — Realtime Database の読み書き権限
- `firebase.json` / `.firebaserc` — Firebase CLI 設定

Node.js 20 以上の環境で、プロジェクトフォルダから実行します。

```bash
npm install -g firebase-tools
firebase login
firebase use zerochat-45a93
firebase deploy --only firestore,database
```

`firestore` のデプロイで Security Rules と Indexes が反映され、`database` で Realtime Database の Rules が反映されます。

Firebase Console から手動で反映する場合:

- Firestore: **Firestore Database → Rules** に `firestore.rules` の内容を反映
- Realtime Database: **Realtime Database → Rules** に `database.rules.json` の `rules` の中身を反映
- Indexes: `firestore.indexes.json` は Firebase CLI からデプロイしてください。

**重要:** ルールを公開する前に、Firestoreを作成してAuthenticationの3方式を有効にしてください。テスト用の「すべて許可」ルールは使用しないでください。

## 5. 最初の開発者アカウントを登録

1. アプリから自分のメールアドレス、Google、または匿名アカウントで一度ログインします。
2. Firebase Console の **Authentication → Users** を開き、自分のユーザーの **UID** をコピーします。
3. **Firestore Database → Data** で `profiles` コレクションを開き、UIDと同じIDのドキュメントを選択します。
4. `role` フィールドを文字列 `developer` に変更して保存します。
5. アプリを再読み込みします。開発者用の管理パネルが利用可能になります。

`role` と `banned` はユーザー自身では変更できません。開発者権限の付与・剥奪は、最初の1回だけFirebase Consoleから行ってください。

## 6. ローカルで起動

Node.js 20 以上をインストールした後、次を実行します。

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173/` を開きます。`.env` の作成やFirebaseキーの貼り付けは不要です。

## 7. GitHub Pages へ公開（ビルド不要の静的HTML版）

1. このフォルダの中身（`index.html` / `js` / `css` など）をリポジトリの**ルート**にそのまま置いて `main` へ push します。
2. **Settings → Pages → Source** を **Deploy from a branch**、ブランチ `main` / フォルダ `/ (root)` にします。
3. 数分後に `https://ユーザー名.github.io/リポジトリ名/` で表示されます。
4. Firebase Authentication の Authorized domains に `ユーザー名.github.io` を追加します。

`npm` やビルドは不要です。ローカル確認は `python3 -m http.server` などで配信してください（`file://` では動きません）。
Firestore/Realtime Database のルールは `firebase/` フォルダにあります。

## 8. 画像の保存方式

Firebase Storageは使用しません。選択した画像をブラウザ内でWebPに圧縮し、データURLとしてFirestoreのメッセージに保存します。

- 画像の圧縮上限: 約560 KiB
- 画像はFirestoreドキュメント内に格納
- `firestore.rules` でも画像サイズを制限

画像が多いチャットではFirestoreの保存容量・読み取り量が増えるため、大量の高解像度画像を連続送信する用途には向きません。画像を大量に扱う構成へ拡張する場合は、別途Storage等のファイル保存先を検討してください。

## 9. 注意点・移行範囲

- Supabaseのユーザーアカウント、パスワード、既存メッセージは自動移行されません。Firebase側で新しくアカウントを作成してください。
- メールアドレスは `profiles` には公開せず、`private_profiles` に分離しています。本人と開発者だけが読み取れます。
- Firebase Web SDKだけではAuthenticationの全ユーザー情報を直接列挙できないため、管理パネルのメール表示にはFirestoreの非公開プロフィールを使います。
- `audit_log` はアプリ操作を記録する補助ログです。クライアントだけで書き込むため、サーバー側で保証された改ざん不能な監査証跡ではありません。
- 匿名ログインは、そのブラウザに保存されたFirebase認証状態を使います。別の端末やブラウザに自動引き継がれるものではありません。

## 10. トラブルシューティング

- **`auth/unauthorized-domain`**: Authentication の Authorized domains に、現在開いているドメインを追加します。
- **`permission-denied`**: `firebase deploy --only firestore,database` を実行し、RulesとIndexesが反映されているか確認します。
- **複合インデックスが必要というエラー**: `firebase deploy --only firestore` を実行し、`firestore.indexes.json` を反映します。
- **Googleログインのポップアップが開かない**: ブラウザのポップアップブロックと、Googleプロバイダが有効か確認します。
- **ルームが空になる**: Firestore Databaseが作成済みか、ログイン後に `profiles/{UID}` と `room_members` が作成されているかを確認します。
