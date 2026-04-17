from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Header, HTTPException, status

from ..auth import Actor, get_actor, get_bearer_token
from ..models import (
    GuardianResponseBody,
    GuardianResponseResult,
    RequestPermissionBody,
    RequestPermissionResponse,
    Role,
    UploadBody,
    UploadResponse,
)
from ..services.permission_service import (
    guardian_inbox,
    guardian_response,
    request_permission,
    upload_record,
)


router = APIRouter(tags=["guardian-permission"])


@router.post("/request-permission", response_model=RequestPermissionResponse)
def request_permission_endpoint(
    body: RequestPermissionBody,
    actor: Actor = Depends(get_actor),
) -> RequestPermissionResponse:
    if actor.role != Role.DOCTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="doctor role is required.")
    return request_permission(body, actor)


@router.post("/guardian-response", response_model=GuardianResponseResult)
def guardian_response_endpoint(
    body: GuardianResponseBody,
    actor: Actor = Depends(get_actor),
) -> GuardianResponseResult:
    if actor.role != Role.GUARDIAN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="guardian role is required.")
    return guardian_response(body, actor)


@router.post("/upload", response_model=UploadResponse)
def upload_endpoint(
    body: UploadBody,
    actor: Actor = Depends(get_actor),
    token: str = Depends(get_bearer_token),
) -> UploadResponse:
    if actor.role != Role.DOCTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="doctor role is required.")
    return upload_record(body=body, actor=actor, token=token)


@router.get("/guardian-inbox/{guardian_id}", response_model=List[Dict[str, Any]])
def guardian_inbox_endpoint(
    guardian_id: str,
    x_actor_id: str = Header(..., alias="X-Actor-Id"),
    x_role: str = Header(..., alias="X-Role"),
) -> List[Dict[str, Any]]:
    if x_role.strip().lower() != Role.GUARDIAN.value or x_actor_id != guardian_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="guardian role is required.")
    return guardian_inbox(guardian_id)
