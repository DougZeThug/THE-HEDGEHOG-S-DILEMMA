import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Development only: the Memory Editor's "Save to repo". Theatre Studio's project state is POSTed
 * to /__memory/save and written to src/memory/theatre-state.json (stable formatting), which the
 * app imports and production plays. Local requests only; never part of a build.
 */
export function memorySave(root) {
  const file = join(root, 'src/memory/theatre-state.json');
  return {
    name: 'hedgehog-memory-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__memory/save', (req, res) => {
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
        if (req.method !== 'POST' || !local) {
          res.statusCode = 403;
          return res.end('local POST only');
        }
        let body = '';
        req.on('data', (c) => {
          body += c;
          if (body.length > 5e6) req.destroy();
        });
        req.on('end', () => {
          try {
            const state = JSON.parse(body);
            if (!state || typeof state !== 'object' || !state.sheetsById || !state.definitionVersion) throw new Error('not a Theatre project state');
            writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
    // Saving must not reload the room under the artist.
    handleHotUpdate({ file: f }) {
      if (f === file) return [];
    },
  };
}
