"""Serve the prebuilt ORBYX game with Python's standard library only."""
import argparse
import functools
import http.server
import pathlib
import threading
import webbrowser


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    directory = pathlib.Path(__file__).resolve().parent / 'dist'
    if not (directory / 'index.html').is_file():
        raise SystemExit('Built game files are missing. Run pnpm install --frozen-lockfile, then pnpm build.')

    class Handler(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                          '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'}

        def end_headers(self):
            self.send_header('Cache-Control', 'no-cache')
            super().end_headers()

    handler = functools.partial(Handler, directory=str(directory))
    try:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError as exc:
        raise SystemExit(f'Cannot open port {args.port}: {exc}\n'
                         'Close the other ORBYX launcher and try again. '
                         'Keep the same port to retain the same browser profile location.') from exc
    url = f'http://localhost:{args.port}/'
    print(f'ORBYX Expedition is ready: {url}', flush=True)
    print('Keep this window open while playing. Press Ctrl+C to stop.', flush=True)
    if not args.no_browser:
        threading.Timer(.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nORBYX stopped.')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
