# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Partomate desktop tray app.
# Build the frontend first (cd frontend && npm run build), then on each OS:
#   venv/bin/pyinstaller partomate_desktop.spec --noconfirm
# macOS outputs dist/Partomate.app (menu-bar only, no Dock icon via LSUIElement).
# Windows outputs dist/Partomate/Partomate.exe (task-tray resident, no console).

import os
import sys

# Developer ID signing (macOS). Unset = unsigned/ad-hoc build (Windows, or local
# test builds). Set e.g. PARTOMATE_CODESIGN_IDENTITY="Developer ID Application: ... (TEAMID)"
CODESIGN_IDENTITY = os.environ.get('PARTOMATE_CODESIGN_IDENTITY')

a = Analysis(
    ['desktop_launcher.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('../frontend/dist', 'frontend_dist'),
        ('../assets/icon_mono', 'icon_mono'),
    ],
    hiddenimports=['passlib.handlers.bcrypt', 'backports.tarfile'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Partomate',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    icon='../assets/Partomate.ico' if sys.platform == 'win32' else None,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=CODESIGN_IDENTITY,
    entitlements_file='entitlements.plist' if CODESIGN_IDENTITY else None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='Partomate',
)
app = BUNDLE(
    coll,
    name='Partomate.app',
    icon='../assets/Partomate.icns',
    bundle_identifier='com.partomate.desktop',
    info_plist={
        # Menu-bar resident: hide from Dock and app switcher
        'LSUIElement': True,
        'NSHighResolutionCapable': True,
    },
)
