"""
Configuration management for RIE API.

Load configuration from environment variables with sensible defaults.
Environment variables override defaults.
"""
import os
from typing import List

class Settings:
    """Application settings from environment variables."""
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = ENVIRONMENT != "production"
    
    # API Configuration
    API_VERSION: str = "3.0.0"
    API_TITLE: str = "RIE BNP Paribas Forecasting API"
    API_DESCRIPTION: str = "Meal demand prediction and operational tracking"
    
    # CORS Configuration
    CORS_ORIGINS: List[str] = []
    
    @classmethod
    def get_cors_origins(cls) -> List[str]:
        """Get CORS origins based on environment."""
        if cls.ENVIRONMENT == "production":
            # Production: only specific domains from env var
            origins_str = os.getenv("CORS_ORIGINS", "")
            if not origins_str:
                raise ValueError(
                    "CORS_ORIGINS environment variable required in production. "
                    "Format: https://domain1.com,https://domain2.com"
                )
            return [origin.strip() for origin in origins_str.split(",") if origin.strip()]
        else:
            # Development: localhost allowed
            return [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:8000",  # Allow API to call itself
            ]
    
    # Security
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        "dev-secret-key-change-in-production"  # ⚠️ MUST be overridden in production
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    
    # API Keys (optional for simple auth)
    API_KEYS: List[str] = []
    
    @classmethod
    def get_api_keys(cls) -> List[str]:
        """Get valid API keys from environment."""
        keys_str = os.getenv("API_KEYS", "")
        return [k.strip() for k in keys_str.split(",") if k.strip()] if keys_str else []
    
    # Database (if migrated from file-based storage)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./rie.db"  # Default to SQLite for development
    )
    
    # Monitoring
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")  # Error tracking
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Features
    ENABLE_AUTHENTICATION: bool = os.getenv("ENABLE_AUTHENTICATION", "false").lower() == "true"
    ENABLE_MONITORING: bool = os.getenv("ENABLE_MONITORING", "true").lower() == "true"
    
    @classmethod
    def validate_production(cls) -> None:
        """Validate production settings."""
        if cls.ENVIRONMENT == "production":
            if cls.SECRET_KEY == "dev-secret-key-change-in-production":
                raise ValueError(
                    "FATAL: SECRET_KEY must be set in production! "
                    "Set via environment variable."
                )
            if not cls.get_cors_origins():
                raise ValueError(
                    "FATAL: CORS_ORIGINS must be configured in production"
                )
            print("✓ Production configuration validated")


settings = Settings()
