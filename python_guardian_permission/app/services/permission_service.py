import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import HTTPException, status

from .. import db
from ..auth import Actor
from ..models import (
    GuardianResponseBody,
    GuardianResponseResult,
    NotificationPayload,
    RequestPermissionBody,
    RequestPermissionResponse,
    UploadBody,
    UploadResponse,
)


def _parse_iso(ts: str) -> datetime:
    return datetime.fromisoformat(ts)


def _guardian_notification_payload(
    request_id: str,
    patient: Dict[str, str],
    doctor: Dict[str, str],
) -> NotificationPayload:
    return NotificationPayload(
        request_id=request_id,
        patient=patient,
        doctor=doctor,
        actions=["ALLOW", "DENY"],
    )


def request_permission(body: RequestPermissionBody, actor: Actor) -> RequestPermissionResponse:
    if actor.actor_id != body.doctor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor can only request permission for own identity.",
        )

    patient = db.fetch_patient(body.patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    request_id = f"req_{uuid4().hex[:12]}"

    if not patient["unconscious"]:
        db.create_permission_request(
            request_id=request_id,
            patient_id=body.patient_id,
            doctor_id=body.doctor_id,
            doctor_name=body.doctor_name,
            reason=body.reason,
            status="DENIED_PATIENT_CONSCIOUS",
        )
        db.update_request_status(request_id, "DENIED_PATIENT_CONSCIOUS", resolved=True)
        db.write_audit_log(
            "permission_request_denied_patient_conscious",
            actor_id=actor.actor_id,
            actor_role=actor.role.value,
            details={"request_id": request_id, "patient_id": body.patient_id},
        )
        return RequestPermissionResponse(
            request_id=request_id,
            status="DENIED_PATIENT_CONSCIOUS",
            message="Patient is conscious. Guardian emergency flow is not applicable.",
            notifications=[],
        )

    db.create_permission_request(
        request_id=request_id,
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
        doctor_name=body.doctor_name,
        reason=body.reason,
        status="PENDING_GUARDIAN_APPROVAL",
    )

    notifications: List[NotificationPayload] = []
    for guardian_id in patient["guardian_ids"][:3]:
        payload = _guardian_notification_payload(
            request_id=request_id,
            patient={"id": patient["id"], "name": patient["name"], "unconscious": patient["unconscious"]},
            doctor={"id": body.doctor_id, "name": body.doctor_name, "reason": body.reason},
        )
        db.save_notification(request_id=request_id, guardian_id=guardian_id, payload=payload.model_dump())
        notifications.append(payload)

    db.write_audit_log(
        "permission_requested",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={
            "request_id": request_id,
            "patient_id": body.patient_id,
            "guardians_notified": patient["guardian_ids"][:3],
        },
    )

    return RequestPermissionResponse(
        request_id=request_id,
        status="PENDING_GUARDIAN_APPROVAL",
        message="Guardians notified. Waiting for responses.",
        notifications=notifications,
    )


def guardian_response(body: GuardianResponseBody, actor: Actor) -> GuardianResponseResult:
    if actor.actor_id != body.guardian_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Guardian can only respond using own identity.",
        )

    request = db.fetch_request(body.request_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")

    if request["status"] in {"APPROVED", "DENIED", "DENIED_PATIENT_CONSCIOUS"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Request already resolved with status {request['status']}.",
        )

    patient = db.fetch_patient(request["patient_id"])
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    if body.guardian_id not in patient["guardian_ids"][:3]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Guardian is not authorized for this patient.",
        )

    db.save_guardian_response(
        request_id=body.request_id,
        guardian_id=body.guardian_id,
        action=body.action.value,
        message=body.message,
    )

    responses = db.fetch_guardian_responses(body.request_id)
    has_allow = any(r["action"] == "ALLOW" for r in responses)

    if has_allow:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.create_upload_token(
            token=token,
            request_id=body.request_id,
            doctor_id=request["doctor_id"],
            patient_id=request["patient_id"],
            expires_at=expires_at.isoformat(),
        )
        db.update_request_status(body.request_id, "APPROVED", resolved=True)
        db.write_audit_log(
            "guardian_approved",
            actor_id=actor.actor_id,
            actor_role=actor.role.value,
            details={"request_id": body.request_id, "token_expires_at": expires_at.isoformat()},
        )
        return GuardianResponseResult(
            request_id=body.request_id,
            status="APPROVED",
            token=token,
            token_expires_at=expires_at,
            message="At least one guardian approved. Upload token issued for 15 minutes.",
        )

    guardians_required = set(patient["guardian_ids"][:3])
    responded_guardians = {r["guardian_id"] for r in responses}

    if guardians_required.issubset(responded_guardians):
        db.update_request_status(body.request_id, "DENIED", resolved=True)
        db.write_audit_log(
            "guardian_denied",
            actor_id=actor.actor_id,
            actor_role=actor.role.value,
            details={"request_id": body.request_id, "reason": "all_guardians_denied"},
        )
        return GuardianResponseResult(
            request_id=body.request_id,
            status="DENIED",
            message="All guardians denied. Upload access not granted.",
        )

    db.write_audit_log(
        "guardian_response_recorded",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={"request_id": body.request_id, "action": body.action.value},
    )
    return GuardianResponseResult(
        request_id=body.request_id,
        status="PENDING_GUARDIAN_APPROVAL",
        message="Response recorded. Waiting for remaining guardians.",
    )


def validate_upload_token(token: str, doctor_id: str, patient_id: str) -> Dict[str, str]:
    token_row = db.fetch_upload_token(token)
    if not token_row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")

    if int(token_row["is_active"]) != 1:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token is inactive.")

    if token_row["doctor_id"] != doctor_id or token_row["patient_id"] != patient_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token does not match doctor or patient.",
        )

    if _parse_iso(token_row["expires_at"]) <= datetime.now(timezone.utc):
        db.deactivate_token(token)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired.")

    return token_row


def upload_record(body: UploadBody, actor: Actor, token: str) -> UploadResponse:
    if actor.actor_id != body.doctor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor can only upload with own identity.",
        )

    validate_upload_token(token=token, doctor_id=body.doctor_id, patient_id=body.patient_id)

    upload_id = f"upl_{uuid4().hex[:12]}"
    db.save_upload(
        upload_id=upload_id,
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
        record_type=body.record_type,
        title=body.title,
        content=body.content,
    )
    db.deactivate_token(token)

    db.write_audit_log(
        "record_uploaded",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={"upload_id": upload_id, "patient_id": body.patient_id, "doctor_id": body.doctor_id},
    )

    return UploadResponse(
        upload_id=upload_id,
        status="SUCCESS",
        message="Record uploaded successfully using guardian-approved token.",
    )


def guardian_inbox(guardian_id: str) -> List[Dict[str, str]]:
    return db.fetch_guardian_notifications(guardian_id)
