import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4


DB_PATH = Path(__file__).resolve().parent.parent / "guardian_permission.db"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            unconscious INTEGER NOT NULL,
            guardian_ids_json TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS permission_requests (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            doctor_id TEXT NOT NULL,
            doctor_name TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            resolved_at TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS guardian_responses (
            id TEXT PRIMARY KEY,
            request_id TEXT NOT NULL,
            guardian_id TEXT NOT NULL,
            action TEXT NOT NULL,
            message TEXT,
            responded_at TEXT NOT NULL,
            UNIQUE(request_id, guardian_id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS upload_tokens (
            token TEXT PRIMARY KEY,
            request_id TEXT NOT NULL,
            doctor_id TEXT NOT NULL,
            patient_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            is_active INTEGER NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            request_id TEXT NOT NULL,
            guardian_id TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            sent_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS uploads (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            doctor_id TEXT NOT NULL,
            record_type TEXT NOT NULL,
            title TEXT NOT NULL,
            content_json TEXT NOT NULL,
            uploaded_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            actor_id TEXT NOT NULL,
            actor_role TEXT NOT NULL,
            details_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    conn.commit()
    seed_data(conn)
    conn.close()


def seed_data(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    existing = cur.execute("SELECT COUNT(*) AS count FROM patients").fetchone()["count"]
    if existing > 0:
        return

    seed_patients = [
        {
            "id": "patient_001",
            "name": "Rahim Uddin",
            "unconscious": 1,
            "guardian_ids_json": json.dumps(["guardian_001", "guardian_002", "guardian_003"]),
        },
        {
            "id": "patient_002",
            "name": "Farhana Akter",
            "unconscious": 0,
            "guardian_ids_json": json.dumps(["guardian_004", "guardian_005", "guardian_006"]),
        },
    ]
    cur.executemany(
        """
        INSERT INTO patients (id, name, unconscious, guardian_ids_json)
        VALUES (:id, :name, :unconscious, :guardian_ids_json)
        """,
        seed_patients,
    )
    conn.commit()


def fetch_patient(patient_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "unconscious": bool(row["unconscious"]),
        "guardian_ids": json.loads(row["guardian_ids_json"]),
    }


def create_permission_request(
    request_id: str,
    patient_id: str,
    doctor_id: str,
    doctor_name: str,
    reason: str,
    status: str,
) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO permission_requests (id, patient_id, doctor_id, doctor_name, reason, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (request_id, patient_id, doctor_id, doctor_name, reason, status, utc_now_iso()),
    )
    conn.commit()
    conn.close()


def fetch_request(request_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    row = conn.execute("SELECT * FROM permission_requests WHERE id = ?", (request_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_request_status(request_id: str, status: str, resolved: bool = False) -> None:
    conn = get_conn()
    if resolved:
        conn.execute(
            "UPDATE permission_requests SET status = ?, resolved_at = ? WHERE id = ?",
            (status, utc_now_iso(), request_id),
        )
    else:
        conn.execute(
            "UPDATE permission_requests SET status = ? WHERE id = ?",
            (status, request_id),
        )
    conn.commit()
    conn.close()


def save_guardian_response(
    request_id: str,
    guardian_id: str,
    action: str,
    message: Optional[str],
) -> None:
    conn = get_conn()
    response_id = str(uuid4())
    conn.execute(
        """
        INSERT INTO guardian_responses (id, request_id, guardian_id, action, message, responded_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(request_id, guardian_id)
        DO UPDATE SET
            action = excluded.action,
            message = excluded.message,
            responded_at = excluded.responded_at
        """,
        (response_id, request_id, guardian_id, action, message, utc_now_iso()),
    )
    conn.commit()
    conn.close()


def fetch_guardian_responses(request_id: str) -> List[Dict[str, Any]]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM guardian_responses WHERE request_id = ? ORDER BY responded_at ASC",
        (request_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_notification(request_id: str, guardian_id: str, payload: Dict[str, Any]) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO notifications (id, request_id, guardian_id, payload_json, sent_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (str(uuid4()), request_id, guardian_id, json.dumps(payload), utc_now_iso()),
    )
    conn.commit()
    conn.close()


def fetch_guardian_notifications(guardian_id: str) -> List[Dict[str, Any]]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT request_id, payload_json, sent_at FROM notifications WHERE guardian_id = ? ORDER BY sent_at DESC",
        (guardian_id,),
    ).fetchall()
    conn.close()

    return [
        {
            "request_id": r["request_id"],
            "payload": json.loads(r["payload_json"]),
            "sent_at": r["sent_at"],
        }
        for r in rows
    ]


def create_upload_token(
    token: str,
    request_id: str,
    doctor_id: str,
    patient_id: str,
    expires_at: str,
) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO upload_tokens (token, request_id, doctor_id, patient_id, expires_at, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
        """,
        (token, request_id, doctor_id, patient_id, expires_at),
    )
    conn.commit()
    conn.close()


def fetch_upload_token(token: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    row = conn.execute("SELECT * FROM upload_tokens WHERE token = ?", (token,)).fetchone()
    conn.close()
    return dict(row) if row else None


def deactivate_token(token: str) -> None:
    conn = get_conn()
    conn.execute("UPDATE upload_tokens SET is_active = 0 WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def save_upload(
    upload_id: str,
    patient_id: str,
    doctor_id: str,
    record_type: str,
    title: str,
    content: Dict[str, Any],
) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO uploads (id, patient_id, doctor_id, record_type, title, content_json, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (upload_id, patient_id, doctor_id, record_type, title, json.dumps(content), utc_now_iso()),
    )
    conn.commit()
    conn.close()


def write_audit_log(event_type: str, actor_id: str, actor_role: str, details: Dict[str, Any]) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO audit_logs (id, event_type, actor_id, actor_role, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid4()),
            event_type,
            actor_id,
            actor_role,
            json.dumps(details),
            utc_now_iso(),
        ),
    )
    conn.commit()
    conn.close()
