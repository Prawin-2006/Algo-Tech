import { Router, type IRouter } from "express";
import QRCode from "qrcode";
import { db, patientsTable, medicalRecordsTable, auditLogsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
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
  DoctorLoginBody,
  GetStatsResponse,
} from "@workspace/api-zod";
import { encrypt, hashData, generateId, generatePatientId } from "../lib/crypto.js";

const router: IRouter = Router();

const DEMO_DOCTORS: Record<string, { name: string; password: string }> = {
  doctor1: { name: "Dr. Priya Sharma", password: "health123" },
  doctor2: { name: "Dr. Rajesh Kumar", password: "health123" },
  doctor3: { name: "Dr. Anitha Nair", password: "health123" },
};

router.get("/patients", async (_req, res): Promise<void> => {
  const patients = await db.select().from(patientsTable).orderBy(patientsTable.createdAt);
  res.json(patients.map(p => ({
    ...p,
    allergies: p.allergies ?? [],
    diseases: p.diseases ?? [],
  })));
});

router.post("/patients/register", async (req, res): Promise<void> => {
  const parsed = RegisterPatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, age, gender, phone, email, bloodGroup, allergies, diseases, emergencyContact } = parsed.data;

  const id = generatePatientId();
  const [patient] = await db.insert(patientsTable).values({
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
  }).returning();

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

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, params.data.patientId));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.json({ ...patient, allergies: patient.allergies ?? [], diseases: patient.diseases ?? [] });
});

router.get("/patients/:patientId/qr", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;
  const params = GetPatientQrParams.safeParse({ patientId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, params.data.patientId));
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

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, params.data.patientId));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const records = await db.select().from(medicalRecordsTable)
    .where(eq(medicalRecordsTable.patientId, params.data.patientId))
    .orderBy(medicalRecordsTable.createdAt);

  res.json(records.map(r => ({
    ...r,
    prescriptions: r.prescriptions ?? [],
  })));
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

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, params.data.patientId));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const { recordType, title, description, prescriptions, labResults, doctorName, hospitalName, visitDate } = parsed.data;

  const rawData = JSON.stringify({ recordType, title, description, prescriptions, labResults, doctorName, hospitalName, visitDate });
  const dataHash = hashData(rawData);
  const encryptedData = encrypt(rawData);

  const [record] = await db.insert(medicalRecordsTable).values({
    id: generateId(),
    patientId: params.data.patientId,
    recordType,
    title,
    description: description ?? null,
    prescriptions: prescriptions ?? [],
    labResults: labResults ?? null,
    doctorName: doctorName ?? null,
    hospitalName: hospitalName ?? null,
    visitDate: visitDate ?? null,
    encryptedData,
    dataHash,
  }).returning();

  res.status(201).json({ ...record, prescriptions: record.prescriptions ?? [] });
});

router.get("/patients/:patientId/emergency", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;
  const params = GetEmergencyDataParams.safeParse({ patientId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, params.data.patientId));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.json({
    patientId: patient.id,
    name: patient.name,
    bloodGroup: patient.bloodGroup,
    allergies: patient.allergies ?? [],
    diseases: patient.diseases ?? [],
    emergencyContact: patient.emergencyContact,
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

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, params.data.patientId));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const { doctorId, doctorName, reason, isEmergencyOverride } = parsed.data;

  await db.insert(auditLogsTable).values({
    id: generateId(),
    patientId: patient.id,
    patientName: patient.name,
    doctorId,
    doctorName,
    reason,
    isEmergencyOverride: isEmergencyOverride ?? false,
  });

  const records = await db.select().from(medicalRecordsTable)
    .where(eq(medicalRecordsTable.patientId, params.data.patientId));

  res.json({
    patient: { ...patient, allergies: patient.allergies ?? [], diseases: patient.diseases ?? [] },
    records: records.map(r => ({ ...r, prescriptions: r.prescriptions ?? [] })),
    accessGrantedAt: new Date().toISOString(),
  });
});

router.post("/doctors/login", async (req, res): Promise<void> => {
  const parsed = DoctorLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { doctorId, password } = parsed.data;
  const doctor = DEMO_DOCTORS[doctorId];

  if (!doctor || doctor.password !== password) {
    res.status(401).json({ error: "Invalid doctor ID or password" });
    return;
  }

  res.json({ doctorId, name: doctor.name, authenticated: true });
});

router.post("/chatbot", async (req, res): Promise<void> => {
  const parsed = req.body as { query?: string; patientId?: string | null };
  const query = (parsed.query ?? "").toLowerCase().trim();

  if (!query) {
    res.json({ response: "Please ask me something about patient health records.", matchedField: null });
    return;
  }

  let targetPatient: typeof patientsTable.$inferSelect | null = null;
  let records: typeof medicalRecordsTable.$inferSelect[] = [];

  if (parsed.patientId) {
    const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, parsed.patientId));
    if (p) {
      targetPatient = p;
      records = await db.select().from(medicalRecordsTable).where(eq(medicalRecordsTable.patientId, parsed.patientId));
    }
  }

  const keywordMap: Record<string, { field: string; extract: () => string }> = {
    allerg: {
      field: "allergies",
      extract: () => {
        if (targetPatient) {
          const list = targetPatient.allergies ?? [];
          return list.length ? `Patient ${targetPatient.name} has the following allergies: ${list.join(", ")}.` : `Patient ${targetPatient.name} has no recorded allergies.`;
        }
        return "Please specify a patient ID to query allergy information.";
      },
    },
    blood: {
      field: "bloodGroup",
      extract: () => {
        if (targetPatient) return `Patient ${targetPatient.name} has blood group: ${targetPatient.bloodGroup}.`;
        return "Please specify a patient ID to query blood group information.";
      },
    },
    disease: {
      field: "diseases",
      extract: () => {
        if (targetPatient) {
          const list = targetPatient.diseases ?? [];
          return list.length ? `Patient ${targetPatient.name} has the following conditions: ${list.join(", ")}.` : `No diseases recorded for ${targetPatient.name}.`;
        }
        return "Please specify a patient ID to query disease information.";
      },
    },
    condition: {
      field: "diseases",
      extract: () => {
        if (targetPatient) {
          const list = targetPatient.diseases ?? [];
          return list.length ? `Patient ${targetPatient.name} has the following conditions: ${list.join(", ")}.` : `No conditions recorded for ${targetPatient.name}.`;
        }
        return "Please specify a patient ID to query condition information.";
      },
    },
    medicine: {
      field: "prescriptions",
      extract: () => {
        if (records.length) {
          const allPrescriptions = records.flatMap(r => r.prescriptions ?? []);
          return allPrescriptions.length ? `Current prescriptions: ${allPrescriptions.join(", ")}.` : "No prescriptions found in records.";
        }
        return "Please specify a patient ID to query prescription information.";
      },
    },
    prescription: {
      field: "prescriptions",
      extract: () => {
        if (records.length) {
          const allPrescriptions = records.flatMap(r => r.prescriptions ?? []);
          return allPrescriptions.length ? `Current prescriptions: ${allPrescriptions.join(", ")}.` : "No prescriptions found in records.";
        }
        return "Please specify a patient ID to query prescription information.";
      },
    },
    doctor: {
      field: "doctorName",
      extract: () => {
        if (records.length) {
          const doctors = [...new Set(records.map(r => r.doctorName).filter(Boolean))];
          return doctors.length ? `Doctors who have treated this patient: ${doctors.join(", ")}.` : "No doctor information in records.";
        }
        return "Please specify a patient ID to query doctor information.";
      },
    },
    hospital: {
      field: "hospitalName",
      extract: () => {
        if (records.length) {
          const hospitals = [...new Set(records.map(r => r.hospitalName).filter(Boolean))];
          return hospitals.length ? `Hospitals visited: ${hospitals.join(", ")}.` : "No hospital information in records.";
        }
        return "Please specify a patient ID to query hospital information.";
      },
    },
    emergency: {
      field: "emergencyContact",
      extract: () => {
        if (targetPatient) return targetPatient.emergencyContact ? `Emergency contact: ${targetPatient.emergencyContact}.` : "No emergency contact recorded.";
        return "Please specify a patient ID to query emergency contact.";
      },
    },
    record: {
      field: "records",
      extract: () => {
        if (records.length) return `This patient has ${records.length} medical record(s): ${records.map(r => r.title).join(", ")}.`;
        return "Please specify a patient ID to query medical records.";
      },
    },
    age: {
      field: "age",
      extract: () => {
        if (targetPatient) return `Patient ${targetPatient.name} is ${targetPatient.age} years old.`;
        return "Please specify a patient ID to query age information.";
      },
    },
    help: {
      field: "help",
      extract: () => "I can answer questions about: allergies, blood group, diseases/conditions, medicines/prescriptions, doctors, hospitals, emergency contact, medical records, and patient age. Specify a patient ID for personalized answers.",
    },
  };

  for (const [keyword, handler] of Object.entries(keywordMap)) {
    if (query.includes(keyword)) {
      res.json({ response: handler.extract(), matchedField: handler.field });
      return;
    }
  }

  res.json({
    response: "No relevant data found for your query. Try asking about allergies, blood group, diseases, medicines, prescriptions, doctors, or hospitals.",
    matchedField: null,
  });
});

router.get("/audit-logs", async (_req, res): Promise<void> => {
  const logs = await db.select().from(auditLogsTable).orderBy(auditLogsTable.accessedAt);
  res.json(logs);
});

router.get("/stats", async (_req, res): Promise<void> => {
  const [[patientCount], [recordCount], [auditCount]] = await Promise.all([
    db.select({ count: count() }).from(patientsTable),
    db.select({ count: count() }).from(medicalRecordsTable),
    db.select({ count: count() }).from(auditLogsTable),
  ]);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentLogs = await db.select({ count: count() }).from(auditLogsTable);

  const result = GetStatsResponse.parse({
    totalPatients: patientCount?.count ?? 0,
    totalRecords: recordCount?.count ?? 0,
    totalAuditLogs: auditCount?.count ?? 0,
    recentAccessCount: recentLogs[0]?.count ?? 0,
  });

  res.json(result);
});

export default router;
