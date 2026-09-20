/** Independent reference applications. The pipeline sees only HTTP/browser observations. */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
const css = `*{box-sizing:border-box}body{margin:0;padding:48px 24px;background:#f5f6fa;color:#1a2333;font-family:Arial,sans-serif;font-size:16px;line-height:1.5}main{max-width:720px;margin:0 auto}h1{font-size:32px;margin:0 0 8px}p{margin:0 0 24px}form{display:flex;gap:12px;align-items:end;margin:20px 0}label{display:flex;flex-direction:column;gap:6px;flex:1;font-weight:600}input,textarea{font:inherit;border:1px solid #a8b2c5;border-radius:8px;background:white;padding:10px;width:100%}button{font:inherit;padding:10px 18px;background:#263db8;color:white;border:1px solid #263db8;border-radius:8px;cursor:pointer;white-space:nowrap}ul{list-style:none;padding:0;margin:24px 0;display:flex;flex-direction:column;gap:12px}li{display:flex;gap:16px;border:1px solid #d8deea;border-radius:12px;background:white;padding:18px}small{color:#56627a}.support{display:block}.support label{margin:16px 0}.support button{margin:8px 0}@media(max-width:600px){body{padding:24px 16px}form{flex-direction:column;align-items:stretch}label{min-width:0}input,textarea{min-width:0}h1{font-size:28px}}`;
const layout = (title: string, body: string, script: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${css}</style></head><body><main>${body}</main><script>${script}</script></body></html>`;
const api = `async function api(path,method='GET',body){const r=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});return r.status===204?null:r.json()}function show(rows,keys){const list=document.querySelector('ul');list.replaceChildren();for(const row of rows){const li=document.createElement('li');for(const key of keys){const span=document.createElement('span');span.textContent=row[key];li.append(span)}list.append(li)}}`;
const pages = {
  catalog: layout(
    "Fieldnotes catalog",
    `<h1>Fieldnotes catalog</h1><p>Useful tools for curious people.</p><form><label>Search products<input name="q" aria-label="Search products"></label><button type="submit">Search</button></form><ul aria-label="Products"></ul>`,
    `${api}async function load(){show(await api('/api/products'+(document.querySelector('input').value?'?q='+encodeURIComponent(document.querySelector('input').value):'')),['title','price'])}document.querySelector('form').onsubmit=e=>{e.preventDefault();load()};load();`,
  ),
  contacts: layout(
    "Team contacts",
    `<h1>Team contacts</h1><p>A small address book with a complete lifecycle.</p><form id="add"><label>New contact name<input name="name" aria-label="New contact name" required></label><button type="submit">Add contact</button></form><form id="update"><label>Update contact ID<input name="id" aria-label="Update contact ID" required></label><label>Updated name<input name="name" aria-label="Updated name" required></label><button type="submit">Update contact</button></form><form id="delete"><label>Delete contact ID<input name="id" aria-label="Delete contact ID" required></label><button type="submit">Delete contact</button></form><ul aria-label="Contacts"></ul>`,
    `${api}async function load(){show(await api('/api/contacts'),['id','name'])}for(const [id,method]of [['add','POST'],['update','PATCH'],['delete','DELETE']]){document.getElementById(id).onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);await api('/api/contacts'+(id==='add'?'':'/'+data.get('id')),method,id==='delete'?{}:{name:data.get('name')});await load()}}load();`,
  ),
  support: layout(
    "Contact support",
    `<h1>Contact support</h1><p>Tell us what happened. We will assign a ticket.</p><form class="support"><label>Email<input name="email" type="email" aria-label="Email" required></label><label>Message<textarea name="message" aria-label="Message" required></textarea></label><button type="submit">Send ticket</button></form><p id="confirmation" aria-label="Ticket confirmation"></p>`,
    `${api}document.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.target);const result=await api('/api/tickets','POST',Object.fromEntries(form));document.getElementById('confirmation').textContent=result.ticket};`,
  ),
};
const string = { type: "string" };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
});
const operation = (summary: string, response: unknown, body?: unknown) => ({
  summary,
  security: [],
  ...(body
    ? {
        requestBody: {
          required: true,
          content: { "application/json": { schema: body } },
        },
      }
    : {}),
  responses: {
    "200": { content: { "application/json": { schema: response } } },
  },
});
const contacts = object({ id: string, name: string });
const specs = {
  catalog: {
    "/api/products": {
      get: {
        ...operation("Search products", {
          type: "array",
          items: object({ title: string, price: string }),
        }),
        parameters: [{ name: "q", in: "query", schema: string }],
      },
    },
  },
  contacts: {
    "/api/contacts": {
      get: operation("List contacts", { type: "array", items: contacts }),
      post: operation("Create contact", contacts, object({ name: string })),
    },
    "/api/contacts/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: string }],
      patch: operation("Update contact", contacts, object({ name: string })),
      delete: operation("Delete contact", {}),
    },
  },
  support: {
    "/api/tickets": {
      post: operation(
        "Create support ticket",
        object({ ticket: string }),
        object({ email: string, message: string }),
      ),
    },
  },
};
export async function startDemoTarget() {
  const sessions = new Map<string, { id: string; name: string }[]>();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const route = url.pathname.slice(1) as keyof typeof pages;
      if (req.method === "GET" && pages[route]) {
        res.writeHead(200, { "content-type": "text/html" }).end(pages[route]);
        return;
      }
      const spec = url.pathname.replace("/openapi/", "") as keyof typeof specs;
      if (url.pathname.startsWith("/openapi/") && specs[spec]) {
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ openapi: "3.0.3", paths: specs[spec] }));
        return;
      }
      let sid = req.headers.cookie?.match(/clean_demo=([a-z0-9-]+)/)?.[1];
      if (!sid || !sessions.has(sid)) {
        sid = randomUUID();
        sessions.set(sid, [
          { id: "1", name: "Ada" },
          { id: "2", name: "Linus" },
        ]);
        res.setHeader(
          "set-cookie",
          `clean_demo=${sid}; HttpOnly; SameSite=Strict; Path=/`,
        );
      }
      const rows = sessions.get(sid)!;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {};
      let value: unknown;
      let status = 200;
      if (url.pathname === "/api/products" && req.method === "GET")
        value = [
          { title: "Cloud notebook", price: "$12" },
          { title: "Orbit pencil", price: "$4" },
          { title: "Field bag", price: "$36" },
        ].filter((p) =>
          p.title
            .toLowerCase()
            .includes((url.searchParams.get("q") || "").toLowerCase()),
        );
      else if (url.pathname === "/api/contacts" && req.method === "GET")
        value = rows;
      else if (url.pathname === "/api/contacts" && req.method === "POST") {
        value = { id: String(rows.length + 1), name: body.name };
        rows.push(value as (typeof rows)[number]);
        status = 201;
      } else if (/^\/api\/contacts\/[^/]+$/.test(url.pathname)) {
        const index = rows.findIndex(
          (c) => c.id === url.pathname.split("/").at(-1),
        );
        if (index < 0) {
          status = 404;
          value = { error: "Contact missing" };
        } else if (req.method === "PATCH") {
          rows[index].name = body.name;
          value = rows[index];
        } else if (req.method === "DELETE") {
          rows.splice(index, 1);
          status = 204;
          value = null;
        } else {
          status = 405;
          value = { error: "Method not allowed" };
        }
      } else if (url.pathname === "/api/tickets" && req.method === "POST") {
        status = 201;
        value = { ticket: "S-101" };
      } else {
        status = 404;
        value = { error: "Unknown endpoint" };
      }
      res
        .writeHead(status, {
          "content-type": "application/json",
          "cache-control": "no-store",
        })
        .end(status === 204 ? "" : JSON.stringify(value));
    } catch {
      res
        .writeHead(400, { "content-type": "application/json" })
        .end('{"error":"Invalid request"}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Demo target did not start.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}
