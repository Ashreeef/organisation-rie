"""Entry point for PyInstaller — launches the FastAPI app via uvicorn."""
from api.main import app  # noqa: F401 — explicit so PyInstaller collects the package
import uvicorn

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
