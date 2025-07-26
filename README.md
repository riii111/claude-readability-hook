# Claude Readability Hook

URLからクリーンなテキストコンテンツを抽出するマイクロサービス群で構成されたWebサービス

## プロジェクト構成

```
claude-readability-hook/
├── .mise.toml                 # Runtime manager configuration
├── apps/
│   ├── gateway/              # Node.js Gateway Service
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── biome.json
│   │   └── src/
│   └── extractor/            # Python Extractor Service
│       ├── requirements.txt
│       ├── pyproject.toml
│       └── app/
└── README.md
```

## 技術スタック

- **Node.js**: 22 LTS
- **Python**: 3.13
- **Runtime Manager**: mise
- **Gateway**: Fastify + TypeScript
- **Extractor**: FastAPI + Python

## セットアップ

1. mise をインストール
2. プロジェクトディレクトリで `mise install` を実行
3. 依存関係をインストール: `mise run install`

## 開発

- Gateway開発: `cd apps/gateway && npm run dev`
- Extractor開発: `cd apps/extractor && python -m uvicorn app.main:app --reload`
