# yt-dwn Backend API: Integration Guide for Frontend Agent

Este documento serve como guia de integração para adaptar o projeto front-end, que atualmente lê vídeos locais da pasta `public/videos`, para consumir a nossa nova API RESTful do back-end (`yt-dwn`).

## 1. Configuração Base

A API roda por padrão em `http://localhost:3005`.

**Ação necessária no Front-end:**
- Adicione uma variável de ambiente (ex: `VITE_API_URL` ou `NEXT_PUBLIC_API_URL`) com o valor `http://localhost:3005/api`.
- Remova as lógicas de leitura local do diretório `public/videos`.

## 2. Listagem de Vídeos (Substituindo leitura de diretório local)

Em vez de listar arquivos físicos do disco, você agora buscará os metadados diretamente no banco de dados via API.

**Endpoint:** `GET /videos` (Ex: `http://localhost:3005/api/videos`)

**Parâmetros de Query (Opcionais):**
- `?category=Músicas` (Filtra por categoria)
- `?status=done` (Filtra por status: `pending` | `downloading` | `done` | `error`)

**Exemplo de Resposta:**
```json
{
  "ok": true,
  "data": [
    {
      "id": 1,
      "title": "Nome do Vídeo",
      "channel": "Nome do Canal",
      "category": "Educação",
      "file_path": "/caminho/absoluto/do/download/video.mp4",
      "duration": 520,
      "status": "done"
    }
  ],
  "total": 1
}
```

## 3. Streaming de Vídeo no Player HTML5 (Substituindo `src="/videos/..."`)

Para reproduzir os vídeos, **NÃO** deve-se tentar acessar o `file_path` diretamente via navegador (arquivos estão fora do escopo `public/`). Utilize o endpoint de streaming com suporte a HTTP Range 206, desenhado exatamente para a tag `<video>`.

**Ação necessária no Front-end:**
Na tag `<video>`, passe o endpoint `/stream` com o ID do vídeo retornado na listagem:

```html
<video controls width="100%">
  <!-- Em vez de /videos/meuvideo.mp4, faça: -->
  <source src="http://localhost:3005/api/videos/1/stream" type="video/mp4" />
</video>
```
*O back-end já gerencia carregamento por chunks e buffers.*

## 4. Baixar Novos Vídeos e Acompanhar Progresso (SSE)

O back-end baixa os vídeos em background com suporte a tracking em tempo real (Server-Sent Events).

### Passo 4.1: Iniciar Download
**Endpoint:** `POST /videos`
```typescript
fetch('http://localhost:3005/api/videos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: "https://youtu.be/...",
    category: "Músicas", // Obrigatório. Opções: Histórias, Músicas, Educação, Desenhos
    quality: "high"      // Opcional: high, medium, low
  })
}) // Retorna 202 Accepted imediatamente e inicia no servidor.
```

### Passo 4.2: Ouvir Eventos SSE para Barras de Progresso
Use a API nativa do navegador `EventSource` para ouvir eventos daquele vídeo específico.

```typescript
const startSseListener = (videoId: number) => {
  const eventSource = new EventSource(`http://localhost:3005/api/videos/${videoId}/events`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'progress') {
      // Atualizar barra de progresso no state
      // data.percent (0 a 100), data.speed, data.eta
      console.log(`Progresso: ${data.percent}%`);
    } else if (data.type === 'done') {
      // Vídeo pronto para assistir! Recarregar a listagem (Passo 2)
      eventSource.close();
    } else if (data.type === 'error') {
      eventSource.close();
    }
  };
};
```

## 5. Excluir Vídeos
Para remover vídeos da biblioteca, chame a API informando se deseja ou não deletar o arquivo em disco.

**Endpoint:** `DELETE /videos/:id?deleteFile=true`
```typescript
fetch('http://localhost:3005/api/videos/1?deleteFile=true', {
  method: 'DELETE'
});
```

## Resumo das Categorias Suportadas

O campo `category` é obrigatório na criação de novos downloads. Você pode criar abas ou filtros no Front-end usando-as:
- `Histórias`
- `Músicas`
- `Educação`
- `Desenhos`

> Dica ao Front-end Agent: Foque primeiro na Subseção 2 e 3 (Listar vídeos via API e injetar o Route `stream` no SRC dos `<video>` players). Quando estiver funcionando, puxe a feature de Adicionar Video + Progresso SSE.
