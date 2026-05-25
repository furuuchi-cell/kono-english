# 引き継ぎメモ：単語編集（wordOverrides）が戻る／ズレる問題

調査日: 2026-04-27
対象クラス: AS2EN001（`wordSetId = "AS2EN001"`）
対象リポジトリ: `kono-english`（KONO式英単語アプリ）

---

## 🤖 Claude Code への指示（最初に必ず読むこと）

ユーザーがこのファイルを添付して「続きをお願いします」と言ってきた場合、以下に従って再開すること：

### 応答ルール（厳守）
- 応答は通常の日本語（標準語）で返す。
- コードを変更したら必ず `npm run build && firebase deploy --only hosting` でビルド＆デプロイまで自動で完了させる（ユーザーのグローバルルール）。
- ドキュメント（*.md）の新規作成は明示要求がない限り行わないこと。このファイルは既存なので編集はOK。

### 再開手順
1. このファイル全体を読んで状況を把握する。
2. 必要なら `src/components/admin/WordEditPage.tsx`、`src/hooks/useWords.ts`、`src/data/classWords/AS2EN001.json` を読み直して現状を確認する。
3. ユーザーに以下を尋ねるところから再開する：
   > 「前回 (A)(B)(C) のどれを進めるか聞いて止まっていました。どれにしますか？  
   > (A) コード側のバグ修正だけ先に  
   > (B) Firestore の wordOverrides をダウンロードして整合性検査  
   > (C) 4/25 更新前の旧 AS2EN001.json から編集救出」
4. ユーザーが選んだ選択肢に応じて、後述の「アクション詳細」を実行する。

---

## 1. ユーザーから受けた指摘（原文）

> ほとんどの週で、修正して編集済ってなってたのが全部編集前のに戻ってんだけど確認してもらえると助かる
> あと第9週で、編集済ってなってるところが、単語とそれ以外（意味とか例文）がズレまくってて変なことになってる。

---

## 2. 結論（原因）

### 主因：`src/data/classWords/AS2EN001.json` が後から差し替えられた

- 元CSV（リポジトリ親ディレクトリ `KONO式単語設計単語範囲/単語リスト(古内さん) ...csv`）は **2351語**
- 現在の JSON は **2092語**（259語減 or 並べ替え）
- ファイル更新日時：**2026-04-25 11:41**（指摘の2日前に更新されとる）
- 数字の食い違い：
  - `CLAUDE.md` …「2351語」と記載
  - `src/components/student/StudyPage.tsx:32` …`?? 2350`
  - `src/hooks/useWords.ts:23` …`AS2EN001: 2092`

編集情報は `classes/{classId}/settings/wordOverrides` に **wordId をキー**で保存される（`src/components/admin/WordEditPage.tsx:73`、`src/hooks/useWords.ts:29-42`）。
JSON 差し替えで wordId の指す単語が変わった結果：

- 過去の id=N に対する編集が、**新しい id=N の別単語に勝手に貼り付く**
- 旧データで id≧2093 だった編集は、**現データに存在せず浮いて消えたように見える**

これが「ほとんどの週で編集前に戻ってる」「第9週で英単語と意味・例文がズレまくる」の主因。

### 副因（複合的に効いている）

1. **データ自体に pos 誤りが混入**
   - `id=1343 extent` … pos=`adjective`（本来 noun。意味「程度」）
   - `id=1353 largely` … pos=`verb-tado`（本来 adverb。意味「主に」）
   - 他にも要洗い出し
   - `WordEditPage.tsx:108` で品詞順にソートしているため、誤った pos の単語が変な位置に出る

2. **WordEditPage の No. 表示バグ**
   - `src/components/admin/WordEditPage.tsx:202` と `:291` で `startId + idx` を表示
   - 週内ソート（品詞順）と pos 編集の影響で、**画面上の「No.1234」と実際の `w.id` が一致しない**ケースがある
   - 編集の保存自体は `w.id` で行われているので**保存は壊れていない**。見た目だけのズレ

3. **保存ロジックの競合リスク**
   - `WordEditPage.tsx:70-83` の `handleSave` は `setDoc` で wordOverrides 全体を書き換える（merge なし）
   - 共同管理者2人が同時に編集すると後勝ちで片方が消える
   - 主因ではないが残る既知リスク

---

## 3. 関連ファイル一覧

| ファイル | 役割 | 注目行 |
|---|---|---|
| `src/data/classWords/AS2EN001.json` | バンドル単語データ（2092語） | ファイル全体 |
| `src/hooks/useWords.ts` | クラス別単語取得＋override 適用 | `:22` (TOTAL=2092), `:29-42` (applyOverrides) |
| `src/components/admin/WordEditPage.tsx` | 単語編集 UI | `:73` (保存), `:108` (品詞ソート), `:202`/`:291` (No.表示) |
| `src/components/student/WordListPage.tsx` | 生徒側の単語一覧 | `:17`, `:61` |
| `src/components/student/StudyPage.tsx` | スピード周回 | `:32` (`?? 2350`) |
| `src/components/admin/ClassSetupPage.tsx` | AS2EN001 初期化 | `:8`, `:68` |
| `CLAUDE.md` | プロジェクト概要 | 「2351語」記述 |

Firestore パス：
- `classes/{classId}/settings/wordOverrides`（編集情報、wordId をキー）
- `classes/{classId}` の `wordSetId` フィールド

---

## 4. アクション詳細（ユーザーが選んだら実行）

### (A) コード側のバグだけ先に直す
- `WordEditPage.tsx:202` `:291` の No. 表示を `startId + idx` → `w.id` に変更
- `src/data/classWords/AS2EN001.json` の pos 誤りを直接修正
  - `extent` (id=1343): adjective → noun
  - `largely` (id=1353): verb-tado → adverb
  - 他にも全件 pos 妥当性チェックする（英単語と pos と日本語訳の整合性をスキャンするスクリプトを書くと早い）
- 数字の統一（2092 / 2350 / 2351 → 2092）
  - `CLAUDE.md`：本文「2351語」「16週96範囲」を 2092 / 14週相当へ
  - `src/components/student/StudyPage.tsx:32`：`?? 2350` → `?? 2092`
- 完了したら `npm run build && firebase deploy --only hosting`

### (B) Firestore の wordOverrides ダウンロードして整合性検査
- ユーザーに `firebase firestore:export` か Firebase Console から `classes/{classId}/settings/wordOverrides` を取得してもらう
- 取得した override の wordId 一覧と、現 `AS2EN001.json` の id 一覧を突き合わせる
- 抽出すべきもの：
  - **存在しない id への override**（旧データで id≧2093 だった編集が浮いている）
  - **英単語が override の意図と乖離している id**（例：override の `japanese` が「達成する」なのに現 id の english が "abandon" 等）
- レポートをユーザーに提示し、捨てる／救出する判断を仰ぐ

### (C) 旧 AS2EN001.json（2026-04-25 更新前）が見つかれば編集を救出
- ユーザーに「4/25 更新前の AS2EN001.json か、その元データが残っとらん？」と聞く
- 残っていれば：
  1. 旧データから `id → english` のマップを作る
  2. Firestore から override を取得（B と同じ手順）
  3. override の旧 id を english 経由で新 id に置き換える
  4. 新しい override を Firestore に書き戻す
- 残っていなければ救出不可。`wordOverrides` を一旦リセット（または現 id に整合する分だけ残す）してユーザーに編集をやり直してもらう旨を提案

---

## 5. 確認用の Python スニペット（再現確認用）

リポジトリルート（`kono-english/`）で実行する想定：

```python
import json, csv
with open('src/data/classWords/AS2EN001.json') as f:
    data = json.load(f)
print('total:', len(data))                                          # → 2092
print('id range:', min(w['id'] for w in data), max(w['id'] for w in data))  # → 1〜2092
print('unique ids:', len(set(w['id'] for w in data)))               # → 2092

# 元CSVとの比較（パスは環境による）
with open('../KONO式単語設計単語範囲/単語リスト(古内さん) 33a7b9da3df180f48431c484ebe95c6f.csv') as f:
    rows = list(csv.reader(f))
print('csv rows:', len(rows))  # → 2352（ヘッダー込み = 2351語）

# 第9週（id 1201〜1350）の pos 分布確認
from collections import Counter
week9 = [w for w in data if 1201 <= w['id'] <= 1350]
print(Counter(w.get('pos','?') for w in week9))
```

---

## 6. プロジェクト基本情報（補足）

- フロントエンド：React + TypeScript (Create React App)
- バックエンド：Firebase Auth / Firestore / Hosting
- Firebase プロジェクト：`kono-english`
- 本番URL：`https://kono-english.web.app`
- デプロイ：`npm run build && firebase deploy --only hosting`
- スタイル：全てインラインスタイル（Tailwind なし）
- 詳しいディレクトリ構成・データ構造は `CLAUDE.md` 参照

---

## 7. 引き継ぎ時点の状態スナップショット

- 調査は完了。原因は特定済み。
- コードはまだ一切変更していない。
- ユーザーには原因とアクション (A)/(B)/(C) を提示し、**どれを進めるか返答待ち**で止まっている。
- このファイル自体は引き継ぎ用に作成済み。問題が片付いたら丸ごと削除して構わない。
