"""Partomate desktop launcher.

Runs the FastAPI backend (serving the built frontend) on localhost and puts an
icon in the macOS menu bar / Windows task tray with "Open in browser" and
"Quit" actions. Packaged with PyInstaller via partomate_desktop.spec.

Environment must be prepared BEFORE importing app.main, because database.py
and auth read DATABASE_URL / SECRET_KEY at import time.
"""

import json
import os
import secrets
import socket
import sys
import threading
import webbrowser

APP_NAME = "Partomate"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 18000

# Resolved in main() from env vars / config.json
HOST = DEFAULT_HOST
PORT = DEFAULT_PORT
URL = f"http://localhost:{DEFAULT_PORT}"

BUNDLE_ID = "com.partomate.desktop"
LAUNCH_AGENT_PATH = os.path.expanduser(
    f"~/Library/LaunchAgents/{BUNDLE_ID}.plist"
)
WINDOWS_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"

MESSAGES = {
    "ja": {
        "open": "ブラウザで開く",
        "autostart": "ログイン時に起動",
        "quit": "終了",
        "first_run_mac": "メニューバーのこのアイコンからいつでも開けます",
        "first_run_win": "タスクトレイのこのアイコンからいつでも開けます",
    },
    "en": {
        "open": "Open in browser",
        "autostart": "Start at login",
        "quit": "Quit",
        "first_run_mac": "You can open Partomate anytime from this menu bar icon",
        "first_run_win": "You can open Partomate anytime from this tray icon",
    },
}


def detect_language() -> str:
    """Return 'ja' or 'en' from the OS UI language.

    GUI apps on macOS don't inherit LANG, so read AppleLocale directly.
    """
    try:
        if os.name == "nt":
            import ctypes

            langid = ctypes.windll.kernel32.GetUserDefaultUILanguage()
            return "ja" if (langid & 0x3FF) == 0x11 else "en"
        if sys.platform == "darwin":
            import subprocess

            result = subprocess.run(
                ["defaults", "read", "-g", "AppleLocale"],
                capture_output=True, text=True, timeout=5,
            )
            return "ja" if result.stdout.strip().startswith("ja") else "en"
    except Exception:
        pass
    return "ja" if os.getenv("LANG", "").startswith("ja") else "en"


def launch_command() -> list:
    if getattr(sys, "frozen", False):
        return [sys.executable]
    return [sys.executable, os.path.abspath(__file__)]


def is_autostart_enabled() -> bool:
    if sys.platform == "darwin":
        return os.path.exists(LAUNCH_AGENT_PATH)
    if os.name == "nt":
        import winreg

        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, WINDOWS_RUN_KEY) as key:
                winreg.QueryValueEx(key, APP_NAME)
            return True
        except OSError:
            return False
    return False


def set_autostart(enabled: bool) -> None:
    if sys.platform == "darwin":
        if enabled:
            import plistlib

            os.makedirs(os.path.dirname(LAUNCH_AGENT_PATH), exist_ok=True)
            plist = {
                "Label": BUNDLE_ID,
                "ProgramArguments": launch_command(),
                "RunAtLoad": True,
            }
            with open(LAUNCH_AGENT_PATH, "wb") as f:
                plistlib.dump(plist, f)
        elif os.path.exists(LAUNCH_AGENT_PATH):
            os.remove(LAUNCH_AGENT_PATH)
    elif os.name == "nt":
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, WINDOWS_RUN_KEY, 0, winreg.KEY_SET_VALUE
        ) as key:
            if enabled:
                command = " ".join(f'"{part}"' for part in launch_command())
                winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, command)
            else:
                try:
                    winreg.DeleteValue(key, APP_NAME)
                except OSError:
                    pass


def get_data_dir() -> str:
    if sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
    elif os.name == "nt":
        base = os.getenv("APPDATA") or os.path.expanduser("~")
    else:
        base = os.getenv("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(base, APP_NAME)


def ensure_secret_key(data_dir: str) -> str:
    path = os.path.join(data_dir, "secret_key")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            value = f.read().strip()
        if value:
            return value
    value = secrets.token_urlsafe(48)
    with open(path, "w", encoding="utf-8") as f:
        f.write(value)
    os.chmod(path, 0o600)
    return value


def resource_path(relative: str) -> str:
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative)


def port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", PORT)) == 0


def load_config(data_dir: str) -> None:
    """Resolve HOST/PORT/URL from env vars, then config.json, then defaults.

    config.json in the data dir, e.g. {"host": "0.0.0.0", "port": 18000}.
    Binding a non-loopback host exposes the app to the network; the in-app
    allowed_hosts setting (server-side IP restriction) applies to those clients.
    """
    global HOST, PORT, URL
    config = {}
    try:
        with open(os.path.join(data_dir, "config.json"), "r", encoding="utf-8") as f:
            config = json.load(f)
    except FileNotFoundError:
        pass
    except (OSError, ValueError):
        pass  # broken config: fall back to defaults
    HOST = os.getenv("PARTOMATE_DESKTOP_HOST") or config.get("host") or DEFAULT_HOST
    try:
        PORT = int(os.getenv("PARTOMATE_DESKTOP_PORT") or config.get("port") or DEFAULT_PORT)
    except (TypeError, ValueError):
        PORT = DEFAULT_PORT
    URL = f"http://localhost:{PORT}"


def prepare_environment() -> None:
    data_dir = get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    os.environ.setdefault("PARTOMATE_DATA_DIR", data_dir)
    os.environ.setdefault("SECRET_KEY", ensure_secret_key(data_dir))
    os.environ.setdefault(
        "DATABASE_URL", f"sqlite:///{os.path.join(data_dir, 'partomate.db')}"
    )
    os.environ.setdefault(
        "PARTOMATE_UPLOADS_DIR", os.path.join(data_dir, "uploads")
    )
    static_dir = resource_path("frontend_dist")
    if os.path.isdir(static_dir):
        os.environ.setdefault("PARTOMATE_STATIC_DIR", static_dir)


def build_icon_image():
    """Fallback mark drawn with PIL, used only if the bundled PNGs are missing."""
    from PIL import Image, ImageDraw

    size = 64
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((4, 4, size - 4, size - 4), radius=14, fill=(52, 120, 246, 255))
    draw.line((22, 18, 22, 48), fill="white", width=6)
    draw.arc((20, 14, 46, 36), start=270, end=90, fill="white", width=6)
    return image


def _windows_taskbar_is_dark() -> bool:
    import winreg

    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
        ) as key:
            value, _ = winreg.QueryValueEx(key, "SystemUsesLightTheme")
        return value == 0
    except OSError:
        return True  # Windows 10/11 taskbar defaults to dark


def load_tray_image():
    from PIL import Image

    # macOS gets 36px (rendered as an 18pt retina template image);
    # Windows tray icons are effectively 32px
    filename = "tray-36.png" if sys.platform == "darwin" else "tray-32.png"
    candidates = (
        resource_path(os.path.join("icon_mono", filename)),
        os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..", "assets", "icon_mono", filename,
        ),
    )
    for path in candidates:
        if os.path.exists(path):
            image = Image.open(path).convert("RGBA")
            break
    else:
        return build_icon_image()
    if os.name == "nt" and _windows_taskbar_is_dark():
        # The glyph is black with alpha; repaint it white for the dark taskbar
        white = Image.new("RGBA", image.size, (255, 255, 255, 255))
        white.putalpha(image.getchannel("A"))
        image = white
    return image


def run_server_and_tray(first_run: bool = False) -> None:
    import uvicorn
    from app.main import app  # noqa: E402 (env must be set before this import)

    config = uvicorn.Config(app, host=HOST, port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    import pystray

    msg = MESSAGES[detect_language()]

    def on_open(icon, item):
        webbrowser.open(URL)

    def on_toggle_autostart(icon, item):
        set_autostart(not is_autostart_enabled())

    def on_quit(icon, item):
        server.should_exit = True
        icon.stop()

    icon_cls = pystray.Icon
    if sys.platform == "darwin":

        class _TemplateIcon(pystray.Icon):
            """Registers the glyph as a retina template NSImage so it follows
            the menu bar's light/dark appearance (pystray itself resizes to a
            non-retina, non-template image)."""

            def _assert_image(self):
                import io

                import AppKit
                import Foundation

                if self._icon_image is not None:
                    return
                buffer = io.BytesIO()
                self._icon.save(buffer, "png")
                self._icon_image = AppKit.NSImage.alloc().initWithData_(
                    Foundation.NSData(buffer.getvalue())
                )
                point_size = self._icon.width / 2  # 2x pixels for retina
                self._icon_image.setSize_((point_size, point_size))
                self._icon_image.setTemplate_(True)
                self._status_item.button().setImage_(self._icon_image)

        icon_cls = _TemplateIcon

    icon = icon_cls(
        APP_NAME,
        icon=load_tray_image(),
        title=APP_NAME,
        menu=pystray.Menu(
            pystray.MenuItem(msg["open"], on_open, default=True),
            pystray.MenuItem(
                msg["autostart"],
                on_toggle_autostart,
                checked=lambda item: is_autostart_enabled(),
            ),
            pystray.MenuItem(msg["quit"], on_quit),
        ),
    )
    def setup(icon):
        icon.visible = True
        if not first_run:
            return
        # First launch: open the browser once the server answers, and point
        # to the tray icon for next time (notification is best effort;
        # macOS shows it via Notification Center).
        import time

        for _ in range(60):
            if port_in_use():
                break
            time.sleep(0.5)
        webbrowser.open(URL)
        try:
            key = "first_run_mac" if sys.platform == "darwin" else "first_run_win"
            icon.notify(msg[key], APP_NAME)
        except Exception:
            pass

    # pystray requires the main thread on macOS
    icon.run(setup=setup)
    server.should_exit = True
    thread.join(timeout=10)


def main() -> None:
    # Windowed executables (PyInstaller console=False on Windows) run with
    # sys.stdout/stderr = None, which crashes uvicorn's logging formatter
    # (stdout.isatty()). Give them a sink before uvicorn is imported.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")
    data_dir = get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    load_config(data_dir)
    if port_in_use():
        # Another instance (or the dev backend) is already serving; just open it.
        webbrowser.open(URL)
        return
    first_run = not os.path.exists(os.path.join(data_dir, "partomate.db"))
    prepare_environment()
    run_server_and_tray(first_run=first_run)


if __name__ == "__main__":
    main()
