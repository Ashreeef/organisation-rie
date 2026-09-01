"""
Security and authentication for RIE API.

Supports two authentication modes:
1. API Key authentication (simple, for CI/CD or service-to-service)
2. JWT Bearer token (OAuth2-style, for frontend applications)
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthCredentials
from jwt import encode, decode, InvalidTokenError
import jwt as pyjwt

from .config import settings

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


class APIKeyAuth:
    """Simple API Key authentication."""
    
    @staticmethod
    def validate_api_key(api_key: str) -> bool:
        """Check if API key is valid."""
        valid_keys = settings.get_api_keys()
        if not valid_keys:
            # No API keys configured, skip validation
            return True
        return api_key in valid_keys


class JWTAuth:
    """JWT-based authentication (OAuth2 style)."""
    
    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create a JWT access token."""
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.now(timezone.utc) + expires_delta
        else:
            expire = datetime.now(timezone.utc) + timedelta(
                minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
            )
        
        to_encode.update({"exp": expire})
        
        encoded_jwt = encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )
        return encoded_jwt
    
    @staticmethod
    def verify_token(token: str) -> dict:
        """Verify and decode JWT token."""
        try:
            payload = decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM]
            )
            return payload
        except InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )


async def verify_api_key_or_token(
    credentials: Optional[HTTPAuthCredentials] = Depends(security)
) -> dict:
    """
    Verify either API Key or JWT Bearer token.
    
    Priority:
    1. If authentication is disabled, allow all requests
    2. If Authorization header present, validate as Bearer token
    3. Otherwise, raise 403
    """
    if not settings.ENABLE_AUTHENTICATION:
        # Authentication disabled
        return {"sub": "anonymous", "type": "none"}
    
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authentication required",
        )
    
    # Check if it's a Bearer token or API key
    scheme = credentials.scheme.lower()
    token = credentials.credentials
    
    if scheme == "bearer":
        # JWT token validation
        payload = JWTAuth.verify_token(token)
        logger.debug(f"User authenticated: {payload.get('sub')}")
        return payload
    else:
        # API Key validation
        if not APIKeyAuth.validate_api_key(token):
            logger.warning(f"Invalid API key attempted")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid API key",
            )
        logger.debug("API key authenticated")
        return {"sub": "api_client", "type": "api_key"}


def optional_auth(
    credentials: Optional[HTTPAuthCredentials] = Depends(security)
) -> dict:
    """
    Optional authentication (doesn't require auth, but validates if provided).
    
    Useful for endpoints that should work with or without authentication.
    """
    if not credentials:
        return {"sub": "anonymous", "type": "none"}
    
    try:
        return verify_api_key_or_token(credentials)
    except HTTPException:
        # Invalid credentials, but auth is optional, so allow anyway
        logger.debug("Invalid credentials provided, but authentication is optional")
        return {"sub": "anonymous", "type": "none"}


def create_test_token(user_id: str = "test_user") -> str:
    """Create a test JWT token (for development only)."""
    return JWTAuth.create_access_token({"sub": user_id, "type": "test"})
