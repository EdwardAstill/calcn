import index from "./index.html"

const development = process.env.NODE_ENV !== "production"
const server = Bun.serve({
  port: Number(process.env.PORT) || 3100,
  development,
  routes: {
    "/": index,
    "/r/:name": async (request) => {
      const name = request.params.name
      if (!/^[a-z0-9-]+\.json$/.test(name)) {
        return new Response("Not found", { status: 404 })
      }
      const file = Bun.file(new URL(`../public/r/${name}`, import.meta.url))
      return await file.exists()
        ? new Response(file, { headers: { "Content-Type": "application/json" } })
        : new Response("Not found", { status: 404 })
    },
  },
})

console.log(`calcn running at http://localhost:${server.port}`)
