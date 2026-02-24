# yt-dwn 🎬

CLI para download de vídeos do YouTube com suporte a playlists, conversão de formatos, legendas, interface interativa e **API REST** para integração com front-end.

## Pré-requisitos

- **Node.js** >= 18
- **yt-dlp** — instalado no sistema ([instruções](https://github.com/yt-dlp/yt-dlp#installation))
- **ffmpeg** — para conversão de formatos ([instruções](https://ffmpeg.org/download.html))

## Instalação

```bash
cd yt-dwn
npm install

# (Opcional) Instalar globalmente
npm link
```

## Uso — CLI

### Download simples

```bash
# Alta qualidade
node bin/yt-dwn.js 'https://www.youtube.com/watch?v=VIDEO_ID'

# Apenas áudio (MP3)
node bin/yt-dwn.js -a 'https://youtu.be/VIDEO_ID'

# Qualidade média, formato MKV
node bin/yt-dwn.js -q medium -f mkv 'https://www.youtube.com/watch?v=VIDEO_ID'

# Com legendas
node bin/yt-dwn.js -s --sub-lang pt,en 'https://www.youtube.com/watch?v=VIDEO_ID'
```

### Categorias de download

Use `-C` para organizar os downloads em categorias. Estrutura gerada:

```
downloads/
  Músicas/
    Nome_do_Canal/
      video.mp4
  Educação/
    Nome_do_Canal/
      video.mp4
```

```bash
# Vídeo categorizado
node bin/yt-dwn.js -C Músicas 'https://youtu.be/VIDEO_ID'

# Playlist categorizada
node bin/yt-dwn.js -C Educação playlist 'https://www.youtube.com/playlist?list=PLAYLIST_ID'

# Batch categorizado
node bin/yt-dwn.js -C Desenhos batch urls.json
```

**Categorias válidas:** `Histórias` · `Músicas` · `Educação` · `Desenhos`

### Download em lote

Crie um arquivo JSON com URLs:

```json
[
  "https://www.youtube.com/watch?v=VIDEO_ID_1",
  "https://www.youtube.com/watch?v=VIDEO_ID_2",
  {
    "url": "https://www.youtube.com/watch?v=VIDEO_ID_3",
    "quality": "low",
    "audioOnly": true
  }
]
```

```bash
node bin/yt-dwn.js batch urls.json

# Batch com 5 downloads simultâneos
node bin/yt-dwn.js -c 5 batch urls.json
```

### Download de playlist

```bash
node bin/yt-dwn.js playlist 'https://www.youtube.com/playlist?list=PLAYLIST_ID'

# Com 4 downloads paralelos
node bin/yt-dwn.js -c 4 playlist 'https://www.youtube.com/playlist?list=PLAYLIST_ID'
```

### Outros comandos

```bash
# Metadados do vídeo
node bin/yt-dwn.js info 'https://www.youtube.com/watch?v=VIDEO_ID'

# Legendas
node bin/yt-dwn.js subs 'https://www.youtube.com/watch?v=VIDEO_ID'

# Converter formato
node bin/yt-dwn.js convert video.mp4 mkv

# Modo interativo
node bin/yt-dwn.js interactive   # ou: node bin/yt-dwn.js i
```

## Opções Globais

| Flag | Descrição | Default |
|------|-----------|---------|
| `-q, --quality <nivel>` | `high`, `medium`, `low` | `high` |
| `-a, --audio-only` | Apenas áudio | `false` |
| `-f, --format <fmt>` | `mp4`, `mkv`, `webm`, `mp3`, `wav`, `aac`, `flac` | `mp4` |
| `-o, --output <dir>` | Diretório de saída | `./downloads` |
| `-C, --category <cat>` | Categoria: `Histórias`, `Músicas`, `Educação`, `Desenhos` | — |
| `-s, --subtitles` | Baixar legendas junto | `false` |
| `--sub-lang <lang>` | Idioma das legendas | `pt,en` |
| `-c, --concurrency <n>` | Downloads paralelos (batch/playlist) | `3` |
| `--fragments <n>` | Fragmentos paralelos por vídeo | `4` |

## Comandos

| Comando | Descrição |
|---------|-----------|
| `<url>` | Download de vídeo/áudio |
| `batch <json>` | Download em lote |
| `playlist <url>` | Download de playlist |
| `info <url>` | Metadados do vídeo |
| `subs <url>` | Baixar legendas |
| `convert <arquivo> <fmt>` | Converter formato |
| `interactive` / `i` | Modo interativo |

## ⚡ Performance

- **`--fragments`** — cada vídeo é baixado em N segmentos simultâneos (padrão 4)
- **`-c, --concurrency`** — batch e playlist baixam N vídeos ao mesmo tempo (padrão 3)

```bash
# Download mais rápido com 8 fragmentos
node bin/yt-dwn.js --fragments 8 'URL'

# Batch agressivo: 5 vídeos × 6 fragmentos
node bin/yt-dwn.js -c 5 --fragments 6 batch urls.json
```

> **Nota:** valores muito altos podem causar throttling pelo YouTube. Recomendado: `-c 3-5` e `--fragments 4-8`.

---

## API REST

A API permite que um front-end gerencie e acompanhe os vídeos baixados.

### Iniciar

```bash
npm run api        # porta 3000
npm run dev:api    # com hot reload
```

A porta pode ser alterada via variável de ambiente: `PORT=4000 npm run api`

O banco de dados SQLite é criado automaticamente em `data/videos.db`.

### Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Status da API |
| GET | `/api/categories` | Lista as categorias disponíveis |
| GET | `/api/videos` | Lista vídeos (`?category=&status=`) |
| GET | `/api/videos/:id` | Detalhes de um vídeo |
| POST | `/api/videos` | Adiciona vídeo e inicia download |
| DELETE | `/api/videos/:id` | Remove do banco (`?deleteFile=true` apaga o arquivo) |

### Exemplos

```bash
# Listar categorias
curl http://localhost:3000/api/categories

# Iniciar download (resposta imediata 202, download em background)
curl -X POST http://localhost:3000/api/videos \
  -H "Content-Type: application/json" \
  -d '{"url":"https://youtu.be/VIDEO_ID","category":"Músicas","quality":"high"}'

# Listar vídeos concluídos de uma categoria
curl "http://localhost:3000/api/videos?category=Músicas&status=done"

# Remover vídeo e arquivo do disco
curl -X DELETE "http://localhost:3000/api/videos/1?deleteFile=true"
```

### Status do vídeo

Um vídeo passa pelos seguintes estados após o `POST`:

```
pending → downloading → done
                      ↘ error
```

### Corpo do POST `/api/videos`

```json
{
  "url":      "https://youtu.be/VIDEO_ID",  // obrigatório
  "category": "Músicas",                    // obrigatório
  "quality":  "high",                       // opcional (high | medium | low)
  "format":   "mp4",                        // opcional
  "audioOnly": false                        // opcional
}
```

---

## Formatos de URL suportados

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `https://m.youtube.com/watch?v=VIDEO_ID`
- `https://music.youtube.com/watch?v=VIDEO_ID`
- `https://www.youtube.com/playlist?list=PLAYLIST_ID`

## Configuração do yt-dlp

O binário `yt-dlp` é procurado nesta ordem:

1. Variável de ambiente `YTDLP_PATH`
2. `~/.local/bin/yt-dlp`
3. `/usr/local/bin/yt-dlp`
4. `/usr/bin/yt-dlp`
5. Resultado de `which yt-dlp`

## Licença

ISC
