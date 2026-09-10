# -*- mode: python ; coding: utf-8 -*-
# rie-api.spec — PyInstaller spec for bundling FastAPI backend into rie-api.exe

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

block_cipher = None
ROOT = Path(SPECPATH)

a = Analysis(
    [str(ROOT / 'run_api.py')],
    pathex=[str(ROOT)],
    binaries=collect_dynamic_libs('xgboost') + collect_dynamic_libs('lightgbm') + collect_dynamic_libs('catboost'),
    datas=[
        # Collect all non-Python data from xgboost (VERSION, etc.)
        *collect_data_files('xgboost', include_py_files=False),
        # gettext locale files (.mo) required by the holidays library — without
        # these, holiday lookups crash with "No translation file found for domain: 'DZ'"
        *collect_data_files('holidays'),
        # Models (read-only, bundled in exe)
        (str(ROOT / 'models' / '_deployment.pkl'), 'models'),
        (str(ROOT / 'models' / 'office_presence_lgb.pkl'), 'models'),
        (str(ROOT / 'models' / 'menu_text_transformers.pkl'), 'models'),
        (str(ROOT / 'models' / 'lgb_models.pkl'), 'models'),
        (str(ROOT / 'models' / 'xgb_models.pkl'), 'models'),
        (str(ROOT / 'models' / 'catboost_models.pkl'), 'models'),
        # Menu catalog (used by src/menu_optimization/menu_catalog_py.py)
        (str(ROOT / 'src' / 'menu_optimization' / 'menu_catalog.json'), 'src/menu_optimization'),
        # Read-only reference data
        (str(ROOT / 'data' / 'processed' / 'features_train.csv'), 'data/processed'),
        (str(ROOT / 'data' / 'processed' / 'real_clean.csv'), 'data/processed'),
        (str(ROOT / 'data' / 'processed' / 'feature_list.txt'), 'data/processed'),
    ],
    hiddenimports=[
        'uvicorn',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'starlette',
        'starlette.middleware.cors',
        'pandas',
        'numpy',
        'scipy',
        'lightgbm',
        'xgboost',
        'catboost',
        'sklearn',
        'sklearn.utils._cython_blas',
        'sklearn.neighbors.typedefs',
        'sklearn.neighbors._partition_nodes',
        'src',
        'src.calendar_utils',
        'src.operational_calendar',
        'src.forecasting',
        'src.forecasting.daily_features',
        'src.menu_optimization',
        'src.menu_optimization.menu_catalog_py',
        'src.menu_optimization.menu_cleaning',
        'holidays',
        'holidays.registry',
        'holidays.countries',
        'holidays.countries.algeria',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'matplotlib', 'PIL', 'IPython', 'jupyter',
        'notebook', 'pytest', 'black',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='rie-api',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # console=False hangs the frozen app; Electron spawns with windowsHide:true
    icon=str(ROOT / 'electron' / 'assets' / 'icon.ico'),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='rie-api',
)
