"""JWT validation against Supabase-issued access tokens.

Supabase Auth signs access tokens with JWT_SECRET (HS256) and embeds the
user id in `sub` and any custom claims (e.g. role) in `app_metadata` or
top-level claims depending on how they were set. `get_current_user` is the
shared dependency every other router uses to identify the caller — it does
NOT replace RLS, it just tells the API who's asking so it can act as that
user via the anon-key Supabase client (RLS still enforces what they can see).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from config import settings

router = APIRouter()
bearer_scheme = HTTPBearer()


class CurrentUser(BaseModel):
    id: str
    email: str | None = None
    role: str = "tourist"
    access_token: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject")

    role = (
        payload.get("user_metadata", {}).get("role")
        or payload.get("app_metadata", {}).get("role")
        or payload.get("role", "tourist")
    )

    return CurrentUser(id=user_id, email=payload.get("email"), role=role, access_token=token)


@router.get("/me")
async def me(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return current_user
