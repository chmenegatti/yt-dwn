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
npm run api        # porta 3005
npm run dev:api    # com hot reload
```

A porta pode ser alterada via variável de ambiente: `PORT=4000 npm run api`

O banco de dados SQLite é criado automaticamente em `data/videos.db`.

> A CLI com `-C` também registra no banco — o front-end enxerga downloads feitos tanto pela API quanto pela CLI.

### Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Status da API |
| GET | `/api/categories` | Lista as categorias disponíveis |
| GET | `/api/videos` | Lista vídeos (`?category=&status=`) |
| GET | `/api/videos/:id` | Detalhes de um vídeo |
| GET | `/api/videos/:id/events` | **SSE** — Eventos de progresso em tempo real |
| POST | `/api/videos` | Adiciona vídeo **ou playlist** e inicia download |
| DELETE | `/api/videos/:id` | Remove do banco (`?deleteFile=true` apaga o arquivo) |

### Corpo do POST `/api/videos`

Mesmas opções da CLI:

| Campo | Tipo | Obrig. | Default | Descrição |
|-------|------|--------|---------|----------|
| `url` | string | ✅ | — | URL de vídeo **ou playlist** |
| `category` | string | ✅ | — | `Histórias` · `Músicas` · `Educação` · `Desenhos` |
| `quality` | string | | `high` | `high` · `medium` · `low` |
| `audioOnly` | boolean | | `false` | Apenas áudio |
| `format` | string | | `mp4` | `mp4` · `mkv` · `webm` · `mp3` · `wav` · `aac` · `flac` |
| `subtitles` | boolean | | `false` | Baixar legendas |
| `subLang` | string | | `pt,en` | Idiomas das legendas |
| `concurrency` | number | | `3` | Downloads paralelos (playlist) |
| `fragments` | number | | `4` | Fragmentos paralelos por vídeo |
| `outputDir` | string | | `./downloads` | Diretório de saída |

### Exemplos

```bash
# Vídeo simples
curl -X POST http://localhost:3005/api/videos \
  -H "Content-Type: application/json" \
  -d '{"url":"https://youtu.be/VIDEO_ID","category":"Músicas","quality":"high"}'

# Playlist inteira (cria um registro por vídeo)
curl -X POST http://localhost:3005/api/videos \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/playlist?list=PLAYLIST_ID","category":"Educação","concurrency":4}'

# Listar vídeos concluídos
curl "http://localhost:3005/api/videos?category=Músicas&status=done"

# Remover vídeo e arquivo do disco
curl -X DELETE "http://localhost:3005/api/videos/1?deleteFile=true"
```

### Acompanhando o Progresso (SSE)

Para exibir uma barra de progresso em tempo real no front-end, conecte-se ao endpoint `/events`:

```javascript
const videoId = 1;
const eventSource = new EventSource(`http://localhost:3005/api/videos/${videoId}/events`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'progress') {
    console.log(`Progresso: ${data.percent}% | Vel: ${data.speed} | ETA: ${data.eta}`);
  } else if (data.type === 'log') {
    console.log(`[${data.level}] ${data.message}`);
  } else if (data.type === 'done' || data.type === 'error') {
    console.log('Download finalizado:', data);
    eventSource.close();
  }
};
```

> **Logs de Infraestrutura:** A API não armazena logs detalhados de extração no banco de dados. Os logs de progresso e FFmpeg são impressos em `stdout` no formato JSON, ideal para serem capturados e visualizados via stack como Promtail/Loki/Grafana.

### Status do vídeo


```
pending → downloading → done
                      ↘ error
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
