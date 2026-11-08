export { MobControlRoom } from './room.mjs';

const BASE_PATH = '/__phone';
const CLIENT_ASSET = /\.(?:html|js|css|svg)$/;

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === `${BASE_PATH}/ws`) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('WebSocket upgrade required', { status: 426 });
      }
      const room = url.searchParams.get('room');
      const role = url.searchParams.get('role');
      if (!room || (role !== 'game' && role !== 'phone')) {
        return new Response('room and role (game|phone) required', { status: 400 });
      }
      const id = env.MOBCONTROL_ROOMS.idFromName(room);
      return env.MOBCONTROL_ROOMS.get(id).fetch(request);
    }

    if (!url.pathname.startsWith(`${BASE_PATH}/`)) {
      return new Response('Not found', { status: 404 });
    }

    const assetPath = url.pathname.slice(BASE_PATH.length);
    url.pathname = assetPath === '/phone' ? '/phone.html' : assetPath;
    if (!CLIENT_ASSET.test(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }
    return env.CLIENT_ASSETS.fetch(new Request(url, request));
  }
};
