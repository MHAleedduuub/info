const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function checkWinner(b) {
  for (const [a, c, d] of LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { p: b[a], line: [a, c, d] };
  }
  return b.every(Boolean) ? { p: "draw", line: null } : null;
}

function freshGame() {
  return { board: Array(9).fill(""), turn: "X", winner: null, line: null, score: { X: 0, O: 0 }, rematch: [] };
}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/init") {
      await this.state.storage.put("exists", true);
      await this.state.storage.put("game", freshGame());
      return new Response("ok");
    }

    if (url.pathname === "/info") {
      const exists = (await this.state.storage.get("exists")) === true;
      return Response.json({ exists });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    if (!(await this.state.storage.get("exists"))) {
      return new Response("room not found", { status: 404 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  seated() {
    return this.state.getWebSockets().filter(ws => ws.deserializeAttachment()?.symbol);
  }

  async game() {
    return (await this.state.storage.get("game")) || freshGame();
  }

  async stateMessage() {
    const g = await this.game();
    return {
      type: "state",
      board: g.board,
      turn: g.turn,
      winner: g.winner,
      line: g.line,
      score: g.score,
      players: this.seated().length,
      rematch: g.rematch.length
    };
  }

  async broadcast() {
    const msg = JSON.stringify(await this.stateMessage());
    for (const ws of this.state.getWebSockets()) ws.send(msg);
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === "join") return this.join(ws);
    if (msg.type === "move") return this.move(ws, msg.index);
    if (msg.type === "rematch") return this.rematch(ws);
  }

  async join(ws) {
    let symbol = ws.deserializeAttachment()?.symbol;

    if (!symbol) {
      const seated = this.seated();
      if (seated.length >= 2) return ws.send(JSON.stringify({ type: "error", error: "الغرفة ممتلئة" }));
      const taken = seated.map(w => w.deserializeAttachment().symbol);
      symbol = taken.includes("X") ? "O" : "X";
      ws.serializeAttachment({ symbol });
    }

    ws.send(JSON.stringify({ type: "joined", symbol, state: await this.stateMessage() }));
    await this.broadcast();
  }

  async move(ws, index) {
    const att = ws.deserializeAttachment();
    if (!att?.symbol || this.seated().length < 2) return;

    const g = await this.game();
    if (g.winner || g.turn !== att.symbol) return;
    if (!Number.isInteger(index) || index < 0 || index > 8 || g.board[index]) return;

    g.board[index] = att.symbol;
    const w = checkWinner(g.board);
    if (w) {
      g.winner = w.p;
      g.line = w.line;
      if (w.p !== "draw") g.score[w.p]++;
    } else {
      g.turn = att.symbol === "X" ? "O" : "X";
    }

    await this.state.storage.put("game", g);
    await this.broadcast();
  }

  async rematch(ws) {
    const att = ws.deserializeAttachment();
    const g = await this.game();
    if (!att?.symbol || !g.winner || this.seated().length < 2) return;

    if (!g.rematch.includes(att.symbol)) g.rematch.push(att.symbol);
    if (g.rematch.length >= 2) {
      const score = g.score;
      Object.assign(g, freshGame(), { score });
    }

    await this.state.storage.put("game", g);
    await this.broadcast();
  }

  async leave(ws) {
    const att = ws.deserializeAttachment();
    ws.serializeAttachment({});

    if (att?.symbol) {
      const g = await this.game();
      g.rematch = g.rematch.filter(s => s !== att.symbol);
      await this.state.storage.put("game", g);
    }
    await this.broadcast();
  }

  async webSocketClose(ws, code) {
    await this.leave(ws);
    try { ws.close(code, "closed"); } catch {}
  }

  async webSocketError(ws) {
    await this.leave(ws);
  }
}
