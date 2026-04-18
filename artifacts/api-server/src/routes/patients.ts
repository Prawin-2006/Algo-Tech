import { Router, type IRouter } from "express";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import * as mammoth from "mammoth";
import { ai } from "@workspace/integrations-gemini-ai";
import {
  RegisterPatientBody,
  GetPatientParams,
  GetPatientQrParams,
  GetPatientRecordsParams,
  UploadMedicalRecordParams,
  UploadMedicalRecordBody,
  GetEmergencyDataParams,
  RequestFullAccessParams,
  RequestFullAccessBody,
  GetStatsResponse,
} from "@workspace/api-zod";
import { encrypt, hashData, generateId, generatePatientId } from "../lib/crypto.js";

const router: IRouter = Router();
const require = createRequire(import.meta.url);

const DEMO_DOCTORS: Record<string, { name: string; password: string }> = {
  doctor1: { name: "Dr. Priya Sharma", password: "health123" },
  doctor2: { name: "Dr. Rajesh Kumar", password: "health123" },
  doctor3: { name: "Dr. Anitha Nair", password: "health123" },
};
const PATIENT_PASSWORDS = new Map<string, string>();
type PrimaryDoctor = { doctorId: string; doctorName: string };
type AccessRequest = {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  resolvedAt?: string;
};
type GuardianRequest = {
  id: string;
  patientId: string;
  guardianName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  resolvedAt?: string;
};
type EmergencyOverrideSession = {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  reason: string;
  grantedAt: string;
  expiresAt: string;
};
const PATIENT_PRIMARY_DOCTOR = new Map<
  string,
  PrimaryDoctor
>();
const ACCESS_REQUESTS = new Map<string, AccessRequest[]>();
const GUARDIAN_REQUESTS = new Map<string, GuardianRequest[]>();
const APPROVED_GUARDIANS = new Map<string, string[]>();
const EMERGENCY_OVERRIDE_SESSIONS = new Map<string, EmergencyOverrideSession>();

type PatientRow = {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string | null;
  email: string | null;
  bloodGroup: string;
  allergies: string[];
  diseases: string[];
  emergencyContact: string | null;
  createdAt: Date;
};

type MedicalRecordRow = {
  id: string;
  patientId: string;
  recordType: string;
  title: string;
  description: string | null;
  prescriptions: string[];
  labResults: unknown;
  doctorName: string | null;
  hospitalName: string | null;
  visitDate: string | null;
  encryptedData: string | null;
  dataHash: string;
  createdAt: Date;
};

type AuditLogRow = {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  reason: string;
  isEmergencyOverride: boolean;
  accessedAt: Date;
};

const PATIENTS: PatientRow[] = [];
const MEDICAL_RECORDS: MedicalRecordRow[] = [];
const AUDIT_LOGS: AuditLogRow[] = [];
const PRIMARY_STORE_FILE_PATH = path.resolve(
  process.cwd(),
  "data",
  "patient-store.json",
);
const LEGACY_STORE_FILE_PATHS = [
  path.resolve(process.cwd(), "artifacts", "api-server", "artifacts", "api-server", "data", "patient-store.json"),
  path.resolve(process.cwd(), "artifacts", "api-server", "data", "patient-store.json"),
  path.resolve(process.cwd(), "data", "patient-store.json"),
];

type PersistedStore = {
  patients: Array<Omit<PatientRow, "createdAt"> & { createdAt: string }>;
  records: Array<Omit<MedicalRecordRow, "createdAt"> & { createdAt: string }>;
  audits: Array<Omit<AuditLogRow, "accessedAt"> & { accessedAt: string }>;
  patientPasswords: Array<[string, string]>;
  primaryDoctors: Array<[string, PrimaryDoctor]>;
  accessRequests: Array<[string, AccessRequest[]]>;
  guardianRequests: Array<[string, GuardianRequest[]]>;
  approvedGuardians: Array<[string, string[]]>;
  emergencyOverrideSessions: Array<[string, EmergencyOverrideSession]>;
};

function saveStore(): void {
  const payload: PersistedStore = {
    patients: PATIENTS.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
    records: MEDICAL_RECORDS.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    audits: AUDIT_LOGS.map((a) => ({ ...a, accessedAt: a.accessedAt.toISOString() })),
    patientPasswords: Array.from(PATIENT_PASSWORDS.entries()),
    primaryDoctors: Array.from(PATIENT_PRIMARY_DOCTOR.entries()),
    accessRequests: Array.from(ACCESS_REQUESTS.entries()),
    guardianRequests: Array.from(GUARDIAN_REQUESTS.entries()),
    approvedGuardians: Array.from(APPROVED_GUARDIANS.entries()),
    emergencyOverrideSessions: Array.from(EMERGENCY_OVERRIDE_SESSIONS.entries()),
  };

  fs.mkdirSync(path.dirname(PRIMARY_STORE_FILE_PATH), { recursive: true });
  fs.writeFileSync(PRIMARY_STORE_FILE_PATH, JSON.stringify(payload, null, 2), "utf-8");
}

function loadStore(): void {
  const existingPath = [
    PRIMARY_STORE_FILE_PATH,
    ...LEGACY_STORE_FILE_PATHS,
  ].find((candidate) => fs.existsSync(candidate));

  if (!existingPath) {
    return;
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(existingPath, "utf-8"),
    ) as Partial<PersistedStore>;

    const loadedPatients =
      parsed.patients?.map((p) => ({
        ...p,
        createdAt: new Date(p.createdAt),
      })) ?? [];
    const loadedRecords =
      parsed.records?.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
      })) ?? [];
    const loadedAudits =
      parsed.audits?.map((a) => ({
        ...a,
        accessedAt: new Date(a.accessedAt),
      })) ?? [];

    PATIENTS.splice(0, PATIENTS.length, ...loadedPatients);
    MEDICAL_RECORDS.splice(0, MEDICAL_RECORDS.length, ...loadedRecords);
    AUDIT_LOGS.splice(0, AUDIT_LOGS.length, ...loadedAudits);

    PATIENT_PASSWORDS.clear();
    for (const [key, value] of parsed.patientPasswords ?? []) {
      PATIENT_PASSWORDS.set(key, value);
    }

    PATIENT_PRIMARY_DOCTOR.clear();
    for (const [key, value] of parsed.primaryDoctors ?? []) {
      PATIENT_PRIMARY_DOCTOR.set(key, value);
    }

    ACCESS_REQUESTS.clear();
    for (const [key, value] of parsed.accessRequests ?? []) {
      ACCESS_REQUESTS.set(key, value);
    }

    GUARDIAN_REQUESTS.clear();
    for (const [key, value] of parsed.guardianRequests ?? []) {
      GUARDIAN_REQUESTS.set(key, value);
    }

    APPROVED_GUARDIANS.clear();
    for (const [key, value] of parsed.approvedGuardians ?? []) {
      APPROVED_GUARDIANS.set(key, value);
    }

    EMERGENCY_OVERRIDE_SESSIONS.clear();
    for (const [key, value] of parsed.emergencyOverrideSessions ?? []) {
      EMERGENCY_OVERRIDE_SESSIONS.set(key, value);
    }
  } catch (error) {
    console.error("Failed to load patient store:", error);
  }
}

loadStore();

function buildFallbackChatResponse(query: string): string {
  const q = query.toLowerCase();

  if (q.includes("allerg")) {
    return "To check allergies accurately, select a patient first. In general, verify allergy history before prescribing and monitor for severe reactions.";
  }
  if (q.includes("blood group") || q.includes("blood type")) {
    return "Blood group is patient-specific, so please select a patient for exact details. In urgent care, always verify documented records and follow cross-match protocols.";
  }
  if (q.includes("disease") || q.includes("condition")) {
    return "Please select a patient to list known diseases from their records. For treatment decisions, confirm with a licensed doctor.";
  }
  if (q.includes("prescription") || q.includes("medicine") || q.includes("medication")) {
    return "Select a patient to review prescriptions from uploaded records. Please verify dose, frequency, and interactions with a qualified clinician.";
  }
  if (q.includes("emergency")) {
    return "If this is an emergency, call local emergency services immediately. I can summarize patient data once you select a patient.";
  }

  return "I can help with allergies, blood group, diseases, prescriptions, and emergency-related medical record questions. Select a patient for personalized answers.";
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFallbackRecordSummary(recordTitle: string, content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) return "No readable details found in this record.";
  const short = clean.slice(0, 420);
  return `Summary for ${recordTitle}: ${short}${clean.length > 420 ? "..." : ""}`;
}

type ExtractedSnapshot = {
  age?: number;
  bloodGroup?: string;
  bp?: string;
  sugar?: string;
  allergies?: string[];
};

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function chooseKnownText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed && trimmed.toLowerCase() !== "unknown") return trimmed;
  }
  return null;
}

function parseJsonObjectFromText(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim(),
  ];
  for (const candidate of candidates) {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    const payload = first >= 0 && last > first ? candidate.slice(first, last + 1) : candidate;
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function sanitizeBloodGroup(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^(A|B|AB|O)[+-]$/.test(normalized) ? normalized : null;
}

function sanitizeAge(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  return rounded > 0 && rounded <= 130 ? rounded : null;
}

function sanitizeAllergies(value: unknown): string[] | null {
  const normalize = (input: string): string =>
    input
      .replace(/\s+/g, " ")
      .replace(/[.]+$/g, "")
      .trim();
  const isLikelyAllergy = (input: string): boolean => {
    const cleaned = normalize(input);
    if (!cleaned) return false;
    if (cleaned.length > 40) return false;
    const lower = cleaned.toLowerCase();
    if (lower === "none" || lower === "n/a") return false;
    if (lower.includes("doctor notes") || lower.includes("medical history") || lower.includes("elevated bp")) {
      return false;
    }
    return true;
  };

  if (Array.isArray(value)) {
    const list = value
      .map((item) => (typeof item === "string" ? normalize(item) : ""))
      .filter((item) => isLikelyAllergy(item));
    return list.length > 0 ? [...new Set(list)] : [];
  }
  if (typeof value === "string") {
    const cleaned = normalize(value);
    if (!cleaned || cleaned.toLowerCase() === "none" || cleaned.toLowerCase() === "n/a") return [];
    const list = cleaned
      .split(/[;,|]/g)
      .map((v) => normalize(v))
      .filter((item) => isLikelyAllergy(item));
    return list.length > 0 ? [...new Set(list)] : [];
  }
  return null;
}

function extractSnapshotFromTextFallback(text: string): ExtractedSnapshot {
  const snapshot: ExtractedSnapshot = {};
  const bloodGroup = text.match(/\b(AB|A|B|O)[+-]/i)?.[0];
  if (bloodGroup) snapshot.bloodGroup = bloodGroup.toUpperCase();

  const ageMatch = text.match(/\bage\s*[:\-]?\s*([1-9][0-9]{0,2})\b/i);
  if (ageMatch?.[1]) {
    const parsed = sanitizeAge(ageMatch[1]);
    if (parsed) snapshot.age = parsed;
  }

  const bpMatch =
    text.match(/(?:bp|blood pressure)\s*[:\-]?\s*([0-9]{2,3}\s*\/\s*[0-9]{2,3})/i) ??
    text.match(/\b([0-9]{2,3}\s*\/\s*[0-9]{2,3})\b/);
  if (bpMatch?.[1]) snapshot.bp = bpMatch[1].replace(/\s+/g, "");

  const sugarMatch =
    text.match(/(?:fasting|blood sugar|sugar|glucose)\s*[:\-]?\s*([0-9]{2,3}(?:\.[0-9]+)?\s*(?:mg\/dl)?)/i) ??
    text.match(/\b([0-9]{2,3}(?:\.[0-9]+)?\s*mg\/dl)\b/i);
  if (sugarMatch?.[1]) snapshot.sugar = sugarMatch[1].trim();

  const allergyLine = text.match(/allerg(?:y|ies)\s*[:\-]?\s*([a-zA-Z0-9 ,;|/()+-]{1,120})/i);
  if (allergyLine?.[1]) {
    const list = sanitizeAllergies(allergyLine[1]);
    if (list) snapshot.allergies = list;
  }

  return snapshot;
}

async function extractSnapshotFromRecordText(text: string): Promise<ExtractedSnapshot> {
  const fallback = extractSnapshotFromTextFallback(text);
  if (!ai) return fallback;

  const preferred = process.env.GEMINI_MODEL?.trim();
  const modelCandidates = [preferred, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    .filter((m, idx, arr): m is string => Boolean(m) && arr.indexOf(m as string) === idx);

  const prompt = `Extract health snapshot fields from this patient record text.
Return STRICT JSON only with keys:
{
  "age": number | null,
  "bloodGroup": string | null,
  "bp": string | null,
  "sugar": string | null,
  "allergies": string[] | null
}
Rules:
- bloodGroup must be one of A+, A-, B+, B-, O+, O-, AB+, AB-
- bp format example: "120/80"
- if field not found return null

Record text:
${text.slice(0, 12000)}`;

  let lastError: unknown = null;
  for (const model of modelCandidates) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 512 },
      });
      const parsed = parseJsonObjectFromText(result.text ?? "");
      if (!parsed) break;

      const extracted: ExtractedSnapshot = {
        age: sanitizeAge(parsed.age) ?? undefined,
        bloodGroup: sanitizeBloodGroup(parsed.bloodGroup) ?? undefined,
        bp: asOptionalString(parsed.bp) ?? undefined,
        sugar: asOptionalString(parsed.sugar) ?? undefined,
      };
      const allergies = sanitizeAllergies(parsed.allergies);
      if (allergies) extracted.allergies = allergies;

      return {
        age: extracted.age ?? fallback.age,
        bloodGroup: extracted.bloodGroup ?? fallback.bloodGroup,
        bp: extracted.bp ?? fallback.bp,
        sugar: extracted.sugar ?? fallback.sugar,
        allergies: extracted.allergies ?? fallback.allergies,
      };
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number } | null)?.status;
      if (status === 404 || status === 400 || status === 429 || status === 503) continue;
      break;
    }
  }

  if (lastError) {
    console.error("Snapshot extraction AI error:", lastError);
  }
  return fallback;
}

async function extractSnapshotFromRecordFile(
  contentBase64: string,
  mimeTypeRaw: string | null,
): Promise<ExtractedSnapshot> {
  if (!ai) return {};

  const mimeType = (mimeTypeRaw?.trim() || "application/octet-stream").toLowerCase();
  const preferred = process.env.GEMINI_MODEL?.trim();
  const modelCandidates = [preferred, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    .filter((m, idx, arr): m is string => Boolean(m) && arr.indexOf(m as string) === idx);

  const prompt = `Extract health snapshot fields from this medical record file.
Return STRICT JSON only with keys:
{
  "age": number | null,
  "bloodGroup": string | null,
  "bp": string | null,
  "sugar": string | null,
  "allergies": string[] | null
}
Rules:
- bloodGroup must be one of A+, A-, B+, B-, O+, O-, AB+, AB-
- bp format example: "120/80"
- if a field is not present, return null`;

  let lastError: unknown = null;
  for (const model of modelCandidates) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: contentBase64,
              },
            },
          ],
        }],
        config: { maxOutputTokens: 512 },
      });
      const parsed = parseJsonObjectFromText(result.text ?? "");
      if (!parsed) break;

      const extracted: ExtractedSnapshot = {
        age: sanitizeAge(parsed.age) ?? undefined,
        bloodGroup: sanitizeBloodGroup(parsed.bloodGroup) ?? undefined,
        bp: asOptionalString(parsed.bp) ?? undefined,
        sugar: asOptionalString(parsed.sugar) ?? undefined,
      };
      const allergies = sanitizeAllergies(parsed.allergies);
      if (allergies) extracted.allergies = allergies;
      return extracted;
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number } | null)?.status;
      if (status === 404 || status === 400 || status === 429 || status === 503) continue;
      break;
    }
  }

  if (lastError) {
    console.error("Snapshot file extraction AI error:", lastError);
  }
  return {};
}

async function buildSnapshotFromLabResults(labResults: unknown): Promise<ExtractedSnapshot> {
  const snapshot: ExtractedSnapshot = {};
  const lab = labResults && typeof labResults === "object"
    ? (labResults as Record<string, unknown>)
    : null;

  if (lab) {
    const explicitBloodGroup = sanitizeBloodGroup(lab.bloodGroup);
    if (explicitBloodGroup) snapshot.bloodGroup = explicitBloodGroup;

    const explicitAge = sanitizeAge(lab.age);
    if (explicitAge) snapshot.age = explicitAge;

    const explicitBp =
      asOptionalString(lab.bp) ??
      asOptionalString(lab.bloodPressure) ??
      asOptionalString(lab.BP) ??
      asOptionalString(lab["blood_pressure"]);
    if (explicitBp) snapshot.bp = explicitBp;

    const explicitSugar =
      asOptionalString(lab.sugar) ??
      asOptionalString(lab.bloodSugar) ??
      asOptionalString(lab.glucose) ??
      asOptionalString(lab["blood_sugar"]);
    if (explicitSugar) snapshot.sugar = explicitSugar;

    const explicitAllergies = sanitizeAllergies(lab.allergies);
    if (explicitAllergies) snapshot.allergies = explicitAllergies;
  }

  let extractedText = await extractReadableTextFromLabResults(labResults);
  if (!extractedText && lab) {
    const contentBase64Raw = typeof lab.contentBase64 === "string" ? lab.contentBase64 : null;
    const contentBase64 = contentBase64Raw
      ? (contentBase64Raw.includes(",") ? contentBase64Raw.split(",").pop() ?? "" : contentBase64Raw).trim()
      : "";
    const mimeType = typeof lab.mimeType === "string" ? lab.mimeType : "";
    if (contentBase64 && mimeType.toLowerCase().includes("pdf")) {
      extractedText = await extractPdfTextFromBase64(contentBase64);
    }
  }
  if (extractedText) {
    const aiSnapshot = await extractSnapshotFromRecordText(extractedText);
    return {
      age: snapshot.age ?? aiSnapshot.age,
      bloodGroup: snapshot.bloodGroup ?? aiSnapshot.bloodGroup,
      bp: snapshot.bp ?? aiSnapshot.bp,
      sugar: snapshot.sugar ?? aiSnapshot.sugar,
      allergies: snapshot.allergies ?? aiSnapshot.allergies,
    };
  }

  if (lab) {
    const contentBase64Raw = typeof lab.contentBase64 === "string" ? lab.contentBase64 : null;
    const contentBase64 = contentBase64Raw
      ? (contentBase64Raw.includes(",") ? contentBase64Raw.split(",").pop() ?? "" : contentBase64Raw).trim()
      : "";
    if (contentBase64) {
      const aiSnapshot = await extractSnapshotFromRecordFile(
        contentBase64,
        typeof lab.mimeType === "string" ? lab.mimeType : null,
      );
      return {
        age: snapshot.age ?? aiSnapshot.age,
        bloodGroup: snapshot.bloodGroup ?? aiSnapshot.bloodGroup,
        bp: snapshot.bp ?? aiSnapshot.bp,
        sugar: snapshot.sugar ?? aiSnapshot.sugar,
        allergies: snapshot.allergies ?? aiSnapshot.allergies,
      };
    }
  }

  return snapshot;
}

function applySnapshotToPatient(patient: PatientRow, snapshot: ExtractedSnapshot): void {
  const snapshotBloodGroup = chooseKnownText(snapshot.bloodGroup);
  if (snapshotBloodGroup) {
    patient.bloodGroup = snapshotBloodGroup;
  }

  if (typeof snapshot.age === "number" && snapshot.age > 0) {
    patient.age = snapshot.age;
  }

  if (snapshot.allergies) {
    patient.allergies =
      sanitizeAllergies([...(patient.allergies ?? []), ...snapshot.allergies]) ?? [];
  }
}

function applySnapshotToLabResults(
  labResults: unknown,
  snapshot: ExtractedSnapshot,
): unknown {
  if (!labResults || typeof labResults !== "object") return labResults;
  const lab = labResults as Record<string, unknown>;
  const bp = asOptionalString(snapshot.bp);
  const sugar = asOptionalString(snapshot.sugar);
  return {
    ...lab,
    ...(bp ? { bp, bloodPressure: bp } : {}),
    ...(sugar ? { sugar, bloodSugar: sugar } : {}),
  };
}

function trimExtractedText(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\u0000/g, "").replace(/\s+\n/g, "\n").trim();
  if (!normalized) return null;
  return normalized.slice(0, 20000);
}

async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => {
          if (item && typeof item === "object" && "str" in item) {
            const value = (item as { str?: unknown }).str;
            return typeof value === "string" ? value : "";
          }
          return "";
        })
        .join(" ");
      if (pageText.trim()) pages.push(pageText.trim());
    }
    return trimExtractedText(pages.join("\n"));
  } catch (error) {
    console.error("PDF text extraction failed:", error);
    return null;
  }
}

async function extractPdfTextFromBase64(contentBase64: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(contentBase64, "base64");
    return await extractPdfTextFromBuffer(buffer);
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapAsViewerHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      .wrap { max-width: 920px; margin: 0 auto; padding: 24px; }
      .doc { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; }
      h1 { font-size: 18px; margin: 0 0 14px; }
      pre { white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      p { line-height: 1.6; margin: 8px 0; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="doc">
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;
}

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-zA-Z]+\d* ?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractReadableTextFromLabResults(labResults: unknown): Promise<string | null> {
  if (!labResults || typeof labResults !== "object") return null;
  const lab = labResults as Record<string, unknown>;
  const existingExtracted =
    typeof lab.extractedText === "string" ? trimExtractedText(lab.extractedText) : null;
  if (existingExtracted) return existingExtracted;

  const contentBase64Raw = typeof lab.contentBase64 === "string" ? lab.contentBase64 : null;
  const contentBase64 = contentBase64Raw
    ? (contentBase64Raw.includes(",") ? contentBase64Raw.split(",").pop() ?? "" : contentBase64Raw).trim()
    : null;
  if (!contentBase64) return null;

  const mimeType = typeof lab.mimeType === "string" ? lab.mimeType.toLowerCase() : "";
  const documentName = typeof lab.documentName === "string" ? lab.documentName.toLowerCase() : "";

  let buffer: Buffer;
  try {
    buffer = Buffer.from(contentBase64, "base64");
  } catch (error) {
    console.error("Readable text extraction failed:", error);
    return null;
  }

  try {
    if (mimeType.startsWith("text/") || documentName.endsWith(".txt")) {
      return trimExtractedText(buffer.toString("utf8"));
    }

    if (mimeType.includes("rtf") || documentName.endsWith(".rtf")) {
      return trimExtractedText(stripRtf(buffer.toString("utf8")));
    }

    if (
      mimeType.includes("wordprocessingml.document") ||
      documentName.endsWith(".docx")
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return trimExtractedText(result.value);
    }

    if (mimeType.includes("pdf") || documentName.endsWith(".pdf")) {
      return await extractPdfTextFromBuffer(buffer);
    }
  } catch {
    return null;
  }

  return null;
}

async function extractViewerHtmlFromLabResults(labResults: unknown): Promise<string | null> {
  if (!labResults || typeof labResults !== "object") return null;
  const lab = labResults as Record<string, unknown>;

  const existingHtml =
    typeof lab.extractedHtml === "string" && lab.extractedHtml.trim()
      ? lab.extractedHtml.trim()
      : null;
  if (existingHtml) return existingHtml.slice(0, 100000);

  const contentBase64Raw = typeof lab.contentBase64 === "string" ? lab.contentBase64 : null;
  const contentBase64 = contentBase64Raw
    ? (contentBase64Raw.includes(",") ? contentBase64Raw.split(",").pop() ?? "" : contentBase64Raw).trim()
    : null;
  if (!contentBase64) return null;

  const mimeType = typeof lab.mimeType === "string" ? lab.mimeType.toLowerCase() : "";
  const documentName = typeof lab.documentName === "string" ? lab.documentName.toLowerCase() : "record";

  let buffer: Buffer;
  try {
    buffer = Buffer.from(contentBase64, "base64");
  } catch {
    return null;
  }

  try {
    if (
      mimeType.includes("wordprocessingml.document") ||
      documentName.endsWith(".docx")
    ) {
      const result = await mammoth.convertToHtml({ buffer });
      const html = result.value?.trim();
      if (html) {
        return wrapAsViewerHtml(documentName, `<h1>${escapeHtml(documentName)}</h1>${html}`).slice(0, 100000);
      }
    }

    const text = await extractReadableTextFromLabResults(labResults);
    if (text) {
      return wrapAsViewerHtml(
        documentName,
        `<h1>${escapeHtml(documentName)}</h1><pre>${escapeHtml(text)}</pre>`,
      ).slice(0, 100000);
    }
  } catch {
    return null;
  }

  return null;
}

async function toRecordResponse(record: MedicalRecordRow): Promise<MedicalRecordRow> {
  if (!record.labResults || typeof record.labResults !== "object") {
    return { ...record, prescriptions: record.prescriptions ?? [] };
  }

  const lab = record.labResults as Record<string, unknown>;
  const extractedText = await extractReadableTextFromLabResults(lab);
  const extractedHtml = await extractViewerHtmlFromLabResults(lab);
  if (!extractedText) {
    if (!extractedHtml) {
      return { ...record, prescriptions: record.prescriptions ?? [] };
    }
    return {
      ...record,
      prescriptions: record.prescriptions ?? [],
      labResults: {
        ...lab,
        extractedHtml,
      },
    };
  }

  return {
    ...record,
    prescriptions: record.prescriptions ?? [],
    labResults: {
      ...lab,
      extractedText,
      ...(extractedHtml ? { extractedHtml } : {}),
    },
  };
}

function extractLatestVitals(patientId: string): { bp: string | null; sugar: string | null } {
  const records = MEDICAL_RECORDS
    .filter((record) => record.patientId === patientId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const record of records) {
    if (!record.labResults || typeof record.labResults !== "object") continue;
    const lab = record.labResults as Record<string, unknown>;
    const bp =
      asOptionalString(lab.bp) ??
      asOptionalString(lab.bloodPressure) ??
      asOptionalString(lab.BP) ??
      asOptionalString(lab["blood_pressure"]);
    const sugar =
      asOptionalString(lab.sugar) ??
      asOptionalString(lab.bloodSugar) ??
      asOptionalString(lab.glucose) ??
      asOptionalString(lab["blood_sugar"]);

    if (bp || sugar) {
      return { bp: bp ?? null, sugar: sugar ?? null };
    }
  }

  return { bp: null, sugar: null };
}

function extractCurrentMedicines(patientId: string): string[] {
  const records = MEDICAL_RECORDS
    .filter((record) => record.patientId === patientId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const medicines = new Set<string>();
  for (const record of records) {
    for (const prescription of record.prescriptions ?? []) {
      const trimmed = prescription.trim();
      if (trimmed) medicines.add(trimmed);
    }
  }
  return [...medicines];
}

function extractRecentMedicalRecords(patientId: string): MedicalRecordRow[] {
  return MEDICAL_RECORDS
    .filter((record) => record.patientId === patientId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function splitComparableChunks(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/\n+|(?<=[.!?])\s+/g)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && line.length <= 220);
}

function normalizeCompareValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+/.\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCompareField(value: unknown): string {
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join(", ");
    return joined || "Not available";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "Not available";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "Not available";
  }
  return "Not available";
}

type CompareFieldChange = {
  field: string;
  previous: string;
  latest: string;
};

async function buildRecordComparison(
  previous: MedicalRecordRow,
  latest: MedicalRecordRow,
): Promise<{
  fieldChanges: CompareFieldChange[];
  addedNotes: string[];
  removedNotes: string[];
}> {
  const previousText = (await extractReadableTextFromLabResults(previous.labResults)) ?? "";
  const latestText = (await extractReadableTextFromLabResults(latest.labResults)) ?? "";

  const previousSnapshot = await buildSnapshotFromLabResults(previous.labResults);
  const latestSnapshot = await buildSnapshotFromLabResults(latest.labResults);

  const fieldChanges: CompareFieldChange[] = [];
  const fields: Array<{ field: string; previous: unknown; latest: unknown }> = [
    { field: "Age", previous: previousSnapshot.age, latest: latestSnapshot.age },
    { field: "Blood Group", previous: previousSnapshot.bloodGroup, latest: latestSnapshot.bloodGroup },
    { field: "BP", previous: previousSnapshot.bp, latest: latestSnapshot.bp },
    { field: "Sugar", previous: previousSnapshot.sugar, latest: latestSnapshot.sugar },
    { field: "Allergies", previous: previousSnapshot.allergies, latest: latestSnapshot.allergies },
  ];

  for (const entry of fields) {
    const previousValue = formatCompareField(entry.previous);
    const latestValue = formatCompareField(entry.latest);
    if (normalizeCompareValue(previousValue) !== normalizeCompareValue(latestValue)) {
      fieldChanges.push({
        field: entry.field,
        previous: previousValue,
        latest: latestValue,
      });
    }
  }

  const previousChunks = splitComparableChunks(previousText);
  const latestChunks = splitComparableChunks(latestText);

  const previousMap = new Map<string, string>();
  for (const chunk of previousChunks) {
    const key = normalizeCompareValue(chunk);
    if (key && !previousMap.has(key)) previousMap.set(key, chunk);
  }
  const latestMap = new Map<string, string>();
  for (const chunk of latestChunks) {
    const key = normalizeCompareValue(chunk);
    if (key && !latestMap.has(key)) latestMap.set(key, chunk);
  }

  const addedNotes = Array.from(latestMap.entries())
    .filter(([key]) => !previousMap.has(key))
    .map(([, value]) => value)
    .slice(0, 8);
  const removedNotes = Array.from(previousMap.entries())
    .filter(([key]) => !latestMap.has(key))
    .map(([, value]) => value)
    .slice(0, 8);

  return {
    fieldChanges,
    addedNotes,
    removedNotes,
  };
}

function getPatientSummary(patient: PatientRow): {
  patientId: string;
  name: string;
  age: number | null;
  gender: string | null;
  bloodGroup: string | null;
  bp: string | null;
  sugar: string | null;
  allergies: string[] | null;
  currentMedicines: string[] | null;
  emergencyContact: string | null;
  pastDiseases: string[] | null;
} {
  const vitals = extractLatestVitals(patient.id);
  const medicines = extractCurrentMedicines(patient.id);
  return {
    patientId: patient.id,
    name: patient.name,
    age: Number.isFinite(patient.age) && patient.age > 0 ? patient.age : null,
    gender: patient.gender && patient.gender !== "Unknown" ? patient.gender : null,
    bloodGroup: patient.bloodGroup && patient.bloodGroup !== "Unknown" ? patient.bloodGroup : null,
    bp: vitals.bp,
    sugar: vitals.sugar,
    allergies: patient.allergies.length > 0 ? patient.allergies : null,
    currentMedicines: medicines.length > 0 ? medicines : null,
    emergencyContact: patient.emergencyContact ?? null,
    pastDiseases: patient.diseases.length > 0 ? patient.diseases : null,
  };
}

router.get("/patients", async (_req, res): Promise<void> => {
  const patients = [...PATIENTS].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  res.json(patients.map(p => ({
    ...p,
    allergies: p.allergies ?? [],
    diseases: p.diseases ?? [],
  })));
});

router.post("/patients/register", async (req, res): Promise<void> => {
  const rawDoctorId =
    typeof (req.body as { doctorId?: unknown } | null)?.doctorId === "string"
      ? (req.body as { doctorId: string }).doctorId.trim()
      : "";
  const rawDoctorName =
    typeof (req.body as { doctorName?: unknown } | null)?.doctorName === "string"
      ? (req.body as { doctorName: string }).doctorName.trim()
      : "";
  const rawPassword =
    typeof (req.body as { password?: unknown } | null)?.password === "string"
      ? (req.body as { password: string }).password.trim()
      : "";
  const parsed = RegisterPatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, age, gender, phone, email, bloodGroup, allergies, diseases, emergencyContact } = parsed.data;

  const id = generatePatientId();
  const patient: PatientRow = {
    id,
    name,
    age,
    gender,
    phone: phone ?? null,
    email: email ?? null,
    bloodGroup,
    allergies: allergies ?? [],
    diseases: diseases ?? [],
    emergencyContact: emergencyContact ?? null,
    createdAt: new Date(),
  };
  PATIENTS.push(patient);

  if (rawPassword) {
    PATIENT_PASSWORDS.set(patient.name.toLowerCase(), rawPassword);
  }
  if (rawDoctorId && rawDoctorName) {
    PATIENT_PRIMARY_DOCTOR.set(patient.id, {
      doctorId: rawDoctorId,
      doctorName: rawDoctorName,
    });
  }
  saveStore();

  res.status(201).json({
    ...patient,
    allergies: patient.allergies ?? [],
    diseases: patient.diseases ?? [],
  });
});

router.get("/patients/:patientId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;
  const params = GetPatientParams.safeParse({ patientId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === params.data.patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.json({ ...patient, allergies: patient.allergies ?? [], diseases: patient.diseases ?? [] });
});

router.post("/patients/:patientId/profile", async (req, res): Promise<void> => {
  const patientId = Array.isArray(req.params.patientId)
    ? req.params.patientId[0]
    : req.params.patientId;
  if (!patientId) {
    res.status(400).json({ error: "patientId is required" });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const body = req.body as {
    age?: number | string;
    gender?: string;
    bloodGroup?: string;
  };

  const maybeAge = typeof body.age === "number" ? body.age : Number(body.age);
  if (Number.isFinite(maybeAge) && maybeAge > 0) {
    patient.age = maybeAge;
  }

  if (typeof body.gender === "string") {
    const gender = body.gender.trim();
    if (gender && gender.toLowerCase() !== "unknown") {
      patient.gender = gender;
    }
  }

  if (typeof body.bloodGroup === "string") {
    const bloodGroup = body.bloodGroup.trim();
    if (bloodGroup && bloodGroup.toLowerCase() !== "unknown") {
      patient.bloodGroup = bloodGroup;
    }
  }

  saveStore();
  res.json({
    ...patient,
    allergies: patient.allergies ?? [],
    diseases: patient.diseases ?? [],
  });
});

router.get("/patients/:patientId/qr", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;
  const params = GetPatientQrParams.safeParse({ patientId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === params.data.patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const qrText = `HEALTHCHAIN:${patient.id}:${patient.name}`;
  const qrDataUrl = await QRCode.toDataURL(qrText, {
    width: 256,
    margin: 2,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  res.json({ patientId: patient.id, qrDataUrl, qrText });
});

router.get("/patients/:patientId/records", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;
  const params = GetPatientRecordsParams.safeParse({ patientId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === params.data.patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const records = MEDICAL_RECORDS
    .filter((record) => record.patientId === params.data.patientId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const response = await Promise.all(records.map((record) => toRecordResponse(record)));
  res.json(response);
});

router.get("/patients/:patientId/records/compare-latest", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;
  const params = GetPatientRecordsParams.safeParse({ patientId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === params.data.patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const records = extractRecentMedicalRecords(params.data.patientId);
  if (records.length < 2) {
    res.status(400).json({ error: "At least 2 records are required for comparison." });
    return;
  }

  const latest = records[0];
  const previous = records[1];
  const comparison = await buildRecordComparison(previous, latest);

  res.json({
    patient: {
      id: patient.id,
      name: patient.name,
    },
    latestRecord: {
      id: latest.id,
      title: latest.title,
      recordType: latest.recordType,
      createdAt: latest.createdAt.toISOString(),
    },
    previousRecord: {
      id: previous.id,
      title: previous.title,
      recordType: previous.recordType,
      createdAt: previous.createdAt.toISOString(),
    },
    comparison,
  });
});

router.post("/patients/:patientId/records", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;
  const params = UploadMedicalRecordParams.safeParse({ patientId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UploadMedicalRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === params.data.patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const { recordType, title, description, prescriptions, labResults, doctorName, hospitalName, visitDate } = parsed.data;
  const extractedText = await extractReadableTextFromLabResults(labResults);
  const extractedHtml = await extractViewerHtmlFromLabResults(labResults);
  let normalizedLabResults =
    labResults && typeof labResults === "object"
      ? ({
          ...(labResults as Record<string, unknown>),
          ...(extractedText ? { extractedText } : {}),
          ...(extractedHtml ? { extractedHtml } : {}),
        } as Record<string, unknown>)
      : labResults ?? null;

  const snapshot = await buildSnapshotFromLabResults(normalizedLabResults);
  applySnapshotToPatient(patient, snapshot);
  normalizedLabResults = applySnapshotToLabResults(normalizedLabResults, snapshot);

  const rawData = JSON.stringify({ recordType, title, description, prescriptions, labResults: normalizedLabResults, doctorName, hospitalName, visitDate });
  const dataHash = hashData(rawData);
  const encryptedData = encrypt(rawData);

  const record: MedicalRecordRow = {
    id: generateId(),
    patientId: params.data.patientId,
    recordType,
    title,
    description: description ?? null,
    prescriptions: prescriptions ?? [],
    labResults: normalizedLabResults,
    doctorName: doctorName ?? null,
    hospitalName: hospitalName ?? null,
    visitDate: visitDate ?? null,
    encryptedData,
    dataHash,
    createdAt: new Date(),
  };
  MEDICAL_RECORDS.push(record);
  saveStore();

  res.status(201).json({ ...record, prescriptions: record.prescriptions ?? [] });
});

router.post("/patients/:patientId/records/:recordId/update-snapshot", async (req, res): Promise<void> => {
  const patientIdRaw = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;
  const recordIdRaw = Array.isArray(req.params.recordId) ? req.params.recordId[0] : req.params.recordId;

  if (!patientIdRaw || !recordIdRaw) {
    res.status(400).json({ error: "patientId and recordId are required." });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === patientIdRaw);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const record = MEDICAL_RECORDS.find(
    (item) => item.id === recordIdRaw && item.patientId === patientIdRaw,
  );
  if (!record) {
    res.status(404).json({ error: "Record not found for this patient." });
    return;
  }

  const snapshot = await buildSnapshotFromLabResults(record.labResults);
  applySnapshotToPatient(patient, snapshot);
  record.labResults = applySnapshotToLabResults(record.labResults, snapshot);
  saveStore();

  res.json({
    updated: true,
    patient: {
      ...patient,
      allergies: patient.allergies ?? [],
      diseases: patient.diseases ?? [],
    },
  });
});

router.get("/patients/:patientId/emergency", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;
  const params = GetEmergencyDataParams.safeParse({ patientId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === params.data.patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.json(getPatientSummary(patient));
});

router.post("/patients/:patientId/emergency-override", async (req, res): Promise<void> => {
  const patientId = Array.isArray(req.params.patientId)
    ? req.params.patientId[0]
    : req.params.patientId;
  if (!patientId) {
    res.status(400).json({ error: "patientId is required" });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const body = req.body as { doctorId?: string; doctorName?: string; reason?: string };
  const doctorId = (body.doctorId ?? "").trim();
  const doctorName = (body.doctorName ?? "").trim();
  const reason = (body.reason ?? "Emergency override requested").trim();
  if (!doctorId || !doctorName) {
    res.status(400).json({ error: "doctorId and doctorName are required" });
    return;
  }

  const doctor = DEMO_DOCTORS[doctorId];
  if (!doctor || doctor.name.toLowerCase() !== doctorName.toLowerCase()) {
    res.status(403).json({ error: "Only authenticated doctors can use emergency override." });
    return;
  }

  const grantedAt = new Date();
  const expiresAt = new Date(grantedAt.getTime() + 60 * 60 * 1000);
  const session: EmergencyOverrideSession = {
    id: generateId(),
    patientId,
    doctorId,
    doctorName: doctor.name,
    reason,
    grantedAt: grantedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  EMERGENCY_OVERRIDE_SESSIONS.set(`${doctorId}:${patientId}`, session);

  AUDIT_LOGS.push({
    id: generateId(),
    patientId: patient.id,
    patientName: patient.name,
    doctorId,
    doctorName: doctor.name,
    reason: `Emergency override: ${reason}`,
    isEmergencyOverride: true,
    accessedAt: new Date(),
  } as AuditLogRow);
  saveStore();

  const records = MEDICAL_RECORDS
    .filter((record) => record.patientId === patientId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json({
    sessionId: session.id,
    grantedAt: session.grantedAt,
    expiresAt: session.expiresAt,
    patient: {
      ...patient,
      allergies: patient.allergies ?? [],
      diseases: patient.diseases ?? [],
    },
    records: records.map((record) => ({
      ...record,
      prescriptions: record.prescriptions ?? [],
    })),
  });
});

router.get("/patients/:patientId/emergency-override", async (req, res): Promise<void> => {
  const patientId = Array.isArray(req.params.patientId)
    ? req.params.patientId[0]
    : req.params.patientId;
  const doctorIdRaw = req.query.doctorId;
  const doctorId = Array.isArray(doctorIdRaw) ? doctorIdRaw[0] : doctorIdRaw;

  if (!patientId || !doctorId) {
    res.status(400).json({ error: "patientId and doctorId are required" });
    return;
  }

  const sessionKey = `${doctorId}:${patientId}`;
  const session = EMERGENCY_OVERRIDE_SESSIONS.get(sessionKey);
  if (!session) {
    res.status(404).json({ error: "No active emergency override session." });
    return;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    EMERGENCY_OVERRIDE_SESSIONS.delete(sessionKey);
    saveStore();
    res.status(403).json({ error: "Emergency override session expired." });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const records = MEDICAL_RECORDS
    .filter((record) => record.patientId === patientId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json({
    sessionId: session.id,
    grantedAt: session.grantedAt,
    expiresAt: session.expiresAt,
    patient: {
      ...patient,
      allergies: patient.allergies ?? [],
      diseases: patient.diseases ?? [],
    },
    records: records.map((record) => ({
      ...record,
      prescriptions: record.prescriptions ?? [],
    })),
  });
});

router.post("/patients/:patientId/full-access", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;
  const params = RequestFullAccessParams.safeParse({ patientId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = RequestFullAccessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === params.data.patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const { doctorId, doctorName, reason, isEmergencyOverride } = parsed.data;

  AUDIT_LOGS.push({
    id: generateId(),
    patientId: patient.id,
    patientName: patient.name,
    doctorId,
    doctorName,
    reason,
    isEmergencyOverride: isEmergencyOverride ?? false,
    accessedAt: new Date(),
  });
  saveStore();

  const records = MEDICAL_RECORDS.filter(
    (record) => record.patientId === params.data.patientId,
  );

  res.json({
    patient: { ...patient, allergies: patient.allergies ?? [], diseases: patient.diseases ?? [] },
    records: records.map((r) => ({ ...r, prescriptions: r.prescriptions ?? [] })),
    accessGrantedAt: new Date().toISOString(),
  });
});

router.post("/doctors/login", async (req, res): Promise<void> => {
  const body = req.body as {
    doctorId?: string;
    name?: string;
    password?: string;
  };
  const doctorId = (body.doctorId ?? "").trim();
  const doctorName = (body.name ?? "").trim();
  const passwordOrName = (body.password ?? "").trim();

  if (!doctorId || (!doctorName && !passwordOrName)) {
    res.status(400).json({ error: "doctorId and doctor name are required" });
    return;
  }

  const doctor = DEMO_DOCTORS[doctorId];

  const normalizedInputName = (doctorName || passwordOrName).toLowerCase();
  const normalizedDoctorName = doctor?.name.toLowerCase();
  const passwordMatch = doctor?.password === passwordOrName;
  const nameMatch = normalizedInputName === normalizedDoctorName;

  if (!doctor || (!nameMatch && !passwordMatch)) {
    res.status(401).json({ error: "Invalid doctor ID or doctor name" });
    return;
  }

  res.json({ doctorId, name: doctor.name, authenticated: true });
});

router.post("/patients/login", async (req, res): Promise<void> => {
  const body = req.body as { patientName?: string; password?: string };
  const patientName = (body.patientName ?? "").trim();
  const password = (body.password ?? "").trim();

  if (!patientName || !password) {
    res.status(400).json({ error: "patientName and password are required" });
    return;
  }

  const patient = PATIENTS.find((item) => item.name === patientName);

  if (!patient) {
    res.status(401).json({ error: "Invalid patient name or password" });
    return;
  }

  const storedPassword = PATIENT_PASSWORDS.get(patientName.toLowerCase());
  if (!storedPassword || storedPassword !== password) {
    res.status(401).json({ error: "Invalid patient name or password" });
    return;
  }

  res.json({
    patientId: patient.id,
    name: patient.name,
    authenticated: true,
  });
});

router.post("/records/request-access", async (req, res): Promise<void> => {
  const body = req.body as {
    patientId?: string;
    doctorId?: string;
    doctorName?: string;
  };
  const patientId = (body.patientId ?? "").trim();
  const doctorId = (body.doctorId ?? "").trim();
  const doctorName = (body.doctorName ?? "").trim();

  if (!patientId || !doctorId || !doctorName) {
    res.status(400).json({ error: "patientId, doctorId, and doctorName are required" });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const existing = ACCESS_REQUESTS.get(patientId) ?? [];
  const active = existing.find(
    (item) => item.doctorId === doctorId && item.status === "pending",
  );
  if (active) {
    res.json(active);
    return;
  }

  const request = {
    id: generateId(),
    patientId,
    doctorId,
    doctorName,
    status: "pending" as const,
    requestedAt: new Date().toISOString(),
  };
  ACCESS_REQUESTS.set(patientId, [request, ...existing]);
  saveStore();
  res.status(201).json(request);
});

router.get("/patients/:patientId/requests", async (req, res): Promise<void> => {
  const patientId = Array.isArray(req.params.patientId)
    ? req.params.patientId[0]
    : req.params.patientId;
  if (!patientId) {
    res.status(400).json({ error: "patientId is required" });
    return;
  }

  res.json(ACCESS_REQUESTS.get(patientId) ?? []);
});

router.post(
  "/patients/:patientId/requests/:requestId/respond",
  async (req, res): Promise<void> => {
    const patientId = Array.isArray(req.params.patientId)
      ? req.params.patientId[0]
      : req.params.patientId;
    const requestId = Array.isArray(req.params.requestId)
      ? req.params.requestId[0]
      : req.params.requestId;
    const approved = Boolean((req.body as { approved?: unknown })?.approved);

    if (!patientId || !requestId) {
      res.status(400).json({ error: "patientId and requestId are required" });
      return;
    }

    const current = ACCESS_REQUESTS.get(patientId) ?? [];
    const target = current.find((item) => item.id === requestId);
    if (!target) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    target.status = approved ? "approved" : "rejected";
    target.resolvedAt = new Date().toISOString();
    ACCESS_REQUESTS.set(patientId, [...current]);
    saveStore();

    res.json(target);
  },
);

router.post("/guardians/request", async (req, res): Promise<void> => {
  const body = req.body as {
    patientId?: string;
    guardianName?: string;
  };
  const patientId = (body.patientId ?? "").trim();
  const guardianName = (body.guardianName ?? "").trim();

  if (!patientId || !guardianName) {
    res.status(400).json({ error: "patientId and guardianName are required" });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const requests = GUARDIAN_REQUESTS.get(patientId) ?? [];
  const normalizedName = guardianName.toLowerCase();
  const existing = requests.find(
    (item) => item.guardianName.toLowerCase() === normalizedName && item.status === "pending",
  );
  if (existing) {
    res.json(existing);
    return;
  }

  const request: GuardianRequest = {
    id: generateId(),
    patientId,
    guardianName,
    status: "pending",
    requestedAt: new Date().toISOString(),
  };
  GUARDIAN_REQUESTS.set(patientId, [request, ...requests]);
  saveStore();
  res.status(201).json(request);
});

router.get("/patients/:patientId/guardian-requests", async (req, res): Promise<void> => {
  const patientId = Array.isArray(req.params.patientId)
    ? req.params.patientId[0]
    : req.params.patientId;
  const guardianNameRaw = req.query.guardianName;
  const guardianName = Array.isArray(guardianNameRaw) ? guardianNameRaw[0] : guardianNameRaw;

  if (!patientId) {
    res.status(400).json({ error: "patientId is required" });
    return;
  }

  const requests = GUARDIAN_REQUESTS.get(patientId) ?? [];
  if (!guardianName) {
    res.json(requests);
    return;
  }

  const normalized = guardianName.trim().toLowerCase();
  res.json(requests.filter((item) => item.guardianName.toLowerCase() === normalized));
});

router.post(
  "/patients/:patientId/guardian-requests/:requestId/respond",
  async (req, res): Promise<void> => {
    const patientId = Array.isArray(req.params.patientId)
      ? req.params.patientId[0]
      : req.params.patientId;
    const requestId = Array.isArray(req.params.requestId)
      ? req.params.requestId[0]
      : req.params.requestId;
    const approved = Boolean((req.body as { approved?: unknown })?.approved);

    if (!patientId || !requestId) {
      res.status(400).json({ error: "patientId and requestId are required" });
      return;
    }

    const requests = GUARDIAN_REQUESTS.get(patientId) ?? [];
    const target = requests.find((item) => item.id === requestId);
    if (!target) {
      res.status(404).json({ error: "Guardian request not found" });
      return;
    }

    target.status = approved ? "approved" : "rejected";
    target.resolvedAt = new Date().toISOString();
    GUARDIAN_REQUESTS.set(patientId, [...requests]);

    const approvedGuardians = APPROVED_GUARDIANS.get(patientId) ?? [];
    const normalizedTarget = target.guardianName.toLowerCase();
    const cleaned = approvedGuardians.filter(
      (item) => item.toLowerCase() !== normalizedTarget,
    );
    if (approved) {
      cleaned.push(target.guardianName);
    }
    APPROVED_GUARDIANS.set(patientId, cleaned);

    saveStore();
    res.json(target);
  },
);

router.get("/records/doctor-view/:patientId", async (req, res): Promise<void> => {
  const patientId = Array.isArray(req.params.patientId)
    ? req.params.patientId[0]
    : req.params.patientId;
  const doctorIdRaw = req.query.doctorId;
  const doctorId = Array.isArray(doctorIdRaw) ? doctorIdRaw[0] : doctorIdRaw;

  if (!patientId || !doctorId) {
    res.status(400).json({ error: "patientId and doctorId are required" });
    return;
  }

  const approved = (ACCESS_REQUESTS.get(patientId) ?? []).some(
    (item) => item.doctorId === doctorId && item.status === "approved",
  );
  if (!approved) {
    res.status(403).json({
      error: "Patient has not approved record access for this doctor.",
    });
    return;
  }

  const patient = PATIENTS.find((item) => item.id === patientId);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const records = MEDICAL_RECORDS
    .filter((record) => record.patientId === patientId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const responseRecords = await Promise.all(records.map((record) => toRecordResponse(record)));

  res.json({
    patient: {
      ...patient,
      allergies: patient.allergies ?? [],
      diseases: patient.diseases ?? [],
    },
    records: responseRecords,
  });
});

router.post("/records/summarize", async (req, res): Promise<void> => {
  const body = req.body as {
    title?: string;
    mimeType?: string;
    extractedText?: string | null;
    extractedHtml?: string | null;
    contentBase64?: string | null;
  };

  const title = (body.title ?? "Uploaded Record").trim() || "Uploaded Record";
  const mimeType = (body.mimeType ?? "").trim();
  const extractedText = typeof body.extractedText === "string" ? body.extractedText.trim() : "";
  const extractedHtml = typeof body.extractedHtml === "string" ? body.extractedHtml.trim() : "";
  const contentBase64Raw = typeof body.contentBase64 === "string" ? body.contentBase64 : "";
  const contentBase64 = contentBase64Raw
    ? (contentBase64Raw.includes(",") ? contentBase64Raw.split(",").pop() ?? "" : contentBase64Raw).trim()
    : "";
  let contentSource = extractedText || stripHtmlTags(extractedHtml);
  if (!contentSource && contentBase64) {
    const extractedFromFile = mimeType.toLowerCase().includes("pdf")
      ? await extractPdfTextFromBase64(contentBase64)
      : await extractReadableTextFromLabResults({
        contentBase64,
        mimeType,
        documentName: title,
      });
    contentSource = extractedFromFile ?? "";
  }
  const content = contentSource.slice(0, 12000);

  if (!content && !contentBase64) {
    res.status(400).json({ error: "No readable text available for summarization." });
    return;
  }

  if (!ai) {
    res.json({
      summary: buildFallbackRecordSummary(title, content),
      source: "fallback",
    });
    return;
  }

  try {
    const preferred = process.env.GEMINI_MODEL?.trim();
    const modelCandidates = [
      preferred,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ].filter((m, idx, arr): m is string => Boolean(m) && arr.indexOf(m as string) === idx);

    let result: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    let lastError: unknown = null;

    const prompt = `Summarize this medical record in plain language.

Requirements:
- Use short bullet points.
- Include: patient context clues, key findings, medicines/treatments, and risks/alerts.
- If any section is missing, say "Not mentioned".
- Keep it concise and safe for doctor/patient view.

Record title: ${title}
Record type: ${mimeType || "unknown"}

Record content:
${content}`;

    for (const model of modelCandidates) {
      try {
        result = await ai.models.generateContent({
          model,
          contents: [{
            role: "user",
            parts: content
              ? [{ text: prompt }]
              : [
                { text: `${prompt}\n\nNo extracted text was available. Read the attached file directly.` },
                {
                  inlineData: {
                    mimeType: mimeType || "application/octet-stream",
                    data: contentBase64,
                  },
                },
              ],
          }],
          config: {
            maxOutputTokens: 1024,
          },
        });
        break;
      } catch (error) {
        lastError = error;
        const status = (error as { status?: number } | null)?.status;
        if (status === 404 || status === 400 || status === 429 || status === 503) {
          continue;
        }
        throw error;
      }
    }

    if (!result) {
      throw lastError ?? new Error("No Gemini model succeeded.");
    }

    const summary = (result.text ?? "").trim() || buildFallbackRecordSummary(title, content || "No text extracted.");
    res.json({
      summary,
      source: "gemini",
    });
  } catch (error) {
    console.error("Gemini summary error:", error);
    res.json({
      summary: buildFallbackRecordSummary(title, content || "No text extracted."),
      source: "fallback",
    });
  }
});

router.post("/chatbot", async (req, res): Promise<void> => {
  const parsed = req.body as { query?: string; patientId?: string | null };
  const query = (parsed.query ?? "").trim();

  if (!query) {
    res.json({ response: "Please ask me something about patient health records.", matchedField: null });
    return;
  }

  try {
    let patientContext = "";

    if (parsed.patientId) {
      try {
        const p = PATIENTS.find((item) => item.id === parsed.patientId);
        if (p) {
          const records = MEDICAL_RECORDS.filter(
            (record) => record.patientId === parsed.patientId,
          );
          const allergies = (p.allergies ?? []).join(", ") || "None recorded";
          const diseases = (p.diseases ?? []).join(", ") || "None recorded";
          const allPrescriptions = records.flatMap((r) => r.prescriptions ?? []);
          const prescriptions = allPrescriptions.join(", ") || "None recorded";
          const doctors = [...new Set(records.map((r) => r.doctorName).filter(Boolean))].join(", ") || "None recorded";
          const hospitals = [...new Set(records.map((r) => r.hospitalName).filter(Boolean))].join(", ") || "None recorded";

          patientContext = `
PATIENT PROFILE:
- Name: ${p.name}
- Age: ${p.age} years
- Gender: ${p.gender}
- Blood Group: ${p.bloodGroup}
- Allergies: ${allergies}
- Medical Conditions: ${diseases}
- Emergency Contact: ${p.emergencyContact ?? "Not provided"}

MEDICAL RECORDS (${records.length} total):
${records.map((r) => `  - [${r.recordType}] ${r.title} - ${r.description ?? "No description"} (Date: ${r.visitDate ?? "Unknown"}, Doctor: ${r.doctorName ?? "Unknown"}, Hospital: ${r.hospitalName ?? "Unknown"})`).join("\n") || "  No records uploaded yet."}

PRESCRIPTIONS: ${prescriptions}
TREATING DOCTORS: ${doctors}
HOSPITALS VISITED: ${hospitals}
`;
        }
      } catch {
        patientContext = "";
      }
    }

    if (!ai) {
      res.json({
        response: `${buildFallbackChatResponse(query)} (Gemini key not configured.)`,
        matchedField: null,
      });
      return;
    }

    const systemPrompt = `You are HealthChain AI, a medical assistant integrated into a secure health records management system for India's healthcare system.

Your role is to help healthcare professionals and patients understand health records, interpret medical data, and answer health-related queries.

Guidelines:
- Be concise, accurate, and medically responsible
- When patient data is available, reference it specifically
- For general medical questions, provide helpful educational information
- Always recommend consulting a qualified doctor for diagnosis or treatment decisions
- Keep responses brief (2-4 sentences ideally) unless detail is needed
- Use plain language that patients can understand
- If asked about emergency situations, always advise to call emergency services first${patientContext ? `

You have access to the following patient data:
${patientContext}` : `

No specific patient is selected. Answer the question generally.`}`;

    const preferred = process.env.GEMINI_MODEL?.trim();
    const modelCandidates = [
      preferred,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ].filter((m, idx, arr): m is string => Boolean(m) && arr.indexOf(m as string) === idx);

    let result: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    let lastError: unknown = null;

    for (const model of modelCandidates) {
      try {
        result = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: query }] }],
          config: {
            systemInstruction: systemPrompt,
            maxOutputTokens: 8192,
          },
        });
        break;
      } catch (error) {
        lastError = error;
        const status = (error as { status?: number } | null)?.status;
        if (status === 404 || status === 400 || status === 429 || status === 503) {
          continue;
        }
        throw error;
      }
    }

    if (!result) {
      throw lastError ?? new Error("No Gemini model succeeded.");
    }

    const response = result.text ?? buildFallbackChatResponse(query);
    res.json({ response, matchedField: null });
  } catch (err) {
    console.error("Gemini chatbot error:", err);
    res.json({
      response: buildFallbackChatResponse(query),
      matchedField: null,
    });
  }
});

router.get("/audit-logs", async (_req, res): Promise<void> => {
  const logs = [...AUDIT_LOGS].sort(
    (a, b) => a.accessedAt.getTime() - b.accessedAt.getTime(),
  );
  res.json(logs);
});

router.get("/stats", async (_req, res): Promise<void> => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentAccessCount = AUDIT_LOGS.filter(
    (log) => log.accessedAt.getTime() >= oneDayAgo.getTime(),
  ).length;

  const result = GetStatsResponse.parse({
    totalPatients: PATIENTS.length,
    totalRecords: MEDICAL_RECORDS.length,
    totalAuditLogs: AUDIT_LOGS.length,
    recentAccessCount,
  });

  res.json(result);
});

export default router;
