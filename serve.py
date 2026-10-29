"""Serve the site locally with caching turned off, so a browser always loads the current pages and data.

    python serve.py [port]      (default 8765)
"""
import functools
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
handler = functools.partial(NoCache, directory=os.path.dirname(os.path.abspath(__file__)))
print(f"http://localhost:{port}/")
http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
