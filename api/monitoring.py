"""
Monitoring and observability for RIE API.

Provides:
- Structured logging with correlation IDs
- Request/response middleware for audit trails
- Performance metrics
- Error tracking integration points
"""
import logging
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from .config import settings

# Structured logger for events
event_logger = logging.getLogger("rie.events")
perf_logger = logging.getLogger("rie.performance")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Add correlation ID and request context to all requests."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate or get correlation ID
        correlation_id = request.headers.get(
            "X-Correlation-ID",
            str(uuid.uuid4())
        )
        
        # Store in request state for access in endpoints
        request.state.correlation_id = correlation_id
        request.state.start_time = time.time()
        
        # Add to response header
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        
        return response


class PerformanceLoggingMiddleware(BaseHTTPMiddleware):
    """Log request/response metrics for monitoring."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        method = request.method
        
        # Skip health checks from verbose logging
        if path == "/api/health":
            return await call_next(request)
        
        start_time = time.time()
        
        try:
            response = await call_next(request)
            duration_ms = (time.time() - start_time) * 1000
            
            perf_logger.info(
                f"request_completed",
                extra={
                    "method": method,
                    "path": path,
                    "status": response.status_code,
                    "duration_ms": round(duration_ms, 2),
                    "correlation_id": getattr(request.state, "correlation_id", "unknown"),
                }
            )
            
            return response
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            perf_logger.error(
                f"request_failed",
                extra={
                    "method": method,
                    "path": path,
                    "error": str(e),
                    "duration_ms": round(duration_ms, 2),
                    "correlation_id": getattr(request.state, "correlation_id", "unknown"),
                }
            )
            raise


def setup_sentry_if_configured():
    """Initialize Sentry for error tracking if DSN is configured."""
    if not settings.SENTRY_DSN:
        return
    
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
            ],
            traces_sample_rate=1.0 if settings.DEBUG else 0.1,
            environment=settings.ENVIRONMENT,
        )
        logging.info("✓ Sentry initialized for error tracking")
    except ImportError:
        logging.warning("sentry_sdk not installed, skipping Sentry setup")


class StructuredLogFormatter(logging.Formatter):
    """Format logs as structured JSON for better parsing."""
    
    def format(self, record: logging.LogRecord) -> str:
        # This is a simple formatter; in production, use python-json-logger
        log_data = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # Add extra fields if present
        if hasattr(record, "method"):
            log_data["method"] = record.method
        if hasattr(record, "path"):
            log_data["path"] = record.path
        if hasattr(record, "status"):
            log_data["status"] = record.status
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "correlation_id"):
            log_data["correlation_id"] = record.correlation_id
        
        return str(log_data)


def setup_logging():
    """Configure structured logging."""
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(settings.LOG_LEVEL)
    
    # Console handler with structured formatting
    console_handler = logging.StreamHandler()
    if settings.ENVIRONMENT == "production":
        formatter = StructuredLogFormatter()
    else:
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    logging.info(f"✓ Logging initialized (level={settings.LOG_LEVEL}, env={settings.ENVIRONMENT})")


def log_event(event: str, data: dict = None, level: str = "info"):
    """Log a structured event."""
    log_func = getattr(event_logger, level.lower(), event_logger.info)
    log_func(f"event: {event}", extra=data or {})
