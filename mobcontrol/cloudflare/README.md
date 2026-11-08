# MobControl on Cloudflare

Deploy the MobControl relay as a Worker, then connect your Cloudflare Pages or Workers game to it with a service binding. Your game continues to serve its own files and handles MobControl requests at `/__phone/*` on the same HTTPS origin. The relay uses one hibernating Durable Object per pairing room. [Cloudflare WebSocket documentation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

## Deploy the relay

From the repository root, run:

```sh
npx wrangler deploy --config mobcontrol/cloudflare/wrangler.toml
```

If you installed the package, use `node_modules/mobcontrol/cloudflare/wrangler.toml` as the config path. Deploy the relay and the game in the same Cloudflare account. The relay is named `mobcontrol-relay` and is configured for access through the service binding. [Cloudflare service binding documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)

## Connect a Pages game

Add a service binding named `MOBCONTROL` targeting `mobcontrol-relay` in your Pages project's **Settings → Bindings**. In the Pages project, add `functions/__phone/[[path]].js`:

```js
export function onRequest({ env, request }) {
  return env.MOBCONTROL.fetch(request);
}
```

If your project has a custom `_routes.json`, include `/__phone/*` and make sure no exclusion covers it. Redeploy the Pages project after adding the binding and function. [Cloudflare Pages bindings documentation](https://developers.cloudflare.com/pages/functions/bindings/)

## Connect a Workers game

Add a service binding to the game's Wrangler configuration. In TOML:

```toml
[[services]]
binding = "MOBCONTROL"
service = "mobcontrol-relay"
```

Add this to the start of your game's existing `fetch` handler:

```js
if (new URL(request.url).pathname.startsWith('/__phone/')) {
  return env.MOBCONTROL.fetch(request);
}
```

If your game uses an asset fallback that could serve `/__phone/*`, ensure that these requests reach the handler by adding `"/__phone/*"` to `assets.run_worker_first`, or keep it set to `true` if already enabled. [Cloudflare static assets documentation](https://developers.cloudflare.com/workers/static-assets/binding/)

## Pair a phone

Use the normal browser integration in the [MobControl quick start](https://github.com/pwnsbd/mobControl#quick-start), importing `PhoneController` from `/__phone/controller.js`. Open the deployed game's HTTPS URL, scan its QR code on a phone, and confirm that your game responds to a configured button.
