# SQLite DB Viewer - Proje Özeti

Bu dosya, projeyi hızlıca hatırlamak ve güncellemeye başlamak için özet amaçlıdır.

## Amaç
- VS Code içinde `.db/.sqlite/.sqlite3` dosyalarını **custom editor** ile açmak.
- VS Code temasıyla birebir uyumlu, native hissiyatlı bir SQLite görüntüleyici sunmak.

## Mimari
### Extension Host (Node)
Dosya: `src/extension.ts`
- Custom editor provider: `newDbViewer.dbViewer`
- DB dosyasını okur, webview’e byte olarak gönderir.
- Webview’den gelen **save/export** isteklerini dosyaya yazar.

### Webview (React + Vite)
Dosya: `webview-ui/src/App.tsx`
- `sql.js` (WASM) ile DB’yi webview tarafında açar.
- UI tamamen VS Code theme token’larıyla çizilir.

## Önemli Dosyalar
- `src/extension.ts`: webview yükleme, DB okuma/yazma, export işlemleri.
- `webview-ui/src/App.tsx`: tüm UI ve iş mantığı.
- `webview-ui/src/styles.css`: tüm layout/tema stilleri.
- `webview-ui/src/types.d.ts`: `sql.js` ve wasm url tipleri.
- `package.json`: extension metadata, contributes, scripts.
- `webview-ui/package.json`: webview build (Vite).
- `README.md`: kullanıcı dokümantasyonu.

## Temel Özellikler
- Custom editor: `.db/.sqlite/.sqlite3` açar.
- **Sol sidebar**: tablolar + kolonlar, context menu:
  - Add new table, Add column, Delete table.
- **Grid**
  - Zebra satırlar
  - Row actions (edit, pin, delete)
  - Pin row/column
  - Column filters (exact, non-empty, invert)
  - Shift ile multi-select
  - Double-click ile hücre düzenleme
- **Export / Copy**
  - CSV, TSV, JSON, HTML, Markdown, SQLite Insert
  - Copy: clipboard
  - Save as: DB klasörüne kaydeder
- **Right sidebar**: Selection details (başlangıçta kapalı)
- **Buy me a coffee**: sağ panel footer, QR + ağ seçimi (Solana/BTC/ETH/TRX)

## UI / Tema
- Renk, font, ölçülerin tamamı VS Code theme token’larından okunur.
- Hardcoded renk yok.

## Geliştirme / Build
- Extension build:
  - `npm run build`
- Webview dev:
  - `npm run dev:webview`
- Marketplace build:
  - `npm run build:publish`

## Publish Notları
- `package.json`
  - `name`: `sqlite-db-viewer`
  - `activationEvents` kaldırıldı (VS Code auto)
  - `categories`: `Data Science`
- `assets/icon.png` güncel logo.
- `README.md`, `CHANGELOG.md`, `LICENSE` hazır.

## Bilinen Hassas Noktalar
- DB işlemleri webview tarafında `sql.js` ile in-memory çalışır.
- Edit işlemleri ROWID gerektirir.
- Export/save işlemleri webview → extension mesajlaşmasıyla yapılır.

## Güncelleme Başlangıç Noktası
1. `webview-ui/src/App.tsx` (UI/logic)
2. `webview-ui/src/styles.css` (layout/tema)
3. `src/extension.ts` (dosya IO / messaging)
4. `README.md` (dokümantasyon)
