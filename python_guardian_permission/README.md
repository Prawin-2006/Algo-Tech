# Guardian Permission API (FastAPI)

A modular FastAPI backend feature for emergency medical record upload when a patient is unconscious.

## Project Structure

```text
python_guardian_permission/
+-- app/
¦   +-- auth.py                     # Header-based role and token parsing
¦   +-- db.py                       # SQLite schema + CRUD helpers + audit log store
¦   +-- main.py                     # FastAPI app setup
¦   +-- models.py                   # Pydantic request/response models
¦   +-- routers/
¦   ¦   +-- permissions.py          # API endpoints
¦   +-- services/
¦       +-- permission_service.py   # Business logic
+-- guardian_permission.db          # Auto-created SQLite DB
+-- main.py                         # ASGI entry shortcut
+-- requirements.txt
```

## Install & Run

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Security

- Role-based access through headers:
  - `X-Role: doctor` or `X-Role: guardian`
  - `X-Actor-Id: <doctor_id_or_guardian_id>`
- Upload endpoint requires:
  - `Authorization: Bearer <temporary_upload_token>`
- Upload token:
  - Issued if at least one guardian approves
  - Expires in 15 minutes
  - Single-use (deactivated after successful upload)

## APIs

### 1) POST `/request-permission`
Doctor requests emergency upload permission.

#### Sample Request
```json
{
  "patient_id": "patient_001",
  "doctor_id": "doctor_001",
  "doctor_name": "Dr. Sarah Khan",
  "reason": "Emergency trauma upload"
}
```
Headers:
- `X-Role: doctor`
- `X-Actor-Id: doctor_001`

#### Sample Response
```json
{
  "request_id": "req_2f3b4a7d2c10",
  "status": "PENDING_GUARDIAN_APPROVAL",
  "message": "Guardians notified. Waiting for responses.",
  "notifications": [
    {
      "request_id": "req_2f3b4a7d2c10",
      "patient": {
        "id": "patient_001",
        "name": "Rahim Uddin",
        "unconscious": true
      },
      "doctor": {
        "id": "doctor_001",
        "name": "Dr. Sarah Khan",
        "reason": "Emergency trauma upload"
      },
      "actions": ["ALLOW", "DENY"]
    }
  ]
}
```

### 2) POST `/guardian-response`
Guardian approves or denies request.

#### Sample Request
```json
{
  "request_id": "req_2f3b4a7d2c10",
  "guardian_id": "guardian_001",
  "action": "ALLOW",
  "message": "Proceed for emergency care"
}
```
Headers:
- `X-Role: guardian`
- `X-Actor-Id: guardian_001`

#### Sample Response (ALLOW)
```json
{
  "request_id": "req_2f3b4a7d2c10",
  "status": "APPROVED",
  "token": "P8X...",
  "token_expires_at": "2026-04-17T13:20:00+00:00",
  "message": "At least one guardian approved. Upload token issued for 15 minutes."
}
```

### 3) POST `/upload`
Doctor uploads patient medical record with valid token.

#### Sample Request
```json
{
  "patient_id": "patient_001",
  "doctor_id": "doctor_001",
  "record_type": "lab-report",
  "title": "CBC Report",
  "content": {
    "hemoglobin": "12.8 g/dL",
    "wbc": "7600"
  }
}
```
Headers:
- `X-Role: doctor`
- `X-Actor-Id: doctor_001`
- `Authorization: Bearer <token_from_guardian_allow>`

#### Sample Response
```json
{
  "upload_id": "upl_5f0a4311d2b3",
  "status": "SUCCESS",
  "message": "Record uploaded successfully using guardian-approved token."
}
```

## Guardian Message Simulation Endpoint

### GET `/guardian-inbox/{guardian_id}`
Returns queued notification payloads for the guardian.

Headers:
- `X-Role: guardian`
- `X-Actor-Id: <same_guardian_id>`

## Audit Trail

All critical events are saved to `audit_logs` table, including:
- permission requests
- guardian approvals/denials
- token-based upload events
