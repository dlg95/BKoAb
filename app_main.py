"""Entry point for the bundled macOS .app.

Starts the local FastAPI server on a free port and opens the browser.
Quit via Dock (Quit) or POST /api/shutdown.
"""

from __future__ import annotations

import os
import socket
import threading
import webbrowser


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    import uvicorn
    from bkoab.main import app

    port = int(os.environ.get("BKOAB_PORT") or _free_port())
    url = f"http://127.0.0.1:{port}"
    print(f"BKoAb: {url}", flush=True)
    if not os.environ.get("BKOAB_NO_BROWSER"):
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
