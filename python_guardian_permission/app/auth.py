from typing import Callable

from fastapi import Header, HTTPException, status

from .models import Role


class Actor:
    def __init__(self, actor_id: str, role: Role) -> None:
        self.actor_id = actor_id
        self.role = role


def get_actor(
    x_actor_id: str = Header(..., alias="X-Actor-Id"),
    x_role: str = Header(..., alias="X-Role"),
) -> Actor:
    try:
        role = Role(x_role.strip().lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid role. Use doctor or guardian.",
        ) from exc

    actor_id = x_actor_id.strip()
    if not actor_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Actor-Id header is required.",
        )
    return Actor(actor_id=actor_id, role=role)


def require_role(required_role: Role) -> Callable[[Actor], Actor]:
    def _check(actor: Actor) -> Actor:
        if actor.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"{required_role.value} role is required.",
            )
        return actor

    return _check


def get_bearer_token(authorization: str = Header(..., alias="Authorization")) -> str:
    scheme_prefix = "Bearer "
    if not authorization.startswith(scheme_prefix):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must use Bearer token.",
        )
    token = authorization[len(scheme_prefix) :].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token is missing.",
        )
    return token
