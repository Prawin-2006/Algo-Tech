from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Role(str, Enum):
    DOCTOR = "doctor"
    GUARDIAN = "guardian"


class GuardianAction(str, Enum):
    ALLOW = "ALLOW"
    DENY = "DENY"


class RequestPermissionBody(BaseModel):
    patient_id: str = Field(..., examples=["patient_001"])
    doctor_id: str = Field(..., examples=["doctor_001"])
    doctor_name: str = Field(..., examples=["Dr. Sarah Khan"])
    reason: str = Field(..., min_length=3, examples=["Emergency trauma upload"])


class GuardianResponseBody(BaseModel):
    request_id: str = Field(..., examples=["req_123"])
    guardian_id: str = Field(..., examples=["guardian_001"])
    action: GuardianAction
    message: Optional[str] = Field(default=None, examples=["Approved for emergency care."])


class UploadBody(BaseModel):
    patient_id: str = Field(..., examples=["patient_001"])
    doctor_id: str = Field(..., examples=["doctor_001"])
    record_type: str = Field(..., examples=["lab-report"])
    title: str = Field(..., examples=["CBC Report"])
    content: Dict[str, Any] = Field(..., examples=[{"hemoglobin": "12.8 g/dL"}])


class NotificationPayload(BaseModel):
    request_id: str
    patient: Dict[str, Any]
    doctor: Dict[str, Any]
    actions: List[str] = Field(default_factory=lambda: ["ALLOW", "DENY"])


class RequestPermissionResponse(BaseModel):
    request_id: str
    status: str
    message: str
    notifications: List[NotificationPayload]


class GuardianResponseResult(BaseModel):
    request_id: str
    status: str
    token: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    message: str


class UploadResponse(BaseModel):
    upload_id: str
    status: str
    message: str

